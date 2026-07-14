"use client";

import { PlusCircle, Trash2 } from "lucide-react";

import type {
  PurchasePlanEvaluationResponse,
  PurchasePlanInputMode,
  PurchasePlanLineIn,
} from "@/lib/types";

interface Props {
  planLines: PurchasePlanLineIn[];
  currentHoldingsCount: number;
  evaluating: boolean;
  error: string | null;
  status: string | null;
  result: PurchasePlanEvaluationResponse | null;
  onAddManual: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<PurchasePlanLineIn>) => void;
  onEvaluate: () => void;
}

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function severityClass(severity: string): string {
  if (severity === "high") {
    return "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300";
  }
  if (severity === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300";
}

export default function PurchasePlan({
  planLines,
  currentHoldingsCount,
  evaluating,
  error,
  status,
  result,
  onAddManual,
  onRemove,
  onUpdate,
  onEvaluate,
}: Props) {
  const canEvaluate = currentHoldingsCount > 0 && planLines.length > 0;

  const updateInputMode = (index: number, mode: PurchasePlanInputMode) => {
    onUpdate(index, {
      input_mode: mode,
      dollars: mode === "dollars" ? planLines[index].dollars : undefined,
      shares: mode === "shares" ? planLines[index].shares : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Purchase Plan Builder</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Add funds or stocks from recommendations, or add manual ticker rows and evaluate the projected impact.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddManual}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Manual Ticker
          </button>
        </div>

        {status && <p className="mt-3 text-xs text-blue-600 dark:text-blue-300">{status}</p>}
        {currentHoldingsCount === 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            Analyse a portfolio first so the plan can compare before vs after results.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 uppercase text-xs">
            <tr>
              <th className="px-3 py-3 text-left">Ticker</th>
              <th className="px-3 py-3 text-left">Name</th>
              <th className="px-3 py-3 text-left">Type</th>
              <th className="px-3 py-3 text-left">Mode</th>
              <th className="px-3 py-3 text-left">Amount</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {planLines.length === 0 && (
              <tr className="bg-white dark:bg-gray-900">
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  No planned purchases yet. Add a manual row or use Add to Plan in Recommendations.
                </td>
              </tr>
            )}
            {planLines.map((line, index) => (
              <tr key={`${line.ticker || "new"}-${index}`} className="bg-white dark:bg-gray-900">
                <td className="px-3 py-2">
                  <input
                    value={line.ticker}
                    onChange={(e) => onUpdate(index, { ticker: e.target.value.toUpperCase() })}
                    placeholder="VTI"
                    className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={line.name ?? ""}
                    onChange={(e) => onUpdate(index, { name: e.target.value })}
                    placeholder="Optional"
                    className="w-44 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={line.holding_type}
                    onChange={(e) => onUpdate(index, { holding_type: e.target.value as PurchasePlanLineIn["holding_type"] })}
                    className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="etf">ETF</option>
                    <option value="mutual_fund">Mutual Fund</option>
                    <option value="stock">Stock</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden w-fit">
                    <button
                      type="button"
                      className={`px-2 py-1 text-xs font-semibold ${
                        line.input_mode === "dollars"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300"
                      }`}
                      onClick={() => updateInputMode(index, "dollars")}
                    >
                      Dollars
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 text-xs font-semibold ${
                        line.input_mode === "shares"
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300"
                      }`}
                      onClick={() => updateInputMode(index, "shares")}
                    >
                      Shares
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {line.input_mode === "dollars" ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.dollars ?? ""}
                      onChange={(e) => onUpdate(index, { dollars: Number(e.target.value) || undefined })}
                      placeholder="1000"
                      className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={line.shares ?? ""}
                      onChange={(e) => onUpdate(index, { shares: Number(e.target.value) || undefined })}
                      placeholder="10"
                      className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove planned line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Each row supports either dollar amount or shares. Share rows are priced with live market data when evaluated.
        </p>
        <button
          type="button"
          onClick={onEvaluate}
          disabled={!canEvaluate || evaluating}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {evaluating ? "Evaluating Plan..." : "Evaluate Plan"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.invalid_plan_lines.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-4">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Rows skipped</p>
              <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                {result.invalid_plan_lines.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Overall Score</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {result.score_breakdown.overall_before.toFixed(1)} {"→"} {result.score_breakdown.overall_after.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Sector Balance</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {result.score_breakdown.sector_balance_before.toFixed(1)} {"→"} {result.score_breakdown.sector_balance_after.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Concentration</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {result.score_breakdown.concentration_before.toFixed(1)} {"→"} {result.score_breakdown.concentration_after.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Overlap</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {result.score_breakdown.overlap_before.toFixed(1)} {"→"} {result.score_breakdown.overlap_after.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Diversification</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {result.score_breakdown.diversification_before.toFixed(1)} {"→"} {result.score_breakdown.diversification_after.toFixed(1)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Plan Guidance</h4>
            <div className="space-y-2">
              {result.suggestions.map((suggestion, idx) => (
                <div key={`${suggestion.action}-${idx}`} className={`rounded-lg border px-3 py-2 text-xs ${severityClass(suggestion.severity)}`}>
                  <p className="font-semibold uppercase tracking-wide">{suggestion.action}</p>
                  <p className="mt-1">{suggestion.message}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Normalized Plan Lines</h4>
              <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                {result.normalized_plan_lines.map((line) => (
                  <div key={`${line.ticker}-${line.holding_type}`} className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-2.5 py-2">
                    <span>
                      {line.ticker} ({line.holding_type})
                    </span>
                    <span>{currencyFmt.format(line.dollars)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Largest Sector Changes</h4>
              <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                {result.sector_deltas
                  .slice()
                  .sort((a, b) => Math.abs(b.delta_weight_pct) - Math.abs(a.delta_weight_pct))
                  .slice(0, 8)
                  .map((delta) => (
                    <div key={delta.sector} className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-2.5 py-2">
                      <span>{delta.sector}</span>
                      <span>
                        {delta.before_weight_pct.toFixed(2)}% {"→"} {delta.after_weight_pct.toFixed(2)}% ({delta.delta_weight_pct >= 0 ? "+" : ""}
                        {delta.delta_weight_pct.toFixed(2)}%)
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
