"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PortfolioSummary } from "@/lib/types";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#14b8a6", "#f97316", "#84cc16", "#ec4899", "#06b6d4", "#a78bfa",
];

interface Props {
  summary: PortfolioSummary;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

export default function SectorSummary({ summary }: Props) {
  const pieData = summary.sector_weights.map((sw) => ({
    name: sw.sector,
    value: sw.weight_pct,
  }));

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Value</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary.total_value)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sectors</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{summary.sector_weights.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Top Holding</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {summary.top_stocks[0]?.ticker ?? "—"}
            {summary.top_stocks[0] && (
              <span className="ml-1 text-sm font-normal text-gray-500">
                {summary.top_stocks[0].weight_pct.toFixed(1)}%
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Pie chart */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Sector Allocation</h3>
          <ResponsiveContainer width="100%" height={360} className="flex-1 min-h-0">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Pie
                data={pieData}
                cx="50%"
                cy="42%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => (v != null ? `${(v as number).toFixed(2)}%` : 'N/A')} />
              <Legend
                iconType="circle"
                iconSize={8}
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ paddingTop: 12, fontSize: 11, lineHeight: "20px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Sector table */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Sector Weights</h3>
          <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left pb-2">Sector</th>
                <th className="text-right pb-2">Weight</th>
                <th className="text-right pb-2">Bar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {summary.sector_weights.map((sw, i) => (
                <tr key={sw.sector}>
                  <td className="py-1.5 flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    {sw.sector}
                  </td>
                  <td className="py-1.5 text-right font-mono">{sw.weight_pct.toFixed(2)}%</td>
                  <td className="py-1.5 pl-4 w-28">
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.min(sw.weight_pct, 100)}%`,
                          background: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Top stocks */}
      {summary.top_stocks.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Top Individual Stock Exposures</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {summary.top_stocks.slice(0, 12).map((s) => (
              <div key={s.ticker} className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{s.ticker}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{s.name}</p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{s.weight_pct.toFixed(2)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
