"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { RecommendationResponse } from "@/lib/types";

interface Props {
  data: RecommendationResponse;
}

type RecommendationFilter = "all" | "funds" | "stocks";
type RecommendationLens = "both" | "diversification" | "opportunistic";

function ReturnBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400 text-xs">N/A</span>;
  const color =
    pct > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : pct < 0
      ? "text-red-500 dark:text-red-400"
      : "text-gray-500";
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${color}`}>
      <Icon className="h-3 w-3" />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(2)}% YTD
    </span>
  );
}

export default function RecommendationList({ data }: Props) {
  const [filter, setFilter] = useState<RecommendationFilter>("all");
  const [lens, setLens] = useState<RecommendationLens>("both");

  const fmtVolume = (v: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);

  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const fmtFixed = (v: unknown, digits: number) => (isNum(v) ? v.toFixed(digits) : "N/A");
  const fmtPct = (v: unknown, digits: number) => (isNum(v) ? `${v.toFixed(digits)}%` : "N/A");
  const fmtMoneyCompact = (v: unknown) => (isNum(v) ? `$${fmtVolume(v)}` : "N/A");
  const sentimentLabel = (v: number) => (v > 0.2 ? "Positive" : v < -0.2 ? "Negative" : "Neutral");

  const filteredRecommendations = useMemo(() => {
    if (filter === "all") return data.recommendations;
    if (filter === "stocks") {
      return data.recommendations.filter((rec) => rec.category === "Stock");
    }
    return data.recommendations.filter((rec) => rec.category !== "Stock");
  }, [data.recommendations, filter]);

  const filteredOpportunistic = useMemo(() => {
    if (filter === "all") return data.opportunistic_recommendations;
    if (filter === "stocks") {
      return data.opportunistic_recommendations.filter((rec) => rec.category === "Stock");
    }
    return data.opportunistic_recommendations.filter((rec) => rec.category !== "Stock");
  }, [data.opportunistic_recommendations, filter]);

  const diversificationVisible = lens === "opportunistic" ? [] : filteredRecommendations;
  const opportunisticVisible = lens === "diversification" ? [] : filteredOpportunistic;

  const filterBtnClass = (value: RecommendationFilter) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
      filter === value
        ? "bg-blue-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  const lensBtnClass = (value: RecommendationLens) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
      lens === value
        ? "bg-cyan-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  return (
    <div className="space-y-6">
      {/* Underweight sectors */}
      {data.underweight_sectors.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Underweight Sectors (&lt; 5% allocation)
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.underweight_sectors.map((s) => (
              <span
                key={s}
                className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-3 py-1 text-xs font-medium"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation cards */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Recommended Investments to Consider
          </h3>
          <div className="flex items-center gap-2">
            <button type="button" className={filterBtnClass("all")} onClick={() => setFilter("all")}>All</button>
            <button type="button" className={filterBtnClass("funds")} onClick={() => setFilter("funds")}>Funds</button>
            <button type="button" className={filterBtnClass("stocks")} onClick={() => setFilter("stocks")}>Stocks</button>
          </div>
        </div>
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Recommendation Lens
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className={lensBtnClass("both")} onClick={() => setLens("both")}>Both</button>
              <button type="button" className={lensBtnClass("diversification")} onClick={() => setLens("diversification")}>Diversification Only</button>
              <button type="button" className={lensBtnClass("opportunistic")} onClick={() => setLens("opportunistic")}>Opportunistic Only</button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span>
              Showing {diversificationVisible.length} diversification picks
            </span>
            <span>
              Showing {opportunisticVisible.length} opportunistic picks
            </span>
          </div>
        </div>

        {diversificationVisible.length === 0 ? (
          <p className="text-sm text-gray-500">
            No recommendations match the selected filter.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {diversificationVisible.map((rec) => (
              <div
                key={rec.ticker}
                className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold px-2 py-0.5 mb-1">
                      {rec.ticker}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                      {rec.name}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5 ml-2 flex-shrink-0">
                    {rec.category}
                  </span>
                </div>

                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{rec.rationale}</p>

                <div className="mt-3 flex items-center justify-between">
                  <ReturnBadge pct={rec.ytd_return_pct} />
                  <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-0.5 font-semibold">
                    Rank Score: {fmtFixed(rec.ranking_score, 2)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 bg-gray-50/80 dark:bg-gray-900/50">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                    Why This Ranked Well
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                    <span>Momentum (3M)</span>
                    <span className="text-right font-medium">{fmtPct(rec.momentum_3m_pct, 2)}</span>

                    <span>Avg $ Volume (3M)</span>
                    <span className="text-right font-medium">{fmtMoneyCompact(rec.avg_dollar_volume_3m)}</span>

                    <span>Liquidity (log10)</span>
                    <span className="text-right font-medium">{fmtFixed(rec.liquidity_log10, 2)}</span>

                    <span>Expense Ratio</span>
                    <span className="text-right font-medium">
                      {fmtPct(rec.expense_ratio_pct, 3)}
                    </span>

                    <span>News Sentiment</span>
                    <span className="text-right font-medium">
                      {sentimentLabel(rec.news_sentiment_score)} ({fmtFixed(rec.news_sentiment_score, 2)})
                    </span>

                    <span>Stories Scanned</span>
                    <span className="text-right font-medium">{rec.news_story_count}</span>

                    <span>Earnings Event Boost</span>
                    <span className="text-right font-medium">{fmtFixed(rec.earnings_proximity_bonus, 2)}</span>

                    <span>Next Earnings</span>
                    <span className="text-right font-medium">
                      {rec.next_earnings_date
                        ? `${new Date(rec.next_earnings_date).toLocaleDateString()}${
                            rec.days_to_next_earnings !== null ? ` (${rec.days_to_next_earnings}d)` : ""
                          }`
                        : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {rec.sectors_covered.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Opportunistic cards */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Opportunistic Picks (Trend and News Driven)
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Includes strong setups even when the sector is not underweight.
          </p>
        </div>
        {opportunisticVisible.length === 0 ? (
          <p className="text-sm text-gray-500">No opportunistic picks currently pass the signal threshold.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {opportunisticVisible.map((rec) => (
              <div
                key={`op-${rec.ticker}`}
                className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 p-4 hover:shadow-md transition-shadow bg-cyan-50/30 dark:bg-cyan-950/10"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block rounded bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 text-xs font-bold px-2 py-0.5 mb-1">
                      {rec.ticker}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                      {rec.name}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5 ml-2 flex-shrink-0">
                    {rec.category}
                  </span>
                </div>

                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{rec.rationale}</p>

                <div className="mt-3 flex items-center justify-between">
                  <ReturnBadge pct={rec.ytd_return_pct} />
                  <span className="rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 text-xs px-2 py-0.5 font-semibold">
                    Rank Score: {fmtFixed(rec.ranking_score, 2)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {rec.sectors_covered.map((s) => (
                    <span
                      key={`op-sector-${rec.ticker}-${s}`}
                      className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
