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
from typing import Any, Literal, cast

import yfinance as yf  # type: ignore[import-untyped]

from models import PortfolioSummary, Recommendation, RecommendationPageResponse, RecommendationResponse

logger = logging.getLogger(__name__)

# Threshold below which a sector is considered underweight
UNDERWEIGHT_THRESHOLD_PCT = 5.0
MAX_RECOMMENDATIONS_PER_SECTOR = 3
MIN_STOCK_RECOMMENDATIONS_PER_SECTOR = 1
MIN_RECOMMENDATION_SCORE = 0.5
MAX_OPPORTUNISTIC_RECOMMENDATIONS = 6
MIN_OPPORTUNISTIC_BASE_SCORE = 2.0
MIN_OPPORTUNISTIC_TOTAL_SCORE = 3.5

DYNAMIC_OPPORTUNISTIC_FUNDS: list[tuple[str, str, str]] = [
    ("QQQ", "Technology", "Nasdaq leaders"),
    ("VGT", "Technology", "technology leaders"),
    ("SOXX", "Technology", "semiconductor leaders"),
    ("SMH", "Technology", "chip equipment leaders"),
    ("VHT", "Healthcare", "healthcare leaders"),
    ("VDE", "Energy", "energy leaders"),
    ("VFH", "Financial Services", "financial leaders"),
    ("VIS", "Industrials", "industrial leaders"),
]

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
def _current_price(ticker: str) -> float | None:
    """Return the latest available market price for a ticker."""
    info = _ticker_info(ticker)
    for key in ("regularMarketPrice", "currentPrice", "previousClose"):
        raw = info.get(key)
        if isinstance(raw, (int, float)):
            price = float(raw)
            if price > 0:
                return price

    try:
        hist = yf.Ticker(ticker).history(period="5d")
        if hist.empty:
            return None
        close = hist["Close"].iloc[-1]
        if isinstance(close, (int, float)) and float(close) > 0:
            return float(close)
    except Exception:
        return None
    return None


@lru_cache(maxsize=128)
def _fund_top_holdings(ticker: str) -> list[tuple[str, str, float]]:
    """Return top holdings for a fund as (symbol, name, weight_0_to_1)."""
    try:
        top = yf.Ticker(ticker).funds_data.top_holdings
        if top is None or not hasattr(top, "iterrows"):
            return []

        rows: list[tuple[str, str, float]] = []
        for symbol, row in top.iterrows():
            if not isinstance(symbol, str) or not symbol:
                continue

            name_raw = row.get("Name") if hasattr(row, "get") else None
            raw_pct = row.get("Holding Percent") if hasattr(row, "get") else None

            if raw_pct is None and hasattr(row, "items"):
                for _, value in row.items():
                    if isinstance(value, (int, float)):
                        raw_pct = value
                        break

            if not isinstance(raw_pct, (int, float)):
                continue

            pct = float(raw_pct)
            if pct > 1.0:
                pct /= 100.0
            if pct <= 0:
                continue

            name = name_raw if isinstance(name_raw, str) and name_raw else symbol
            rows.append((symbol.upper(), name, min(pct, 1.0)))

        return rows
    except Exception:
        return []


def _dynamic_opportunistic_candidates() -> list[tuple[str, str, str, str, list[str], int]]:
    """Build dynamic stock candidates from live fund constituents."""
    aggregated: dict[str, dict[str, Any]] = {}

    for fund_ticker, fallback_sector, theme_label in DYNAMIC_OPPORTUNISTIC_FUNDS:
        for symbol, name, weight in _fund_top_holdings(fund_ticker)[:10]:
            entry = aggregated.get(symbol)
            if entry is None:
                entry = {
                    "name": name,
                    "weight": 0.0,
                    "funds": set(),
                    "sectors": {fallback_sector},
                    "themes": set(),
                }
                aggregated[symbol] = entry

            entry["weight"] += weight
            entry["funds"].add(fund_ticker)
            entry["themes"].add(theme_label)

            info = _ticker_info(symbol)
            sector = info.get("sector")
            if isinstance(sector, str) and sector:
                entry["sectors"].add(sector)

    candidates: list[tuple[str, str, str, str, list[str], int]] = []
    for symbol, entry in aggregated.items():
        fund_count = len(cast(set[str], entry["funds"]))
        if fund_count <= 0:
            continue

        sectors = sorted(cast(set[str], entry["sectors"]))
        themes = sorted(cast(set[str], entry["themes"]))
        rationale = (
            f"Dynamic market-leadership candidate appearing across {fund_count} tracked funds "
            f"({', '.join(sorted(cast(set[str], entry['funds']))[:3])}) with support from {', '.join(themes[:2])}."
        )
        candidates.append((
            symbol,
            cast(str, entry["name"]),
            "Stock",
            rationale,
            sectors or ["Technology"],
            fund_count,
        ))

    return candidates


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
            first_val = raw_calendar.iloc[0]
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


