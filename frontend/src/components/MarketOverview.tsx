"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { MarketIndexReturn, MarketStory, SectorETFReturn } from "@/lib/types";

interface Props {
  indexes: MarketIndexReturn[];
  sectors: SectorETFReturn[];
  stories: MarketStory[];
}

function sentimentLabel(score: number): string {
  if (score > 0.2) return "Positive";
  if (score < -0.2) return "Negative";
  return "Neutral";
}

export default function MarketOverview({ indexes, sectors, stories }: Props) {
  const sorted = [...sectors].sort((a, b) => (b.ytd_return_pct ?? 0) - (a.ytd_return_pct ?? 0));
  const sortedIndexes = [...indexes].sort((a, b) => (b.ytd_return_pct ?? 0) - (a.ytd_return_pct ?? 0));
  const fmtIndexPrice = (v: number | null) =>
    v === null ? "N/A" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Major Indexes
        </h3>
        {sortedIndexes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No index data available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sortedIndexes.map((idx) => {
              const ytd = idx.ytd_return_pct;
              const tone = ytd === null
                ? "text-gray-500 dark:text-gray-400"
                : ytd >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";
              return (
                <div
                  key={idx.symbol}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-900/50"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400">{idx.symbol}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{idx.name}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Price: {fmtIndexPrice(idx.price)}</p>
                  <p className={`mt-1 text-sm font-semibold ${tone}`}>
                    {ytd === null ? "YTD: N/A" : `YTD: ${ytd >= 0 ? "+" : ""}${ytd.toFixed(2)}%`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Sector YTD Performance (via Vanguard sector ETFs)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={sorted} layout="vertical" margin={{ left: 20, right: 32 }}>
            <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="sector"
              width={145}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(100, 116, 139, 0.16)" }}
              formatter={(v) => [v != null ? `${(v as number).toFixed(2)}%` : "N/A", "YTD Return"]}
              labelFormatter={(label) => `Sector: ${label}`}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "0.5rem",
                color: "#f8fafc",
                boxShadow: "0 8px 20px rgba(2, 6, 23, 0.45)",
              }}
              labelStyle={{ color: "#e2e8f0", fontWeight: 700 }}
              itemStyle={{ color: "#f8fafc", fontWeight: 600 }}
            />
            <ReferenceLine x={0} stroke="#6b7280" />
            <Bar dataKey="ytd_return_pct" radius={[0, 4, 4, 0]}>
              {sorted.map((entry, i) => (
                <Cell
                  key={i}
                  fill={(entry.ytd_return_pct ?? 0) >= 0 ? "#10b981" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Market Stories
        </h3>
        {stories.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No recent stories available.</p>
        ) : (
          <div className="space-y-3">
            {stories.map((story) => (
              <a
                key={story.id}
                href={story.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-900/60 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
                  {story.source && <span>{story.source}</span>}
                  {story.published_at && <span>{new Date(story.published_at).toLocaleString()}</span>}
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      story.sentiment_score > 0.2
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : story.sentiment_score < -0.2
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {sentimentLabel(story.sentiment_score)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{story.title}</p>
                {story.summary && (
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{story.summary}</p>
                )}
                {story.tickers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {story.tickers.slice(0, 5).map((ticker) => (
                      <span
                        key={`${story.id}-${ticker}`}
                        className="rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[11px] font-medium"
                      >
                        {ticker}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
