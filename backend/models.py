"""
Shared Pydantic models for request / response schemas.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Inbound ──────────────────────────────────────────────────────────────────

class HoldingIn(BaseModel):
    """One line in the user's portfolio."""
    ticker: str = Field(..., description="Fund or stock ticker symbol, e.g. VTI")
    name: Optional[str] = Field(None, description="Human-readable name")
    value: float = Field(..., gt=0, description="Current market value in USD")
    holding_type: str = Field(
        "etf",
        description="Type of holding: 'etf', 'mutual_fund', or 'stock'",
    )


class PortfolioIn(BaseModel):
    holdings: list[HoldingIn]


class PortfolioSaveRequest(BaseModel):
    holdings: list[HoldingIn]
    label: Optional[str] = None


class SnapshotRenameRequest(BaseModel):
    label: Optional[str] = None


# ── Outbound ─────────────────────────────────────────────────────────────────

class SectorWeight(BaseModel):
    sector: str
    weight_pct: float  # 0-100


class StockExposure(BaseModel):
    ticker: str
    name: str
    weight_pct: float  # 0-100


class CompositeStockExposure(BaseModel):
    ticker: str
    name: str
    total_weight_pct: float  # 0-100
    direct_weight_pct: float  # 0-100
    fund_lookthrough_weight_pct: float  # 0-100
    source_fund_count: int


class PortfolioSummary(BaseModel):
    total_value: float
    sector_weights: list[SectorWeight]
    top_stocks: list[StockExposure]
    composite_stocks: list[CompositeStockExposure] = Field(default_factory=list)
    overlap_stocks: list[CompositeStockExposure] = Field(default_factory=list)


class Recommendation(BaseModel):
    ticker: str
    name: str
    category: str          # "ETF" | "Mutual Fund" | "Stock"
    rationale: str
    sectors_covered: list[str]
    ytd_return_pct: Optional[float] = None
    ranking_score: float
    momentum_3m_pct: float
    avg_dollar_volume_3m: float
    liquidity_log10: float
    expense_ratio_pct: Optional[float] = None
    expense_penalty: float
    news_sentiment_score: float
    news_story_count: int
    next_earnings_date: Optional[str] = None
    days_to_next_earnings: Optional[int] = None
    earnings_proximity_bonus: float


class RecommendationResponse(BaseModel):
    underweight_sectors: list[str]
    recommendations: list[Recommendation]
    opportunistic_recommendations: list[Recommendation] = Field(default_factory=list)


class PortfolioSnapshotListItem(BaseModel):
    id: int
    created_at: str
    label: Optional[str] = None
    holdings_count: int
    total_value: float


class PortfolioSnapshot(BaseModel):
    id: int
    created_at: str
    label: Optional[str] = None
    holdings: list[HoldingIn]
    summary: PortfolioSummary
    recommendations: RecommendationResponse


class SnapshotDeleteResponse(BaseModel):
    status: str
    id: int
