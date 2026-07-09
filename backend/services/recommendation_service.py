"""
Diversification recommendation service.

Strategy:
1. Identify sectors where the portfolio is underweight (< threshold).
2. Maintain a curated catalogue of diversifying ETFs / mutual funds / stocks per sector.
3. Fetch live YTD return from yfinance and surface that alongside the rationale.
4. Optionally pull a basic market-trend signal (sector ETF 3-month momentum)
   to rank suggestions by current relevance.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
import logging
import math
import re
from functools import lru_cache
from typing import Any, cast

import yfinance as yf  # type: ignore[import-untyped]

from models import PortfolioSummary, Recommendation, RecommendationResponse

logger = logging.getLogger(__name__)

# Threshold below which a sector is considered underweight
UNDERWEIGHT_THRESHOLD_PCT = 5.0
MAX_RECOMMENDATIONS_PER_SECTOR = 3
MIN_STOCK_RECOMMENDATIONS_PER_SECTOR = 1
MIN_RECOMMENDATION_SCORE = 0.5

POSITIVE_NEWS_KEYWORDS = {
    "beat", "beats", "upgrade", "upgraded", "buy", "bullish", "surge", "surges", "growth",
    "strong", "record", "expands", "expansion", "profit", "profits", "outperform", "outperforms",
}

NEGATIVE_NEWS_KEYWORDS = {
    "miss", "misses", "downgrade", "downgraded", "sell", "bearish", "drop", "drops", "decline",
    "weak", "lawsuit", "probe", "cuts", "cut", "slump", "warning", "risk", "risks",
}

POSITIVE_NEWS_PHRASES = {
    "raised guidance",
    "beats estimates",
    "earnings beat",
    "price target raised",
}

NEGATIVE_NEWS_PHRASES = {
    "not bullish",
    "cuts guidance",
    "misses estimates",
    "earnings miss",
    "price target cut",
}

# Catalogue: sector -> list of (ticker, name, category, rationale, [sectors])
SECTOR_CATALOGUE: dict[str, list[tuple[str, str, str, str, list[str]]]] = {
    "Technology": [
        ("QQQ", "Invesco QQQ Trust (Nasdaq-100)", "ETF", "Broad mega-cap tech exposure", ["Technology", "Communication Services"]),
        ("VGT", "Vanguard Information Technology ETF", "ETF", "Pure-play US IT sector", ["Technology"]),
        ("FTEC", "Fidelity MSCI Info Technology ETF", "ETF", "Low-cost US tech coverage", ["Technology"]),
        ("MSFT", "Microsoft Corporation", "Stock", "Large-cap software and cloud infrastructure leader", ["Technology"]),
        ("NVDA", "NVIDIA Corporation", "Stock", "Semiconductor and AI compute leader", ["Technology"]),
    ],
    "Healthcare": [
        ("VHT", "Vanguard Health Care ETF", "ETF", "Broad US healthcare sector", ["Healthcare"]),
        ("XLV", "Health Care Select Sector SPDR", "ETF", "S&P 500 healthcare companies", ["Healthcare"]),
        ("FSMEX", "Fidelity Select Medical Technology", "Mutual Fund", "Medical devices & equipment focus", ["Healthcare"]),
        ("LLY", "Eli Lilly and Company", "Stock", "Pharma leader with strong innovation pipeline", ["Healthcare"]),
        ("UNH", "UnitedHealth Group Incorporated", "Stock", "Diversified healthcare services and insurance", ["Healthcare"]),
    ],
    "Industrials": [
        ("VIS", "Vanguard Industrials ETF", "ETF", "Diversified US industrials", ["Industrials"]),
        ("XLI", "Industrial Select Sector SPDR", "ETF", "S&P 500 industrials", ["Industrials"]),
        ("GE", "GE Aerospace", "Stock", "Aerospace and defense cyclicals exposure", ["Industrials"]),
        ("CAT", "Caterpillar Inc.", "Stock", "Global heavy equipment and infrastructure cycle", ["Industrials"]),
    ],
    "Financial Services": [
        ("VFH", "Vanguard Financials ETF", "ETF", "Banks, insurance & diversified financials", ["Financial Services"]),
        ("XLF", "Financial Select Sector SPDR", "ETF", "S&P 500 financials", ["Financial Services"]),
        ("JPM", "JPMorgan Chase & Co.", "Stock", "Large diversified US bank", ["Financial Services"]),
        ("BRK-B", "Berkshire Hathaway Inc. Class B", "Stock", "Diversified financial and insurance conglomerate", ["Financial Services"]),
    ],
    "Consumer Cyclical": [
        ("VCR", "Vanguard Consumer Discretionary ETF", "ETF", "US consumer discretionary sector", ["Consumer Cyclical"]),
        ("XLY", "Consumer Discretionary Select Sector SPDR", "ETF", "S&P 500 consumer discretionary", ["Consumer Cyclical"]),
        ("AMZN", "Amazon.com, Inc.", "Stock", "E-commerce and consumer cloud demand proxy", ["Consumer Cyclical"]),
        ("TSLA", "Tesla, Inc.", "Stock", "High-beta discretionary growth exposure", ["Consumer Cyclical"]),
    ],
    "Consumer Defensive": [
        ("VDC", "Vanguard Consumer Staples ETF", "ETF", "Defensive consumer staples", ["Consumer Defensive"]),
        ("XLP", "Consumer Staples Select Sector SPDR", "ETF", "S&P 500 staples", ["Consumer Defensive"]),
        ("PG", "The Procter & Gamble Company", "Stock", "Global staples brand portfolio", ["Consumer Defensive"]),
        ("KO", "The Coca-Cola Company", "Stock", "Defensive beverage cash-flow profile", ["Consumer Defensive"]),
    ],
    "Energy": [
        ("VDE", "Vanguard Energy ETF", "ETF", "US energy producers & services", ["Energy"]),
        ("XLE", "Energy Select Sector SPDR", "ETF", "S&P 500 energy companies", ["Energy"]),
        ("FSENX", "Fidelity Select Energy", "Mutual Fund", "Active energy sector fund", ["Energy"]),
        ("XOM", "Exxon Mobil Corporation", "Stock", "Integrated energy major", ["Energy"]),
        ("CVX", "Chevron Corporation", "Stock", "Integrated energy with dividend profile", ["Energy"]),
    ],
    "Basic Materials": [
        ("VAW", "Vanguard Materials ETF", "ETF", "US materials sector", ["Basic Materials"]),
        ("XLB", "Materials Select Sector SPDR", "ETF", "S&P 500 materials", ["Basic Materials"]),
        ("LIN", "Linde plc", "Stock", "Industrial gases and defensive materials exposure", ["Basic Materials"]),
        ("NEM", "Newmont Corporation", "Stock", "Precious metals and commodity-cycle exposure", ["Basic Materials"]),
    ],
    "Real Estate": [
        ("VNQ", "Vanguard Real Estate ETF", "ETF", "US REITs & real estate", ["Real Estate"]),
        ("SCHH", "Schwab US REIT ETF", "ETF", "Low-cost US REIT exposure", ["Real Estate"]),
        ("PLD", "Prologis, Inc.", "Stock", "Industrial REIT with logistics focus", ["Real Estate"]),
        ("AMT", "American Tower Corporation", "Stock", "Communications infrastructure REIT", ["Real Estate"]),
    ],
    "Communication Services": [
        ("VOX", "Vanguard Communication Services ETF", "ETF", "US telecom & media", ["Communication Services"]),
        ("XLC", "Communication Services Select Sector SPDR", "ETF", "S&P 500 communications", ["Communication Services"]),
        ("GOOGL", "Alphabet Inc. Class A", "Stock", "Digital advertising and platform exposure", ["Communication Services"]),
        ("META", "Meta Platforms, Inc.", "Stock", "Social platforms and digital ad exposure", ["Communication Services"]),
    ],
    "Utilities": [
        ("VPU", "Vanguard Utilities ETF", "ETF", "US regulated utilities", ["Utilities"]),
        ("XLU", "Utilities Select Sector SPDR", "ETF", "S&P 500 utilities", ["Utilities"]),
        ("NEE", "NextEra Energy, Inc.", "Stock", "Regulated utility and renewables blend", ["Utilities"]),
        ("DUK", "Duke Energy Corporation", "Stock", "Large-cap regulated electric utility", ["Utilities"]),
    ],
    "International": [
        ("VXUS", "Vanguard Total International Stock ETF", "ETF", "Broad ex-US diversification", ["Technology", "Financial Services", "Consumer Cyclical", "Healthcare", "Industrials"]),
        ("EFA", "iShares MSCI EAFE ETF", "ETF", "Developed markets ex-US", ["Technology", "Financial Services", "Industrials"]),
        ("VWO", "Vanguard FTSE Emerging Markets ETF", "ETF", "Emerging market growth exposure", ["Technology", "Consumer Cyclical", "Financial Services"]),
        ("TSM", "Taiwan Semiconductor Manufacturing Co.", "Stock", "Global semiconductor manufacturing exposure", ["International", "Technology"]),
        ("BABA", "Alibaba Group Holding Limited", "Stock", "Large-cap emerging market internet exposure", ["International", "Consumer Cyclical"]),
    ],
    "Bonds / Fixed Income": [
        ("BND", "Vanguard Total Bond Market ETF", "ETF", "Broad US investment-grade bonds", ["Bonds / Fixed Income"]),
        ("AGG", "iShares Core US Aggregate Bond ETF", "ETF", "Core US bond market", ["Bonds / Fixed Income"]),
        ("VTIP", "Vanguard Short-Term Inflation-Protected Securities ETF", "ETF", "Inflation-protected bonds", ["Bonds / Fixed Income"]),
    ],
}


@lru_cache(maxsize=256)
def _ticker_info(ticker: str) -> dict[str, Any]:
    try:
        return cast(dict[str, Any], yf.Ticker(ticker).info or {})
    except Exception:
        return {}


@lru_cache(maxsize=256)
def _three_month_momentum(ticker: str) -> float:
    """Return 3-month momentum as decimal return (e.g. 0.12 for +12%)."""
    try:
        hist = yf.Ticker(ticker).history(period="3mo")
        if hist.empty:
            return 0.0
        end = float(cast(float, hist["Close"].iloc[-1]))
        start = float(cast(float, hist["Close"].iloc[0]))
        if start <= 0:
            return 0.0
        return (end - start) / start
    except Exception:
        return 0.0


@lru_cache(maxsize=256)
def _avg_dollar_volume_3m(ticker: str) -> float:
    """Average daily dollar volume over 3 months as a liquidity proxy."""
    try:
        hist = yf.Ticker(ticker).history(period="3mo")
        if hist.empty:
            return 0.0
        close_series = hist["Close"]
        volume_series = hist["Volume"]
        count = min(len(close_series), len(volume_series))
        if count == 0:
            return 0.0

        total = 0.0
        for i in range(count):
            close_i = float(cast(float, close_series.iloc[i]))
            volume_i = float(cast(float, volume_series.iloc[i]))
            total += close_i * volume_i
        return total / count
    except Exception:
        return 0.0


@lru_cache(maxsize=256)
def _expense_ratio(ticker: str) -> float | None:
    """Return expense ratio as decimal (e.g. 0.002 for 0.20%) when available."""
    info = _ticker_info(ticker)
    for key in ("annualReportExpenseRatio", "expenseRatio"):
        raw = info.get(key)
        if isinstance(raw, (int, float)):
            val = float(raw)
            if val >= 0:
                return val
    return None


@lru_cache(maxsize=256)
def _news_signal(ticker: str) -> tuple[float, int]:
    """Return a normalized sentiment score in [-1, 1] and story count."""
    try:
        items = cast(list[dict[str, Any]], yf.Ticker(ticker).news or [])
    except Exception:
        items = []

    if not items:
        return 0.0, 0

    score_total = 0.0
    scored_items = 0
    for item in items[:12]:
        content = item.get("content")
        content_dict = content if isinstance(content, dict) else {}

        title = str(item.get("title") or content_dict.get("title") or "")
        summary = str(item.get("summary") or content_dict.get("summary") or "")
        description = str(content_dict.get("description") or "")

        # Basic cleanup for html snippets in some feeds.
        description = re.sub(r"<[^>]+>", " ", description)

        text = " ".join([title, summary, description]).lower().strip()
        if not text:
            continue

        pos_hits = sum(1 for word in POSITIVE_NEWS_KEYWORDS if word in text)
        neg_hits = sum(1 for word in NEGATIVE_NEWS_KEYWORDS if word in text)

        pos_hits += sum(2 for phrase in POSITIVE_NEWS_PHRASES if phrase in text)
        neg_hits += sum(2 for phrase in NEGATIVE_NEWS_PHRASES if phrase in text)

        if pos_hits == 0 and neg_hits == 0:
            continue
        denom = pos_hits + neg_hits
        if denom <= 0:
            continue
        scored_items += 1
        score_total += (pos_hits - neg_hits) / denom

    if scored_items == 0:
        return 0.0, min(len(items), 12)

    avg_score = max(-1.0, min(1.0, score_total / scored_items))
    return avg_score, min(len(items), 12)


def _extract_next_earnings_date(raw_calendar: Any) -> date | None:
    if raw_calendar is None:
        return None

    # yfinance calendar can be a dict-like, DataFrame-like, or scalar object.
    if isinstance(raw_calendar, dict):
        for key in ("Earnings Date", "EarningsDate", "earningsDate"):
            if key in raw_calendar:
                return _extract_next_earnings_date(raw_calendar.get(key))

    if isinstance(raw_calendar, (list, tuple)):
        for val in raw_calendar:
            parsed = _extract_next_earnings_date(val)
            if parsed is not None:
                return parsed
        return None

    # Try pandas-like values without importing pandas directly.
    if hasattr(raw_calendar, "iloc"):
        try:
            first_val = raw_calendar.iloc[0]  # type: ignore[attr-defined]
            return _extract_next_earnings_date(first_val)
        except Exception:
            return None

    if isinstance(raw_calendar, datetime):
        return raw_calendar.date()

    if isinstance(raw_calendar, date):
        return raw_calendar

    if isinstance(raw_calendar, str):
        txt = raw_calendar.strip()
        if not txt:
            return None
        for parser in (datetime.fromisoformat,):
            try:
                return parser(txt).date()
            except ValueError:
                continue
        return None

    return None


@lru_cache(maxsize=256)
def _next_earnings_date(ticker: str) -> date | None:
    try:
        t = yf.Ticker(ticker)
        calendar = getattr(t, "calendar", None)
        return _extract_next_earnings_date(calendar)
    except Exception:
        return None


def _earnings_signal(ticker: str, category: str) -> tuple[float, date | None, int | None]:
    """Return proximity bonus and next earnings details for stocks only."""
    if category != "Stock":
        return 0.0, None, None

    next_date = _next_earnings_date(ticker)
    if next_date is None:
        return 0.0, None, None

    days_to = (next_date - datetime.now(UTC).date()).days
    if days_to < 0:
        return 0.0, next_date, days_to
    if days_to <= 21:
        return (21 - days_to) / 21.0, next_date, days_to
    if days_to <= 45:
        return (45 - days_to) / 90.0, next_date, days_to
    return 0.0, next_date, days_to


@lru_cache(maxsize=256)
def _candidate_components(
    ticker: str,
    category: str,
) -> tuple[float, float, float, float, float | None, float, float, int, str | None, int | None, float]:
    """
    Return score components as:
    (
        composite_score,
        momentum_3m_pct,
        avg_dollar_volume_3m,
        liquidity_log10,
        expense_ratio_pct,
        expense_penalty,
        news_sentiment_score,
        news_story_count,
        next_earnings_date,
        days_to_next_earnings,
        earnings_proximity_bonus,
    )
    """
    momentum_pct = _three_month_momentum(ticker) * 100.0
    avg_dollar_volume = _avg_dollar_volume_3m(ticker)
    liquidity_log10 = math.log10(avg_dollar_volume + 1.0)
    expense = _expense_ratio(ticker)
    expense_pct = (expense * 100.0) if expense is not None else None
    expense_penalty = expense_pct if expense_pct is not None else 0.25
    news_sentiment_score, news_story_count = _news_signal(ticker)
    earnings_bonus, next_earnings_date, days_to_next_earnings = _earnings_signal(ticker, category)

    score = (
        (0.62 * momentum_pct)
        + (0.30 * liquidity_log10)
        - (0.45 * expense_penalty)
        + (2.2 * news_sentiment_score)
        + (1.8 * earnings_bonus)
    )

    return (
        score,
        momentum_pct,
        avg_dollar_volume,
        liquidity_log10,
        expense_pct,
        expense_penalty,
        news_sentiment_score,
        news_story_count,
        next_earnings_date.isoformat() if next_earnings_date is not None else None,
        days_to_next_earnings,
        earnings_bonus,
    )


@lru_cache(maxsize=128)
def _ytd_return(ticker: str) -> float | None:
    """Fetch approximate YTD return (%) from yfinance."""
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="ytd")
        if hist.empty:
            return None
        start = float(cast(float, hist["Close"].iloc[0]))
        end = float(cast(float, hist["Close"].iloc[-1]))
        return round((end - start) / start * 100, 2)
    except Exception:
        return None


def _sector_momentum(sector: str) -> float:
    """
    Return a simple 3-month momentum score for the sector using its primary ETF.
    Higher is better; used to order recommendations within a sector.
    """
    primary_etf = {
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
    }.get(sector)
    if not primary_etf:
        return 0.0
    try:
        t = yf.Ticker(primary_etf)
        hist = t.history(period="3mo")
        if hist.empty:
            return 0.0
        end = float(cast(float, hist["Close"].iloc[-1]))
        start = float(cast(float, hist["Close"].iloc[0]))
        return (end - start) / start
    except Exception:
        return 0.0


def generate_recommendations(summary: PortfolioSummary) -> RecommendationResponse:
    """
    Given a PortfolioSummary, identify underweight sectors and surface
    targeted fund and stock recommendations.
    """
    present_sectors = {sw.sector: sw.weight_pct for sw in summary.sector_weights}
    all_expected = list(SECTOR_CATALOGUE.keys())

    underweight: list[str] = []
    for sector in all_expected:
        pct = present_sectors.get(sector, 0.0)
        if pct < UNDERWEIGHT_THRESHOLD_PCT:
            underweight.append(sector)

    # Sort underweight sectors by current market momentum (descending) so the
    # most opportunistic sectors appear first
    underweight.sort(key=lambda s: -_sector_momentum(s))

    recommendations: list[Recommendation] = []
    seen_tickers: set[str] = set()

    for sector in underweight:
        candidates = SECTOR_CATALOGUE.get(sector, [])
        ranked_candidates = sorted(
            candidates,
            key=lambda item: _candidate_components(item[0], item[2])[0],
            reverse=True,
        )

        # Apply minimum score threshold for all candidate picks.
        eligible_candidates = [
            item for item in ranked_candidates
            if _candidate_components(item[0], item[2])[0] >= MIN_RECOMMENDATION_SCORE
        ]

        eligible_stock_candidates = [
            item for item in eligible_candidates
            if item[2] == "Stock"
        ]

        eligible_fund_candidates = [
            item for item in eligible_candidates
            if item[2] != "Stock"
        ]

        def add_candidate(
            ticker: str,
            name: str,
            category: str,
            rationale: str,
            sectors: list[str],
        ) -> bool:
            if ticker in seen_tickers:
                return False
            seen_tickers.add(ticker)
            ytd = _ytd_return(ticker)
            (
                score,
                momentum_pct,
                avg_dollar_volume,
                liquidity_log10,
                expense_pct,
                expense_penalty,
                news_sentiment_score,
                news_story_count,
                next_earnings_date,
                days_to_next_earnings,
                earnings_proximity_bonus,
            ) = _candidate_components(ticker, category)
            recommendations.append(
                Recommendation(
                    ticker=ticker,
                    name=name,
                    category=category,
                    rationale=rationale,
                    sectors_covered=sectors,
                    ytd_return_pct=ytd,
                    ranking_score=round(score, 3),
                    momentum_3m_pct=round(momentum_pct, 2),
                    avg_dollar_volume_3m=round(avg_dollar_volume, 2),
                    liquidity_log10=round(liquidity_log10, 3),
                    expense_ratio_pct=round(expense_pct, 3) if expense_pct is not None else None,
                    expense_penalty=round(expense_penalty, 3),
                    news_sentiment_score=round(news_sentiment_score, 3),
                    news_story_count=news_story_count,
                    next_earnings_date=next_earnings_date,
                    days_to_next_earnings=days_to_next_earnings,
                    earnings_proximity_bonus=round(earnings_proximity_bonus, 3),
                )
            )
            return True

        added_for_sector = 0

        # Include stock recommendations only when they pass minimum score.
        stocks_to_add = min(
            MIN_STOCK_RECOMMENDATIONS_PER_SECTOR,
            len(eligible_stock_candidates),
        )

        for idx in range(stocks_to_add):
            ticker, name, category, rationale, sectors = eligible_stock_candidates[idx]
            if added_for_sector >= MAX_RECOMMENDATIONS_PER_SECTOR:
                break
            if add_candidate(ticker, name, category, rationale, sectors):
                added_for_sector += 1

        # Fill remaining slots with highest-scoring eligible candidates.
        # If no stock met threshold, this naturally falls back to funds-only.
        for ticker, name, category, rationale, sectors in eligible_candidates:
            if added_for_sector >= MAX_RECOMMENDATIONS_PER_SECTOR:
                break
            if add_candidate(ticker, name, category, rationale, sectors):
                added_for_sector += 1

    return RecommendationResponse(
        underweight_sectors=underweight,
        recommendations=recommendations,
    )
