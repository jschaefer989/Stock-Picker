"""
Market data router.

GET /api/market/quote/{ticker}  → basic price info
GET /api/market/sectors         → current YTD returns for all sector ETFs
"""
from fastapi import APIRouter, HTTPException
from functools import lru_cache
from typing import Any, Optional

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
