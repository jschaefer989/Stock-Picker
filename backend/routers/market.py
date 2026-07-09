"""
Market data router.

GET /api/market/quote/{ticker}   → basic price info
GET /api/market/sectors          → current YTD returns for all sector ETFs
GET /api/market/indexes          → current YTD returns for major US indexes
GET /api/market/stories          → latest market stories
GET /api/market/overview         → sectors + indexes + stories for market dashboard
"""
from fastapi import APIRouter, HTTPException
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from functools import lru_cache
import re
from typing import Any, Optional, cast
from xml.etree import ElementTree

import requests
import yfinance as yf  # type: ignore[import-untyped]
from pydantic import BaseModel

router = APIRouter()


class QuoteResponse(BaseModel):
    ticker: str
    name: str
    price: Optional[float]
    currency: Optional[str]
    ytd_return_pct: Optional[float]
    sector: Optional[str]
    asset_type: Optional[str]


class SectorETFReturn(BaseModel):
    sector: str
    etf_ticker: str
    ytd_return_pct: Optional[float]


class MarketIndexReturn(BaseModel):
    name: str
    symbol: str
    ytd_return_pct: Optional[float]
    price: Optional[float]


class MarketStory(BaseModel):
    id: str
    title: str
    source: Optional[str]
    summary: Optional[str]
    url: str
    published_at: Optional[str]
    tickers: list[str]
    sentiment_score: float


class MarketOverviewResponse(BaseModel):
    sectors: list[SectorETFReturn]
    indexes: list[MarketIndexReturn]
    stories: list[MarketStory]


SECTOR_ETFS = {
    "Technology": "VGT",
    "Healthcare": "VHT",
    "Industrials": "VIS",
    "Financial Services": "VFH",
    "Consumer Cyclical": "VCR",
    "Consumer Defensive": "VDC",
    "Energy": "VDE",
    "Basic Materials": "VAW",
    "Real Estate": "VNQ",
    "Communication Services": "VOX",
    "Utilities": "VPU",
}

NEWS_FEED_TICKERS = [
    "SPY", "QQQ", "DIA", "IWM", "VTI", "VGT", "VHT", "XLF", "XLE", "XLV", "VNQ",
]

MAJOR_INDEXES = {
    "S&P 500": "^GSPC",
    "NASDAQ Composite": "^IXIC",
    "Dow Jones": "^DJI",
    "Russell 2000": "^RUT",
}

POSITIVE_NEWS_KEYWORDS = {
    "beat", "beats", "upgrade", "upgraded", "buy", "bullish", "surge", "surges", "growth",
    "strong", "record", "expands", "expansion", "profit", "profits", "outperform", "outperforms",
    "rise", "rises", "higher", "gain", "gains", "booming", "new high", "tops",
}

NEGATIVE_NEWS_KEYWORDS = {
    "miss", "misses", "downgrade", "downgraded", "sell", "bearish", "drop", "drops", "decline",
    "weak", "lawsuit", "probe", "cuts", "cut", "slump", "warning", "risk", "risks",
    "fall", "falls", "lower", "softer", "shaky", "dip",
}

POSITIVE_NEWS_PHRASES = {
    "beats estimates",
    "raised guidance",
    "price target raised",
    "new high",
}

NEGATIVE_NEWS_PHRASES = {
    "misses estimates",
    "cuts guidance",
    "price target cut",
    "profit warning",
}


