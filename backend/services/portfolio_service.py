"""
Portfolio analysis service.

Responsibilities:
- Fetch fund / stock metadata and sector weights from yfinance
- Aggregate weighted sector exposure across all holdings
- Identify top individual stock positions
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Optional, cast

import yfinance as yf  # type: ignore[import-untyped]

from models import HoldingIn, PortfolioSummary, SectorWeight, StockExposure

logger = logging.getLogger(__name__)

# GICS sector names used by yfinance fund_sector_weightings
ALL_SECTORS = [
    "Technology",
    "Financial Services",
    "Healthcare",
    "Consumer Cyclical",
    "Industrials",
    "Consumer Defensive",
    "Energy",
    "Basic Materials",
    "Real Estate",
    "Communication Services",
    "Utilities",
]


@lru_cache(maxsize=256)
def _fetch_ticker_info(ticker: str) -> dict[str, Any]:
    """Return yfinance .info dict for a ticker (cached)."""
    try:
        t = yf.Ticker(ticker)
        return t.info or {}
    except Exception as exc:
        logger.warning("yfinance fetch failed for %s: %s", ticker, exc)
        return {}


@lru_cache(maxsize=256)
def _fetch_fund_sectors(ticker: str) -> dict[str, float]:
    """Return {sector: weight_0_to_1} for an ETF / mutual fund."""
    try:
        t = yf.Ticker(ticker)
        weights = t.funds_data.sector_weightings
        if weights is None:
            return {}
        # yfinance returns a list of dicts like [{"realestate": 0.05, ...}]
        combined: dict[str, float] = {}
        entries = weights if isinstance(weights, list) else [weights]
        for entry in entries:
            if isinstance(entry, dict):
                for key, value in entry.items():
                    if isinstance(key, str) and isinstance(value, (int, float)):
                        combined[key] = float(value)
        return combined
    except Exception as exc:
        logger.warning("Sector fetch failed for %s: %s", ticker, exc)
        return {}


def _normalise_sector(raw: str) -> str:
    """Map yfinance camelCase sector keys to GICS names."""
    mapping = {
        "technology": "Technology",
        "financial_services": "Financial Services",
        "financialservices": "Financial Services",
        "healthcare": "Healthcare",
        "consumer_cyclical": "Consumer Cyclical",
        "consumercyclical": "Consumer Cyclical",
        "industrials": "Industrials",
        "consumer_defensive": "Consumer Defensive",
        "consumerdefensive": "Consumer Defensive",
        "energy": "Energy",
        "basic_materials": "Basic Materials",
        "basicmaterials": "Basic Materials",
        "real_estate": "Real Estate",
        "realestate": "Real Estate",
        "communication_services": "Communication Services",
        "communicationservices": "Communication Services",
        "utilities": "Utilities",
    }
    return mapping.get(raw.lower().replace(" ", "_"), raw.title())


def _stock_sector(info: dict[str, Any]) -> Optional[str]:
    raw = info.get("sector")
    return raw if isinstance(raw, str) and raw else None


def _stock_name(ticker: str, info: dict[str, Any]) -> str:
    short_name = info.get("shortName")
    if isinstance(short_name, str) and short_name:
        return short_name
    long_name = info.get("longName")
    if isinstance(long_name, str) and long_name:
        return long_name
    return ticker


def analyse_portfolio(holdings: list[HoldingIn]) -> PortfolioSummary:
    """
    Compute portfolio-level sector weights and top stock exposures.
    For ETFs / mutual funds we decompose into their sector weightings.
    For individual stocks we treat the full position as one sector.
    """
    total_value = sum(h.value for h in holdings)

    # {sector: accumulated_dollar_weight}
    sector_dollars: dict[str, float] = {}
    # {ticker: (name, dollar_exposure)}
    stock_dollars: dict[str, tuple[str, float]] = {}

    for holding in holdings:
        ticker = holding.ticker.upper()
        info = _fetch_ticker_info(ticker)
        if holding.holding_type == "stock":
            sector = _stock_sector(info) or "Unknown"
            name = _stock_name(ticker, info)
            sector_dollars[sector] = sector_dollars.get(sector, 0.0) + holding.value
            stock_dollars[ticker] = (name, stock_dollars.get(ticker, ("", 0.0))[1] + holding.value)
        else:
            # ETF or mutual fund – use sector weightings
            raw_sectors = _fetch_fund_sectors(ticker)
            if raw_sectors:
                for raw_key, sec_weight in raw_sectors.items():
                    sec = _normalise_sector(raw_key)
                    sector_dollars[sec] = (
                        sector_dollars.get(sec, 0.0) + holding.value * sec_weight
                    )
                # Also surface top holdings as stock exposures
                try:
                    t = yf.Ticker(ticker)
                    top = t.funds_data.top_holdings
                    if top is not None:
                        for row in (top.itertuples() if hasattr(top, "itertuples") else []):
                            stk = getattr(row, "Symbol", None) or getattr(row, "Index", None)
                            stk_name = getattr(row, "holdingName", stk) or stk
                            stk_pct = getattr(row, "Holding_Percent", 0.0) or 0.0
                            if isinstance(stk, str) and stk:
                                resolved_name = stk_name if isinstance(stk_name, str) else stk
                                prev = stock_dollars.get(stk, (resolved_name, 0.0))
                                stock_dollars[stk] = (
                                    prev[0],
                                    prev[1] + holding.value * float(cast(float, stk_pct)),
                                )
                except Exception:
                    pass
            else:
                # Fallback: treat whole fund as its declared sector or "Diversified"
                sec = _stock_sector(info) or "Diversified"
                sector_dollars[sec] = sector_dollars.get(sec, 0.0) + holding.value

    sector_weights = [
        SectorWeight(
            sector=sec,
            weight_pct=round(dollars / total_value * 100, 2),
        )
        for sec, dollars in sorted(sector_dollars.items(), key=lambda x: -x[1])
        if dollars > 0
    ]

    top_stocks = sorted(
        [
            StockExposure(
                ticker=tkr,
                name=name,
                weight_pct=round(dollars / total_value * 100, 2),
            )
            for tkr, (name, dollars) in stock_dollars.items()
            if dollars > 0
        ],
        key=lambda x: -x.weight_pct,
    )[:20]

    return PortfolioSummary(
        total_value=total_value,
        sector_weights=sector_weights,
        top_stocks=top_stocks,
    )
