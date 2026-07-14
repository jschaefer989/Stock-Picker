"""Purchase plan evaluation service."""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

import yfinance as yf  # type: ignore[import-untyped]

from models import (
    HoldingIn,
    PlanScoreBreakdown,
    PlanSectorDelta,
    PlanSuggestion,
    PortfolioSummary,
    PurchasePlanEvaluationResponse,
    PurchasePlanLineIn,
    PurchasePlanLineResult,
)
from services.portfolio_service import ALL_SECTORS, analyse_portfolio


@lru_cache(maxsize=256)
def _fetch_ticker_info(ticker: str) -> dict[str, Any]:
    try:
        return yf.Ticker(ticker).info or {}
    except Exception:
        return {}


@lru_cache(maxsize=256)
def _latest_price(ticker: str) -> float | None:
    info = _fetch_ticker_info(ticker)
    for key in ("regularMarketPrice", "currentPrice", "previousClose"):
        raw = info.get(key)
        if isinstance(raw, (int, float)) and float(raw) > 0:
            return float(raw)

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


def _as_sector_map(summary: PortfolioSummary) -> dict[str, float]:
    out = {sector: 0.0 for sector in ALL_SECTORS}
    for row in summary.sector_weights:
        out[row.sector] = float(row.weight_pct)
    return out


def _normalized_sector_entropy(summary: PortfolioSummary) -> float:
    weights = [row.weight_pct / 100.0 for row in summary.sector_weights if row.weight_pct > 0]
    if len(weights) <= 1:
        return 0.0
    entropy = -sum(w * math.log(w) for w in weights)
    max_entropy = math.log(len(weights))
    if max_entropy <= 0:
        return 0.0
    return max(0.0, min(1.0, entropy / max_entropy))


def _concentration_score(summary: PortfolioSummary) -> float:
    if not summary.composite_stocks:
        return 100.0

    top_weight = max(float(stock.total_weight_pct) for stock in summary.composite_stocks)
    hhi = sum((float(stock.total_weight_pct) / 100.0) ** 2 for stock in summary.composite_stocks)
    penalty = (top_weight * 1.8) + (hhi * 1200.0)
    return max(0.0, min(100.0, 100.0 - penalty))


def _overlap_score(summary: PortfolioSummary) -> float:
    overlap_total = sum(float(item.total_weight_pct) for item in summary.overlap_stocks)
    overlap_count = len(summary.overlap_stocks)
    penalty = (overlap_total * 1.3) + (overlap_count * 2.5)
    return max(0.0, min(100.0, 100.0 - penalty))


def _diversification_score(summary: PortfolioSummary, holding_count: int) -> float:
    sectors_above_3 = sum(1 for row in summary.sector_weights if row.weight_pct >= 3.0)
    score = sectors_above_3 * 8.0 + min(holding_count, 20) * 2.0
    return max(0.0, min(100.0, score))


def _build_breakdown(before_summary: PortfolioSummary, after_summary: PortfolioSummary, after_holding_count: int) -> PlanScoreBreakdown:
    sector_before = _normalized_sector_entropy(before_summary) * 100.0
    sector_after = _normalized_sector_entropy(after_summary) * 100.0

    conc_before = _concentration_score(before_summary)
    conc_after = _concentration_score(after_summary)

    overlap_before = _overlap_score(before_summary)
    overlap_after = _overlap_score(after_summary)

    div_before = _diversification_score(before_summary, len(before_summary.top_stocks))
    div_after = _diversification_score(after_summary, after_holding_count)

    overall_before = (
        sector_before * 0.35
        + conc_before * 0.3
        + overlap_before * 0.2
        + div_before * 0.15
    )
    overall_after = (
        sector_after * 0.35
        + conc_after * 0.3
        + overlap_after * 0.2
        + div_after * 0.15
    )

    return PlanScoreBreakdown(
        sector_balance_before=round(sector_before, 2),
        sector_balance_after=round(sector_after, 2),
        concentration_before=round(conc_before, 2),
        concentration_after=round(conc_after, 2),
        overlap_before=round(overlap_before, 2),
        overlap_after=round(overlap_after, 2),
        diversification_before=round(div_before, 2),
        diversification_after=round(div_after, 2),
        overall_before=round(overall_before, 2),
        overall_after=round(overall_after, 2),
    )


def _build_suggestions(
    before_summary: PortfolioSummary,
    after_summary: PortfolioSummary,
    score_breakdown: PlanScoreBreakdown,
) -> list[PlanSuggestion]:
    suggestions: list[PlanSuggestion] = []

    before_sectors = _as_sector_map(before_summary)
    after_sectors = _as_sector_map(after_summary)
    still_underweight = [sector for sector, weight in after_sectors.items() if weight < 5.0]

    if score_breakdown.overall_after < score_breakdown.overall_before:
        suggestions.append(
            PlanSuggestion(
                action="adjust",
                severity="high",
                message="The projected plan lowers your overall portfolio quality score. Reduce concentrated buys and rebalance across more sectors.",
            )
        )

    if still_underweight:
        before_underweight = [sector for sector, weight in before_sectors.items() if weight < 5.0]
        improved_count = max(0, len(before_underweight) - len(still_underweight))
        message = (
            f"{len(still_underweight)} sectors remain underweight (<5%): {', '.join(still_underweight[:6])}. "
            f"This plan improved {improved_count} sector gaps. Consider adding targeted funds or stocks for the remaining gaps."
        )
        suggestions.append(PlanSuggestion(action="add", severity="medium", message=message))

    if after_summary.composite_stocks:
        top_after = max(after_summary.composite_stocks, key=lambda row: row.total_weight_pct)
        if top_after.total_weight_pct >= 18.0:
            suggestions.append(
                PlanSuggestion(
                    action="reduce",
                    severity="high" if top_after.total_weight_pct >= 25.0 else "medium",
                    message=f"{top_after.ticker} is projected to be {top_after.total_weight_pct:.2f}% of your portfolio. Consider reducing this line or adding offsetting positions.",
                )
            )

    if score_breakdown.overlap_after < score_breakdown.overlap_before:
        suggestions.append(
            PlanSuggestion(
                action="adjust",
                severity="medium",
                message="Overlap risk increases after this plan. Consider replacing one or more overlapping positions with less correlated alternatives.",
            )
        )

    if not suggestions:
        suggestions.append(
            PlanSuggestion(
                action="keep",
                severity="low",
                message="This plan improves or preserves diversification metrics. The allocation is broadly balanced relative to your current portfolio.",
            )
        )

    return suggestions