@lru_cache(maxsize=128)
def _quote(ticker: str) -> dict[str, Any]:
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        hist = t.history(period="ytd")
        ytd = None
        if not hist.empty:
            ytd = round(
                (hist["Close"].iloc[-1] - hist["Close"].iloc[0]) / hist["Close"].iloc[0] * 100, 2
            )
        return {
            "ticker": ticker,
            "name": info.get("shortName") or info.get("longName") or ticker,
            "price": info.get("regularMarketPrice") or info.get("currentPrice"),
            "currency": info.get("currency"),
            "ytd_return_pct": ytd,
            "sector": info.get("sector"),
            "asset_type": info.get("quoteType"),
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch data for {ticker}: {exc}")


def _headline_sentiment(*parts: str) -> float:
    txt = " ".join(p for p in parts if p).lower().strip()
    if not txt:
        return 0.0

    # Normalize punctuation and odd cp1252 artifacts seen in some feed titles.
    txt = txt.replace("â", "'")
    txt = re.sub(r"\s+", " ", txt)

    pos_hits = sum(1 for word in POSITIVE_NEWS_KEYWORDS if word in txt)
    neg_hits = sum(1 for word in NEGATIVE_NEWS_KEYWORDS if word in txt)

    pos_hits += sum(2 for phrase in POSITIVE_NEWS_PHRASES if phrase in txt)
    neg_hits += sum(2 for phrase in NEGATIVE_NEWS_PHRASES if phrase in txt)

    if pos_hits == 0 and neg_hits == 0:
        return 0.0
    denom = pos_hits + neg_hits
    if denom <= 0:
        return 0.0
    return max(-1.0, min(1.0, (pos_hits - neg_hits) / denom))


def _story_timestamp(item: dict[str, Any]) -> int:
    raw = item.get("providerPublishTime")
    if isinstance(raw, (int, float)):
        return int(raw)

    content = item.get("content")
    if isinstance(content, dict):
        pub_date = content.get("pubDate") or content.get("displayTime")
        if isinstance(pub_date, str) and pub_date.strip():
            try:
                dt = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                return int(dt.timestamp())
            except ValueError:
                return 0
    return 0


def _normalize_story(item: dict[str, Any], idx: int) -> MarketStory | None:
    content = item.get("content")
    content_dict = content if isinstance(content, dict) else {}

    title = str(item.get("title") or content_dict.get("title") or "").strip()
    if not title:
        return None

    click_through = content_dict.get("clickThroughUrl")
    canonical = content_dict.get("canonicalUrl")

    click_url = click_through.get("url") if isinstance(click_through, dict) else None
    canonical_url = canonical.get("url") if isinstance(canonical, dict) else None

    url = str(
        item.get("link")
        or item.get("url")
        or click_url
        or canonical_url
        or ""
    ).strip()
    if not url:
        return None

    ts = _story_timestamp(item)
    published_at = None
    if ts > 0:
        published_at = datetime.fromtimestamp(ts, UTC).isoformat()

    related = item.get("relatedTickers")
    tickers = [str(t).upper() for t in related] if isinstance(related, list) else []

    provider = content_dict.get("provider")
    provider_name = None
    if isinstance(provider, dict):
        provider_name = str(provider.get("displayName") or "").strip() or None

    summary = str(item.get("summary") or content_dict.get("summary") or content_dict.get("description") or "").strip() or None

    story_id = str(item.get("uuid") or item.get("id") or content_dict.get("id") or f"story-{idx}")

    return MarketStory(
        id=story_id,
        title=title,
        source=(str(item.get("publisher") or "").strip() or provider_name),
        summary=summary,
        url=url,
        published_at=published_at,
        tickers=tickers,
        sentiment_score=round(_headline_sentiment(title, summary or ""), 3),
    )


def _rss_stories() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for ticker in NEWS_FEED_TICKERS:
        url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
        try:
            resp = requests.get(url, timeout=5)
            resp.raise_for_status()
            root = ElementTree.fromstring(resp.content)
        except Exception:
            continue

        for item in root.findall("./channel/item")[:5]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            description = (item.findtext("description") or "").strip()

            if not title or not link:
                continue

            published_at = None
            provider_ts = 0
            if pub_date:
                try:
                    dt = parsedate_to_datetime(pub_date)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=UTC)
                    published_at = dt.astimezone(UTC).isoformat()
                    provider_ts = int(dt.timestamp())
                except Exception:
                    published_at = None

            results.append(
                {
                    "uuid": f"rss-{ticker}-{provider_ts}-{abs(hash(link))}",
                    "title": title,
                    "link": link,
                    "summary": description or None,
                    "publisher": "Yahoo Finance RSS",
                    "providerPublishTime": provider_ts,
                    "relatedTickers": [ticker],
                }
            )

    return results


@router.get("/quote/{ticker}", response_model=QuoteResponse)
def quote(ticker: str) -> QuoteResponse:
    ticker = ticker.upper()
    data = _quote(ticker)
    return QuoteResponse(**data)


@router.get("/sectors", response_model=list[SectorETFReturn])
def sector_returns() -> list[SectorETFReturn]:
    results = []
    for sector, etf in SECTOR_ETFS.items():
        try:
            data = _quote(etf)
            results.append(SectorETFReturn(sector=sector, etf_ticker=etf, ytd_return_pct=data["ytd_return_pct"]))
        except Exception:
            results.append(SectorETFReturn(sector=sector, etf_ticker=etf, ytd_return_pct=None))
    return results


@router.get("/indexes", response_model=list[MarketIndexReturn])
def index_returns() -> list[MarketIndexReturn]:
    results: list[MarketIndexReturn] = []
    for name, symbol in MAJOR_INDEXES.items():
        try:
            data = _quote(symbol)
            results.append(
                MarketIndexReturn(
                    name=name,
                    symbol=symbol,
                    ytd_return_pct=data["ytd_return_pct"],
                    price=data["price"],
                )
            )
        except Exception:
            results.append(
                MarketIndexReturn(
                    name=name,
                    symbol=symbol,
                    ytd_return_pct=None,
                    price=None,
                )
            )
    return results


@router.get("/stories", response_model=list[MarketStory])
def market_stories(limit: int = 15) -> list[MarketStory]:
    items: list[dict[str, Any]] = []
    for ticker in NEWS_FEED_TICKERS:
        try:
            t = yf.Ticker(ticker)
            feed = t.news or []
            if isinstance(feed, list):
                items.extend(cast(list[dict[str, Any]], feed[:10]))
        except Exception:
            continue

    # Fallback for environments where yfinance's news feed is empty.
    if not items:
        items.extend(_rss_stories())

    deduped: list[MarketStory] = []
    seen_urls: set[str] = set()
    sorted_items = sorted(items, key=_story_timestamp, reverse=True)
    for idx, raw in enumerate(sorted_items):
        story = _normalize_story(raw, idx)
        if story is None:
            continue
        if story.url in seen_urls:
            continue
        seen_urls.add(story.url)
        deduped.append(story)
        if len(deduped) >= max(1, min(limit, 50)):
            break

    return deduped


@router.get("/overview", response_model=MarketOverviewResponse)
def market_overview(limit: int = 15) -> MarketOverviewResponse:
    return MarketOverviewResponse(
        sectors=sector_returns(),
        indexes=index_returns(),
        stories=market_stories(limit=limit),
    )
