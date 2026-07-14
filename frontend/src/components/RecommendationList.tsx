"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { HoldingIn, Recommendation, RecommendationResponse } from "@/lib/types";

interface Props {
  data: RecommendationResponse;
  holdings: HoldingIn[];
}

type RecommendationFilter = "all" | "funds" | "stocks";
type RecommendationLens = "both" | "diversification" | "opportunistic";
type RecommendationSection = "diversification" | "opportunistic";

const PAGE_SIZE = 6;

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

export default function RecommendationList({ data, holdings }: Props) {
  const [filter, setFilter] = useState<RecommendationFilter>("all");
  const [lens, setLens] = useState<RecommendationLens>("both");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [diversificationCards, setDiversificationCards] = useState<Recommendation[]>(() => data.recommendations);
  const [opportunisticCards, setOpportunisticCards] = useState<Recommendation[]>(() => data.opportunistic_recommendations);
  const [applyLoading, setApplyLoading] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<{ section: RecommendationSection; ticker: string } | null>(null);
  const [relatedRecommendations, setRelatedRecommendations] = useState<Recommendation[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);

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
  const parsedMaxPrice = maxPrice.trim() === "" ? null : Number(maxPrice);
  const hasValidMaxPrice = parsedMaxPrice !== null && Number.isFinite(parsedMaxPrice) && parsedMaxPrice >= 0;

  const applyPriceFilter = (items: RecommendationResponse["recommendations"]) =>
    hasValidMaxPrice
      ? items.filter((rec) => rec.current_price !== null && rec.current_price <= parsedMaxPrice)
      : items;

  const applyAssetTypeFilter = useCallback(
    (items: Recommendation[]) => {
      if (filter === "stocks") {
        return items.filter((rec) => rec.category === "Stock");
      }
      if (filter === "funds") {
        return items.filter((rec) => rec.category !== "Stock");
      }
      return items;
    },
    [filter],
  );

  const diversificationVisible = useMemo(() => {
    if (lens === "opportunistic") {
      return [];
    }
    return applyPriceFilter(applyAssetTypeFilter(diversificationCards));
  }, [lens, diversificationCards, applyAssetTypeFilter, hasValidMaxPrice, parsedMaxPrice]);

  const opportunisticVisible = useMemo(() => {
    if (lens === "diversification") {
      return [];
    }
    return applyPriceFilter(applyAssetTypeFilter(opportunisticCards));
  }, [lens, opportunisticCards, applyAssetTypeFilter, hasValidMaxPrice, parsedMaxPrice]);
  const assetTypeCounts = useMemo(() => {
    const allRecommendations = [...data.recommendations, ...data.opportunistic_recommendations];
    return {
      all: allRecommendations.length,
      funds: allRecommendations.filter((rec) => rec.category !== "Stock").length,
      stocks: allRecommendations.filter((rec) => rec.category === "Stock").length,
    };
  }, [data.recommendations, data.opportunistic_recommendations]);
  const lensCounts = useMemo(
    () => ({
      diversification: data.recommendations.length,
      opportunistic: data.opportunistic_recommendations.length,
    }),
    [data.recommendations.length, data.opportunistic_recommendations.length],
  );

  const selectRecommendation = useCallback(
    async (rec: Recommendation, section: RecommendationSection) => {
      setSelectedRecommendation(rec);
      setSelectedAnchor({ section, ticker: rec.ticker });
      setRelatedLoading(true);
      setRelatedError(null);

      try {
        const excludeTickers = Array.from(new Set([...diversificationCards, ...opportunisticCards].map((item) => item.ticker)));
        const response = await api.getRelatedRecommendations(
          { holdings },
          {
            sourceTicker: rec.ticker,
            excludeTickers,
            assetType: filter,
            maxPrice: hasValidMaxPrice ? parsedMaxPrice : null,
            limit: 6,
          },
        );
        setRelatedRecommendations(response.items);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load related recommendations.";
        setRelatedRecommendations([]);
        setRelatedError(message);
      } finally {
        setRelatedLoading(false);
      }
    },
    [diversificationCards, opportunisticCards, holdings, filter, hasValidMaxPrice, parsedMaxPrice],
  );

  useEffect(() => {
    setDiversificationCards(data.recommendations);
    setOpportunisticCards(data.opportunistic_recommendations);
    setApplyLoading(false);
    setSelectedRecommendation(null);
    setSelectedAnchor(null);
    setRelatedRecommendations([]);
    setRelatedError(null);
    setRelatedLoading(false);
  }, [data.recommendations, data.opportunistic_recommendations]);

  const fetchAllForSection = useCallback(
    async (section: RecommendationSection): Promise<Recommendation[]> => {
      const items: Recommendation[] = [];
      let offset = 0;
      let hasMore = true;
      let guard = 0;

      while (hasMore && guard < 50) {
        const page = await api.getRecommendationPage(
          { holdings },
          {
            section,
            assetType: filter,
            maxPrice: hasValidMaxPrice ? parsedMaxPrice : null,
            offset,
            limit: PAGE_SIZE,
          },
        );
        items.push(...page.items);
        hasMore = page.has_more;
        offset += PAGE_SIZE;
        guard += 1;
      }

      return items;
    },
    [holdings, filter, hasValidMaxPrice, parsedMaxPrice],
  );

  const loadWithFilters = useCallback(async () => {
    if (!holdings.length || applyLoading) return;
    setApplyLoading(true);
    try {
      const [diversification, opportunistic] = await Promise.all([
        fetchAllForSection("diversification"),
        fetchAllForSection("opportunistic"),
      ]);
      setDiversificationCards(diversification);
      setOpportunisticCards(opportunistic);
    } finally {
      setApplyLoading(false);
    }
  }, [holdings, applyLoading, fetchAllForSection]);

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

  const renderRecommendationCard = (
    rec: Recommendation,
    section: RecommendationSection,
    key: string,
    showDeepMetrics = section === "diversification",
  ) => {
    const isOpportunistic = section === "opportunistic";
    return (
      <div
        key={key}
        className={`rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer ${
          isOpportunistic
            ? "border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/30 dark:bg-cyan-950/10"
            : "border border-gray-200 dark:border-gray-700"
        }`}
        role="button"
        tabIndex={0}
        onClick={() => {
          void selectRecommendation(rec, section);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void selectRecommendation(rec, section);
          }
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <span
              className={`inline-block rounded text-xs font-bold px-2 py-0.5 mb-1 ${
                isOpportunistic
                  ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300"
                  : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
              }`}
            >
              {rec.ticker}
            </span>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{rec.name}</p>
          </div>
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5 ml-2 flex-shrink-0">
            {rec.category}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Current Price</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {rec.current_price !== null
              ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(rec.current_price)
              : "N/A"}
          </span>
        </div>

        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{rec.rationale}</p>

        <div className="mt-3 flex items-center justify-between">
          <ReturnBadge pct={rec.ytd_return_pct} />
          <span
            className={`rounded-full text-xs px-2 py-0.5 font-semibold ${
              isOpportunistic
                ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300"
                : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
            }`}
          >
            Rank Score: {fmtFixed(rec.ranking_score, 2)}
          </span>
        </div>

        {showDeepMetrics && (
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
              <span className="text-right font-medium">{fmtPct(rec.expense_ratio_pct, 3)}</span>
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
        )}

        <div className="mt-2 flex flex-wrap gap-1">
          {rec.sectors_covered.map((s) => (
            <span
              key={`${key}-sector-${s}`}
              className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs px-2 py-0.5"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
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

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Recommended Investments to Consider
        </h3>
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/30 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Asset Type
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={filterBtnClass("all")} onClick={() => setFilter("all")}>All</button>
                <button type="button" className={filterBtnClass("funds")} onClick={() => setFilter("funds")}>Funds</button>
                <button type="button" className={filterBtnClass("stocks")} onClick={() => setFilter("stocks")}>Stocks</button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="rounded-md bg-white/70 dark:bg-gray-950/30 px-2 py-1 text-center">
                  <span className="block uppercase tracking-wide text-[10px]">All</span>
                  <span className="block font-semibold text-gray-700 dark:text-gray-200">{assetTypeCounts.all}</span>
                </span>
                <span className="rounded-md bg-white/70 dark:bg-gray-950/30 px-2 py-1 text-center">
                  <span className="block uppercase tracking-wide text-[10px]">Funds</span>
                  <span className="block font-semibold text-gray-700 dark:text-gray-200">{assetTypeCounts.funds}</span>
                </span>
                <span className="rounded-md bg-white/70 dark:bg-gray-950/30 px-2 py-1 text-center">
                  <span className="block uppercase tracking-wide text-[10px]">Stocks</span>
                  <span className="block font-semibold text-gray-700 dark:text-gray-200">{assetTypeCounts.stocks}</span>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Recommendation Lens
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={lensBtnClass("both")} onClick={() => setLens("both")}>Both</button>
                <button type="button" className={lensBtnClass("diversification")} onClick={() => setLens("diversification")}>Diversification Only</button>
                <button type="button" className={lensBtnClass("opportunistic")} onClick={() => setLens("opportunistic")}>Opportunistic Only</button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="rounded-md bg-white/70 dark:bg-gray-950/30 px-2 py-1 text-center">
                  <span className="block uppercase tracking-wide text-[10px]">Diversification</span>
                  <span className="block font-semibold text-gray-700 dark:text-gray-200">{lensCounts.diversification}</span>
                </span>
                <span className="rounded-md bg-white/70 dark:bg-gray-950/30 px-2 py-1 text-center">
                  <span className="block uppercase tracking-wide text-[10px]">Opportunistic</span>
                  <span className="block font-semibold text-gray-700 dark:text-gray-200">{lensCounts.opportunistic}</span>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Max Price
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="max-price-filter"
                  type="number"
                  min="0"
                  step="0.01"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-32 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500 dark:focus:border-cyan-500"
                />
                <button
                  type="button"
                  className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={() => setMaxPrice("")}
                  disabled={maxPrice.trim() === ""}
                >
                  Clear
                </button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {hasValidMaxPrice ? `Showing prices at or below $${Number(parsedMaxPrice).toFixed(2)}` : "No price limit applied"}
              </p>
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  className="rounded-full bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                  onClick={() => void loadWithFilters()}
                  disabled={applyLoading || !holdings.length}
                >
                  {applyLoading ? "Loading recommendations..." : "Load recommendations with these filters"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {diversificationVisible.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {diversificationVisible.map((rec) => (
                <Fragment key={`div-group-${rec.ticker}`}>
                  {renderRecommendationCard(rec, "diversification", rec.ticker)}
                  {selectedRecommendation &&
                    selectedAnchor?.section === "diversification" &&
                    selectedAnchor.ticker === rec.ticker && (
                      <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-cyan-200 dark:border-cyan-900/40 bg-cyan-50/30 dark:bg-cyan-950/10 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Related ideas for {selectedRecommendation.ticker}
                          </p>
                          <button
                            type="button"
                            className="rounded-full bg-white/80 dark:bg-gray-900/70 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800"
                            onClick={() => {
                              setSelectedRecommendation(null);
                              setSelectedAnchor(null);
                              setRelatedRecommendations([]);
                              setRelatedError(null);
                              setRelatedLoading(false);
                            }}
                          >
                            Close
                          </button>
                        </div>
                        {relatedLoading ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">Finding related stocks/funds...</p>
                        ) : relatedError ? (
                          <p className="text-xs text-red-600 dark:text-red-400">{relatedError}</p>
                        ) : relatedRecommendations.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            No net-new related stocks/funds were found for this ticker.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {relatedRecommendations.map((related) =>
                              renderRecommendationCard(
                                related,
                                "diversification",
                                `div-related-${selectedRecommendation.ticker}-${related.ticker}`,
                                true,
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Opportunistic Picks (Trend and News Driven)
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Includes strong setups even when the sector is not underweight.
          </p>
        </div>
        <div className="space-y-4">
          {opportunisticVisible.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {opportunisticVisible.map((rec) => (
                <Fragment key={`op-group-${rec.ticker}`}>
                  {renderRecommendationCard(rec, "opportunistic", `op-${rec.ticker}`)}
                  {selectedRecommendation &&
                    selectedAnchor?.section === "opportunistic" &&
                    selectedAnchor.ticker === rec.ticker && (
                      <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-cyan-200 dark:border-cyan-900/40 bg-cyan-50/30 dark:bg-cyan-950/10 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Related ideas for {selectedRecommendation.ticker}
                          </p>
                          <button
                            type="button"
                            className="rounded-full bg-white/80 dark:bg-gray-900/70 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800"
                            onClick={() => {
                              setSelectedRecommendation(null);
                              setSelectedAnchor(null);
                              setRelatedRecommendations([]);
                              setRelatedError(null);
                              setRelatedLoading(false);
                            }}
                          >
                            Close
                          </button>
                        </div>
                        {relatedLoading ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">Finding related stocks/funds...</p>
                        ) : relatedError ? (
                          <p className="text-xs text-red-600 dark:text-red-400">{relatedError}</p>
                        ) : relatedRecommendations.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            No net-new related stocks/funds were found for this ticker.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {relatedRecommendations.map((related) =>
                              renderRecommendationCard(
                                related,
                                "opportunistic",
                                `op-related-${selectedRecommendation.ticker}-${related.ticker}`,
                                true,
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
