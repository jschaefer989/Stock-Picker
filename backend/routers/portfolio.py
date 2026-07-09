"""
Portfolio router.

POST /api/portfolio/analyse   → PortfolioSummary
POST /api/portfolio/recommend → RecommendationResponse
"""
from fastapi import APIRouter, HTTPException

from models import (
    PortfolioIn,
    PortfolioSaveRequest,
    PortfolioSnapshot,
    PortfolioSnapshotListItem,
    PortfolioSummary,
    RecommendationResponse,
    SnapshotDeleteResponse,
    SnapshotRenameRequest,
)
from services.portfolio_service import analyse_portfolio
from services.recommendation_service import generate_recommendations
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
