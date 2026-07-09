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
import type { SectorETFReturn } from "@/lib/types";

interface Props {
  data: SectorETFReturn[];
}

export default function MarketOverview({ data }: Props) {
  const sorted = [...data].sort((a, b) => (b.ytd_return_pct ?? 0) - (a.ytd_return_pct ?? 0));

  return (
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
          <Tooltip formatter={(v) => (v != null ? `${(v as number).toFixed(2)}%` : 'N/A')} />
          <ReferenceLine x={0} stroke="#6b7280" />
          <Bar dataKey="ytd_return_pct" radius={[0, 4, 4, 0]}>
            {sorted.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  (entry.ytd_return_pct ?? 0) >= 0 ? "#10b981" : "#ef4444"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