def _build_recommendation_payload(
    ticker: str,
    name: str,
    category: str,
    rationale: str,
    sectors: list[str],
    score_adjustment: float = 0.0,
    rationale_override: str | None = None,
    ) -> Recommendation:
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
    return Recommendation(
        ticker=ticker,
        name=name,
        category=category,
        rationale=rationale_override or rationale,
        sectors_covered=sectors,
        current_price=_current_price(ticker),
        ytd_return_pct=ytd,
        ranking_score=round(score + score_adjustment, 3),
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
    opportunistic_recommendations: list[Recommendation] = []
    seen_tickers: set[str] = set()

    def build_recommendation(
        ticker: str,
        name: str,
        category: str,
        rationale: str,
        sectors: list[str],
        score_adjustment: float = 0.0,
        rationale_override: str | None = None,
    ) -> Recommendation:
        return _build_recommendation_payload(
            ticker,
            name,
            category,
            rationale,
            sectors,
            score_adjustment=score_adjustment,
            rationale_override=rationale_override,
        )

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
            recommendations.append(build_recommendation(ticker, name, category, rationale, sectors))
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

    # Opportunistic picks: include strong trend/news/performance setups even if
    # the sector is not underweight.
    seen_opportunistic: set[str] = set()
    opportunistic_pool: list[tuple[int, float, Recommendation]] = []
    for sector, candidates in SECTOR_CATALOGUE.items():
        sector_momentum_pct = _sector_momentum(sector) * 100.0
        for ticker, name, category, rationale, sectors in candidates:
            if ticker in seen_tickers or ticker in seen_opportunistic:
                continue

            (
                base_score,
                _momentum_pct,
                _avg_dollar_volume,
                _liquidity_log10,
                _expense_pct,
                _expense_penalty,
                news_sentiment_score,
                _news_story_count,
                _next_earnings_date,
                _days_to_next_earnings,
                _earnings_proximity_bonus,
            ) = _candidate_components(ticker, category)

            if base_score < MIN_OPPORTUNISTIC_BASE_SCORE:
                continue

            ytd = _ytd_return(ticker)
            ytd_pct = ytd if ytd is not None else 0.0

            opportunistic_boost = (0.28 * sector_momentum_pct) + (0.08 * ytd_pct)
            total_score = base_score + opportunistic_boost

            if total_score < MIN_OPPORTUNISTIC_TOTAL_SCORE:
                continue

            sentiment_label = (
                "positive" if news_sentiment_score > 0.2 else
                "negative" if news_sentiment_score < -0.2 else
                "mixed"
            )
            rationale_override = (
                f"{rationale}. Opportunistic tailwinds: {sector} sector 3M trend "
                f"{sector_momentum_pct:+.1f}%, YTD {ytd_pct:+.1f}%, news tone {sentiment_label}."
            )

            rec = build_recommendation(
                ticker=ticker,
                name=name,
                category=category,
                rationale=rationale,
                sectors=sectors,
                score_adjustment=opportunistic_boost,
                rationale_override=rationale_override,
            )

            # Prioritize opportunities outside underweight sectors first.
            non_underweight_priority = 1
            if any(sec in underweight for sec in sectors):
                non_underweight_priority = 0

            opportunistic_pool.append((non_underweight_priority, total_score, rec))
            seen_opportunistic.add(ticker)

    # Partially dynamic layer: add market-leading stocks from live fund constituents.
    for ticker, name, category, rationale, sectors, fund_count in _dynamic_opportunistic_candidates():
        if ticker in seen_tickers or ticker in seen_opportunistic:
            continue

        (
            base_score,
            _momentum_pct,
            _avg_dollar_volume,
            _liquidity_log10,
            _expense_pct,
            _expense_penalty,
            news_sentiment_score,
            _news_story_count,
            _next_earnings_date,
            _days_to_next_earnings,
            _earnings_proximity_bonus,
        ) = _candidate_components(ticker, category)

        ytd = _ytd_return(ticker)
        ytd_pct = ytd if ytd is not None else 0.0
        lead_sector = sectors[0] if sectors else "Technology"
        sector_momentum_pct = _sector_momentum(lead_sector) * 100.0
        fund_support_bonus = 0.85 * fund_count
        opportunistic_boost = (0.28 * sector_momentum_pct) + (0.08 * ytd_pct) + fund_support_bonus
        total_score = base_score + opportunistic_boost

        if base_score < MIN_OPPORTUNISTIC_BASE_SCORE or total_score < MIN_OPPORTUNISTIC_TOTAL_SCORE:
            continue

        sentiment_label = (
            "positive" if news_sentiment_score > 0.2 else
            "negative" if news_sentiment_score < -0.2 else
            "mixed"
        )
        rationale_override = (
            f"{rationale} Opportunistic tailwinds: {lead_sector} sector 3M trend {sector_momentum_pct:+.1f}%, "
            f"YTD {ytd_pct:+.1f}%, news tone {sentiment_label}."
        )

        rec = build_recommendation(
            ticker=ticker,
            name=name,
            category=category,
            rationale=rationale,
            sectors=sectors,
            score_adjustment=opportunistic_boost,
            rationale_override=rationale_override,
        )

        non_underweight_priority = 1
        if any(sec in underweight for sec in sectors):
            non_underweight_priority = 0

        opportunistic_pool.append((non_underweight_priority, total_score, rec))
        seen_opportunistic.add(ticker)

    opportunistic_pool.sort(key=lambda row: (-row[0], -row[1]))
    opportunistic_recommendations = [rec for _, _, rec in opportunistic_pool[:MAX_OPPORTUNISTIC_RECOMMENDATIONS]]

    return RecommendationResponse(
        underweight_sectors=underweight,
        recommendations=recommendations,
        opportunistic_recommendations=opportunistic_recommendations,
    )


def _build_diversification_pool(summary: PortfolioSummary) -> tuple[list[str], list[Recommendation]]:
    present_sectors = {sw.sector: sw.weight_pct for sw in summary.sector_weights}
    all_expected = list(SECTOR_CATALOGUE.keys())

    underweight: list[str] = []
    for sector in all_expected:
        pct = present_sectors.get(sector, 0.0)
        if pct < UNDERWEIGHT_THRESHOLD_PCT:
            underweight.append(sector)

    underweight.sort(key=lambda s: -_sector_momentum(s))

    recommendations: list[Recommendation] = []
    seen_tickers: set[str] = set()

    def add_candidate(
        ticker: str,
        name: str,
        category: str,
        rationale: str,
        sectors: list[str],
    ) -> None:
        if ticker in seen_tickers:
            return
        seen_tickers.add(ticker)
        recommendations.append(
            Recommendation(
                ticker=ticker,
                name=name,
                category=category,
                rationale=rationale,
                sectors_covered=sectors,
                current_price=_current_price(ticker),
                ytd_return_pct=_ytd_return(ticker),
                ranking_score=0.0,
                momentum_3m_pct=0.0,
                avg_dollar_volume_3m=0.0,
                liquidity_log10=0.0,
                expense_ratio_pct=None,
                expense_penalty=0.0,
                news_sentiment_score=0.0,
                news_story_count=0,
                next_earnings_date=None,
                days_to_next_earnings=None,
                earnings_proximity_bonus=0.0,
            )
        )

    for sector in underweight:
        candidates = SECTOR_CATALOGUE.get(sector, [])
        ranked_candidates = sorted(
            candidates,
            key=lambda item: _candidate_components(item[0], item[2])[0],
            reverse=True,
        )
        eligible_candidates = [
            item for item in ranked_candidates
            if _candidate_components(item[0], item[2])[0] >= MIN_RECOMMENDATION_SCORE
        ]

        for ticker, name, category, rationale, sectors in eligible_candidates:
            if ticker in seen_tickers:
                continue
            add_candidate(ticker, name, category, rationale, sectors)

    return underweight, recommendations


def _build_opportunistic_pool(summary: PortfolioSummary, underweight: list[str]) -> list[Recommendation]:
    seen_tickers: set[str] = set()
    opportunistic_pool: list[tuple[int, float, Recommendation]] = []

    for sector, candidates in SECTOR_CATALOGUE.items():
        sector_momentum_pct = _sector_momentum(sector) * 100.0
        for ticker, name, category, rationale, sectors in candidates:
            if ticker in seen_tickers:
                continue

            (
                base_score,
                _momentum_pct,
                _avg_dollar_volume,
                _liquidity_log10,
                _expense_pct,
                _expense_penalty,
                news_sentiment_score,
                _news_story_count,
                _next_earnings_date,
                _days_to_next_earnings,
                _earnings_proximity_bonus,
            ) = _candidate_components(ticker, category)

            if base_score < MIN_OPPORTUNISTIC_BASE_SCORE:
                continue

            ytd = _ytd_return(ticker)
            ytd_pct = ytd if ytd is not None else 0.0

            opportunistic_boost = (0.28 * sector_momentum_pct) + (0.08 * ytd_pct)
            total_score = base_score + opportunistic_boost

            if total_score < MIN_OPPORTUNISTIC_TOTAL_SCORE:
                continue

            sentiment_label = (
                "positive" if news_sentiment_score > 0.2 else
                "negative" if news_sentiment_score < -0.2 else
                "mixed"
            )
            rationale_override = (
                f"{rationale}. Opportunistic tailwinds: {sector} sector 3M trend "
                f"{sector_momentum_pct:+.1f}%, YTD {ytd_pct:+.1f}%, news tone {sentiment_label}."
            )

            rec = _build_recommendation_payload(
                ticker,
                name,
                category,
                rationale,
                sectors,
                score_adjustment=opportunistic_boost,
                rationale_override=rationale_override,
            )

            non_underweight_priority = 1
            if any(sec in underweight for sec in sectors):
                non_underweight_priority = 0

            opportunistic_pool.append((non_underweight_priority, total_score, rec))
            seen_tickers.add(ticker)

    for ticker, name, category, rationale, sectors, fund_count in _dynamic_opportunistic_candidates():
        if ticker in seen_tickers:
            continue

        (
            base_score,
            _momentum_pct,
            _avg_dollar_volume,
            _liquidity_log10,
            _expense_pct,
            _expense_penalty,
            news_sentiment_score,
            _news_story_count,
            _next_earnings_date,
            _days_to_next_earnings,
            _earnings_proximity_bonus,
        ) = _candidate_components(ticker, category)

        if base_score < MIN_OPPORTUNISTIC_BASE_SCORE:
            continue

        ytd = _ytd_return(ticker)
        ytd_pct = ytd if ytd is not None else 0.0
        lead_sector = sectors[0] if sectors else "Technology"
        sector_momentum_pct = _sector_momentum(lead_sector) * 100.0
        fund_support_bonus = 0.85 * fund_count
        opportunistic_boost = (0.28 * sector_momentum_pct) + (0.08 * ytd_pct) + fund_support_bonus
        total_score = base_score + opportunistic_boost

        if total_score < MIN_OPPORTUNISTIC_TOTAL_SCORE:
            continue

        sentiment_label = (
            "positive" if news_sentiment_score > 0.2 else
            "negative" if news_sentiment_score < -0.2 else
            "mixed"
        )
        rationale_override = (
            f"{rationale} Opportunistic tailwinds: {lead_sector} sector 3M trend {sector_momentum_pct:+.1f}%, "
            f"YTD {ytd_pct:+.1f}%, news tone {sentiment_label}."
        )

        rec = _build_recommendation_payload(
            ticker,
            name,
            category,
            rationale,
            sectors,
            score_adjustment=opportunistic_boost,
            rationale_override=rationale_override,
        )

        non_underweight_priority = 1
        if any(sec in underweight for sec in sectors):
            non_underweight_priority = 0

        opportunistic_pool.append((non_underweight_priority, total_score, rec))
        seen_tickers.add(ticker)

    opportunistic_pool.sort(key=lambda row: (-row[0], -row[1]))
    return [rec for _, _, rec in opportunistic_pool]


def _filter_recommendation_items(
    items: list[Recommendation],
    asset_type: Literal["all", "funds", "stocks"],
    max_price: float | None,
) -> list[Recommendation]:
    filtered = items
    if asset_type == "funds":
        filtered = [rec for rec in filtered if rec.category != "Stock"]
    elif asset_type == "stocks":
        filtered = [rec for rec in filtered if rec.category == "Stock"]

    if max_price is not None:
        filtered = [rec for rec in filtered if rec.current_price is not None and rec.current_price <= max_price]

    return filtered


def generate_recommendation_page(
    summary: PortfolioSummary,
    section: Literal["diversification", "opportunistic"],
    asset_type: Literal["all", "funds", "stocks"],
    max_price: float | None,
    offset: int,
    limit: int,
) -> RecommendationPageResponse:
    underweight, diversification_pool = _build_diversification_pool(summary)
    opportunistic_pool = _build_opportunistic_pool(summary, underweight)
    items = diversification_pool if section == "diversification" else opportunistic_pool
    filtered_items = _filter_recommendation_items(items, asset_type, max_price)
    start = max(offset, 0)
    page_items = filtered_items[start : start + max(limit, 1)]
    has_more = start + len(page_items) < len(filtered_items)
    return RecommendationPageResponse(
        underweight_sectors=underweight,
        items=page_items,
        has_more=has_more,
    )
