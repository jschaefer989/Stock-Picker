"use client";

import { useRef, useState } from "react";
import { PlusCircle, Trash2, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import type { HoldingIn } from "@/lib/types";
import { parsePortfolioCsv } from "@/lib/csvPortfolio";

interface Props {
  onSubmit: (holdings: HoldingIn[]) => void;
  loading: boolean;
}

const EMPTY: HoldingIn = { ticker: "", name: "", value: 0, holding_type: "etf" };
const PAGE_SIZE = 10;

export default function PortfolioForm({ onSubmit, loading }: Props) {
  const [rows, setRows] = useState<HoldingIn[]>([{ ...EMPTY }]);
  const [page, setPage] = useState(0);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // update/remove take an absolute row index
  const update = (absIdx: number, field: keyof HoldingIn, value: string | number) => {
    setRows((prev) => {
      const next = [...prev];
      next[absIdx] = { ...next[absIdx], [field]: value } as HoldingIn;
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => {
      const next = [...prev, { ...EMPTY }];
      // jump to the last page so the new row is visible
      setPage(Math.floor((next.length - 1) / PAGE_SIZE));
      return next;
    });
  };

  const removeRow = (absIdx: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, idx) => idx !== absIdx);
      // if removing shrinks us off the current page, step back
      setPage((p) => Math.min(p, Math.max(0, Math.ceil(next.length / PAGE_SIZE) - 1)));
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = rows.filter((r) => r.ticker.trim() && r.value > 0);
    if (!valid.length) return;
    onSubmit(valid.map((r) => ({ ...r, ticker: r.ticker.trim().toUpperCase() })));
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadMessage(null);

    try {
      const text = await file.text();
      const parsedRows = parsePortfolioCsv(text);
      setRows(parsedRows);
      setPage(0);
      setUploadMessage(`Imported ${parsedRows.length} holding(s) from ${file.name}.`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to parse CSV file.");
    } finally {
      // Reset so selecting the same file again triggers onChange
      e.target.value = "";
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> Upload CSV
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvUpload}
          />

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Expected columns include: Symbol, Description, Mkt Val (Market Value), Asset Type.
          </p>
        </div>

        {uploadMessage && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{uploadMessage}</p>
        )}
        {uploadError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        {/* Pagination header */}
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{rows.length} holdings &mdash; showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, rows.length)}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1">Page {page + 1} / {Math.ceil(rows.length / PAGE_SIZE)}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(Math.ceil(rows.length / PAGE_SIZE) - 1, p + 1))}
                disabled={page >= Math.ceil(rows.length / PAGE_SIZE) - 1}
                className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Ticker</th>
              <th className="px-4 py-3 text-left">Name (optional)</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Market Value ($)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, relIdx) => {
              const absIdx = page * PAGE_SIZE + relIdx;
              return (
              <tr key={absIdx} className="bg-white dark:bg-gray-900">
                <td className="px-4 py-2">
                  <input
                    className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="VTI"
                    value={row.ticker}
                    onChange={(e) => update(absIdx, "ticker", e.target.value)}
                    required
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className="w-48 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Vanguard Total Stock"
                    value={row.name ?? ""}
                    onChange={(e) => update(absIdx, "name", e.target.value)}
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={row.holding_type}
                    onChange={(e) => update(absIdx, "holding_type", e.target.value)}
                  >
                    <option value="etf">ETF</option>
                    <option value="mutual_fund">Mutual Fund</option>
                    <option value="stock">Stock</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    className="w-36 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="number"
                    min={1}
                    step="any"
                    placeholder="10000"
                    value={row.value || ""}
                    onChange={(e) => update(absIdx, "value", parseFloat(e.target.value) || 0)}
                    required
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(absIdx)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
        >
          <PlusCircle className="h-4 w-4" /> Add holding
        </button>

        <button
          type="submit"
          disabled={loading}
          className="ml-auto rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Analysing…" : "Analyse Portfolio"}
        </button>
      </div>
    </form>
  );
}