def evaluate_purchase_plan(
    current_holdings: list[HoldingIn],
    plan_lines: list[PurchasePlanLineIn],
) -> PurchasePlanEvaluationResponse:
    if not current_holdings:
        raise ValueError("Current portfolio must contain at least one holding.")
    if not plan_lines:
        raise ValueError("Purchase plan must contain at least one line.")

    invalid_lines: list[str] = []
    normalized_lines: list[PurchasePlanLineResult] = []
    aggregated: dict[tuple[str, str], PurchasePlanLineResult] = {}

    for index, line in enumerate(plan_lines):
        ticker = line.ticker.strip().upper()
        if not ticker:
            invalid_lines.append(f"Row {index + 1}: ticker is required.")
            continue

        holding_type = line.holding_type.strip().lower() if line.holding_type else "stock"
        if holding_type not in {"etf", "mutual_fund", "stock"}:
            invalid_lines.append(f"Row {index + 1} ({ticker}): holding type must be etf, mutual_fund, or stock.")
            continue

        input_mode = line.input_mode.strip().lower() if line.input_mode else "dollars"
        if input_mode not in {"dollars", "shares"}:
            invalid_lines.append(f"Row {index + 1} ({ticker}): input mode must be dollars or shares.")
            continue

        price: float | None = None
        dollars = 0.0
        shares = None

        if input_mode == "dollars":
            raw_dollars = line.dollars
            if raw_dollars is None or raw_dollars <= 0:
                invalid_lines.append(f"Row {index + 1} ({ticker}): dollars must be greater than zero.")
                continue
            dollars = float(raw_dollars)
        else:
            raw_shares = line.shares
            if raw_shares is None or raw_shares <= 0:
                invalid_lines.append(f"Row {index + 1} ({ticker}): shares must be greater than zero.")
                continue
            price = _latest_price(ticker)
            if price is None or price <= 0:
                invalid_lines.append(f"Row {index + 1} ({ticker}): could not resolve live price for share-based input.")
                continue
            shares = float(raw_shares)
            dollars = shares * price

        key = (ticker, holding_type)
        if key not in aggregated:
            aggregated[key] = PurchasePlanLineResult(
                ticker=ticker,
                name=(line.name or ticker).strip() or ticker,
                holding_type=holding_type,
                input_mode=input_mode,
                dollars=0.0,
                shares=0.0 if input_mode == "shares" else None,
                resolved_price=price,
            )

        current = aggregated[key]
        current.dollars += dollars

        if input_mode == "shares":
            if current.shares is None:
                current.shares = 0.0
            current.shares += shares or 0.0
            current.resolved_price = price

    normalized_lines = list(aggregated.values())
    if not normalized_lines:
        raise ValueError("No valid purchase-plan rows were supplied.")

    projected_map: dict[tuple[str, str], HoldingIn] = {}
    for h in current_holdings:
        key = (h.ticker.strip().upper(), h.holding_type.strip().lower())
        projected_map[key] = HoldingIn(
            ticker=h.ticker.strip().upper(),
            name=h.name,
            value=float(h.value),
            holding_type=h.holding_type.strip().lower(),
        )

    for item in normalized_lines:
        key = (item.ticker, item.holding_type)
        existing = projected_map.get(key)
        if existing is None:
            projected_map[key] = HoldingIn(
                ticker=item.ticker,
                name=item.name,
                value=round(item.dollars, 2),
                holding_type=item.holding_type,
            )
        else:
            existing.value = round(existing.value + item.dollars, 2)
            if not existing.name and item.name:
                existing.name = item.name

    projected_holdings = list(projected_map.values())

    before_summary = analyse_portfolio(current_holdings)
    after_summary = analyse_portfolio(projected_holdings)

    before_sectors = _as_sector_map(before_summary)
    after_sectors = _as_sector_map(after_summary)
    sector_deltas = [
        PlanSectorDelta(
            sector=sector,
            before_weight_pct=round(before_sectors.get(sector, 0.0), 2),
            after_weight_pct=round(after_sectors.get(sector, 0.0), 2),
            delta_weight_pct=round(after_sectors.get(sector, 0.0) - before_sectors.get(sector, 0.0), 2),
        )
        for sector in ALL_SECTORS
    ]

    score_breakdown = _build_breakdown(before_summary, after_summary, len(projected_holdings))
    suggestions = _build_suggestions(before_summary, after_summary, score_breakdown)

    return PurchasePlanEvaluationResponse(
        normalized_plan_lines=normalized_lines,
        invalid_plan_lines=invalid_lines,
        projected_holdings=projected_holdings,
        before_summary=before_summary,
        after_summary=after_summary,
        sector_deltas=sector_deltas,
        score_breakdown=score_breakdown,
        suggestions=suggestions,
    )
