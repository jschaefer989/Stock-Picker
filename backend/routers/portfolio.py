"""
Portfolio router.

POST /api/portfolio/analyse   → PortfolioSummary
POST /api/portfolio/recommend → RecommendationResponse
"""
from fastapi import APIRouter, HTTPException
from typing import Literal

from models import (
    PortfolioIn,
    PortfolioSaveRequest,
    PortfolioSnapshot,
    PortfolioSnapshotListItem,
    PortfolioSummary,
    RelatedRecommendationResponse,
    RecommendationPageResponse,
    RecommendationResponse,
    SnapshotDeleteResponse,
    SnapshotRenameRequest,
)
from services.portfolio_service import analyse_portfolio
from services.recommendation_service import (
    generate_recommendation_page,
    generate_recommendations,
    generate_related_recommendations,
)
from services.db_service import delete_snapshot, get_snapshot, list_snapshots, rename_snapshot, save_snapshot

router = APIRouter()


@router.post("/analyse", response_model=PortfolioSummary)
def analyse(portfolio: PortfolioIn) -> PortfolioSummary:
    if not portfolio.holdings:
        raise HTTPException(status_code=400, detail="Portfolio must contain at least one holding.")
    return analyse_portfolio(portfolio.holdings)


@router.post("/recommend", response_model=RecommendationResponse)
def recommend(portfolio: PortfolioIn) -> RecommendationResponse:
    if not portfolio.holdings:
        raise HTTPException(status_code=400, detail="Portfolio must contain at least one holding.")
    summary = analyse_portfolio(portfolio.holdings)
    return generate_recommendations(summary)


@router.post("/recommend/page", response_model=RecommendationPageResponse)
def recommend_page(
    portfolio: PortfolioIn,
    section: Literal["diversification", "opportunistic"] = "diversification",
    asset_type: Literal["all", "funds", "stocks"] = "all",
    max_price: float | None = None,
    offset: int = 0,
    limit: int = 6,
) -> RecommendationPageResponse:
    if not portfolio.holdings:
        raise HTTPException(status_code=400, detail="Portfolio must contain at least one holding.")

    summary = analyse_portfolio(portfolio.holdings)
    return generate_recommendation_page(
        summary=summary,
        section=section,
        asset_type=asset_type,
        max_price=max_price,
        offset=offset,
        limit=limit,
    )


@router.post("/recommend/related", response_model=RelatedRecommendationResponse)
def recommend_related(
    portfolio: PortfolioIn,
    source_ticker: str,
    exclude_tickers: str | None = None,
    asset_type: Literal["all", "funds", "stocks"] = "all",
    max_price: float | None = None,
    limit: int = 6,
) -> RelatedRecommendationResponse:
    if not portfolio.holdings:
        raise HTTPException(status_code=400, detail="Portfolio must contain at least one holding.")

    excludes = [token.strip().upper() for token in (exclude_tickers or "").split(",") if token.strip()]
    items = generate_related_recommendations(
        source_ticker=source_ticker,
        exclude_tickers=excludes,
        asset_type=asset_type,
        max_price=max_price,
        limit=limit,
    )
    return RelatedRecommendationResponse(source_ticker=source_ticker.upper(), items=items)


@router.post("/save", response_model=PortfolioSnapshotListItem)
def save_portfolio(request: PortfolioSaveRequest) -> PortfolioSnapshotListItem:
    if not request.holdings:
        raise HTTPException(status_code=400, detail="Portfolio must contain at least one holding.")

    summary = analyse_portfolio(request.holdings)
    recommendations = generate_recommendations(summary)
    return save_snapshot(
        holdings=request.holdings,
        summary=summary,
        recommendations=recommendations,
        label=request.label,
    )


@router.get("/history", response_model=list[PortfolioSnapshotListItem])
def portfolio_history(limit: int = 25) -> list[PortfolioSnapshotListItem]:
    return list_snapshots(limit=limit)


@router.get("/history/{snapshot_id}", response_model=PortfolioSnapshot)
def portfolio_history_item(snapshot_id: int) -> PortfolioSnapshot:
    try:
        return get_snapshot(snapshot_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/history/{snapshot_id}", response_model=PortfolioSnapshotListItem)
def portfolio_history_rename(snapshot_id: int, request: SnapshotRenameRequest) -> PortfolioSnapshotListItem:
    try:
        return rename_snapshot(snapshot_id=snapshot_id, label=request.label)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/history/{snapshot_id}", response_model=SnapshotDeleteResponse)
def portfolio_history_delete(snapshot_id: int) -> SnapshotDeleteResponse:
    try:
        delete_snapshot(snapshot_id)
        return SnapshotDeleteResponse(status="deleted", id=snapshot_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
