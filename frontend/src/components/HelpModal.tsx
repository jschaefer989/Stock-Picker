"use client";

import { useEffect, useCallback } from "react";
import { X, TrendingUp, Upload, Save, BarChart2, Info } from "lucide-react";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-xs border-collapse mb-2">
      <tbody>
        {rows.map(([label, desc]) => (
          <tr key={label} className="border-b border-gray-700 last:border-0">
            <td className="py-1.5 pr-4 font-semibold text-gray-200 whitespace-nowrap align-top w-36">{label}</td>
            <td className="py-1.5 text-gray-400">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <Info className="h-5 w-5 text-blue-400" />
          <h2 className="text-base font-bold text-white">Stock Picker – Help</h2>
          <span className="ml-auto text-xs text-gray-500">Press Esc to close</span>
          <button
            onClick={onClose}
            aria-label="Close help"
            className="ml-2 rounded-lg p-1 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 text-sm text-gray-300 space-y-1">

          {/* What is this? */}
          <Section title="What is Stock Picker?">
            <p className="text-gray-400 text-xs leading-relaxed">
              Stock Picker analyses your investment portfolio, shows how your money is spread across
              market sectors, highlights gaps in diversification, and suggests funds or stocks to
              consider. All data is fetched live from Yahoo Finance — no account or subscription needed.
            </p>
            <p className="mt-2 text-xs text-amber-400/80">
              ⚠ This is not financial advice. Always do your own research before investing.
            </p>
          </Section>

          {/* Entering your portfolio */}
          <Section title="Entering Your Portfolio">
            <div className="flex items-start gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs font-semibold text-gray-200">Manual entry</span>
            </div>
            <Table rows={[
              ["Ticker", "The stock or fund symbol (e.g. VTI, AAPL, FXAIX). Required."],
              ["Name", "A friendly label — optional, for your own reference."],
              ["Type", "ETF, Mutual Fund, or Stock. Affects fund look-through analysis."],
              ["Market Value ($)", "The current dollar value of your position. Required."],
            ]} />
            <p className="text-xs text-gray-500 mt-1">
              Click <strong className="text-gray-300">+ Add holding</strong> for more rows.
              Use the page arrows to navigate if you have more than 10 holdings.
              Click <strong className="text-gray-300">Analyse Portfolio</strong> when done
              (analysis takes 5–15 s while live data is fetched).
            </p>

            <div className="flex items-start gap-2 mt-3 mb-2">
              <Upload className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs font-semibold text-gray-200">CSV import</span>
            </div>
            <p className="text-xs text-gray-500">
              Click <strong className="text-gray-300">Upload CSV</strong> to import a holdings export
              from your brokerage (Fidelity, Schwab, TD Ameritrade, etc.).
              The file must include columns named <em>Symbol</em>, <em>Description</em>,{" "}
              <em>Mkt Val (Market Value)</em>, and <em>Asset Type</em>.
              Cash and money-market rows are filtered out automatically.
            </p>
          </Section>

          {/* Portfolio Summary */}
          <Section title="Portfolio Summary Tab">
            <div className="flex items-start gap-2 mb-1">
              <BarChart2 className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs font-semibold text-gray-200">What you see</span>
            </div>
            <Table rows={[
              ["Total Value", "Sum of all holdings you entered."],
              ["Sectors", "Number of distinct market sectors your portfolio spans."],
              ["Top Holding", "The single largest position by portfolio weight."],
              ["Sector Allocation", "Donut chart + weight table showing how your money is split across GICS sectors. ETF and mutual fund holdings are looked through to underlying stocks."],
              ["Overlap Watch", "Stocks you own both directly and through a fund — shows your true combined exposure."],
            ]} />
          </Section>

          {/* Recommendations */}
          <Section title="Recommendations Tab">
            <p className="text-xs text-gray-500 mb-2">
              Sectors with less than 5 % portfolio weight are highlighted as{" "}
              <span className="text-amber-400">underweight</span>. Recommendations aim to fill those gaps.
            </p>
            <Table rows={[
              ["Diversification Only", "Picks chosen specifically to reduce sector gaps."],
              ["Opportunistic Only", "High-momentum picks with positive sentiment, regardless of sector."],
              ["Both (default)", "Shows all recommendations."],
              ["All / Funds / Stocks", "Filter to show only ETFs & mutual funds or only individual stocks."],
            ]} />
            <p className="text-xs text-gray-500 mt-2 font-semibold text-gray-300">Ranking factors:</p>
            <Table rows={[
              ["Momentum (3M)", "3-month price change — positive momentum is rewarded."],
              ["Avg $ Volume (3M)", "Average daily dollar trading volume — easier to buy/sell."],
              ["Expense Ratio", "Annual fund cost (ETFs/funds only) — lower is better."],
              ["News Sentiment", "Aggregate sentiment of recent news stories."],
              ["Rank Score", "Composite of the above factors — higher is better."],
            ]} />
          </Section>

          {/* Market Overview */}
          <Section title="Market Overview Tab">
            <Table rows={[
              ["Major Indexes", "Year-to-date performance for S&P 500, NASDAQ, Dow Jones, and Russell 2000."],
              ["Sector YTD Chart", "Bar chart comparing every sector's year-to-date return via Vanguard sector ETFs."],
              ["Market Stories", "Recent headlines with AI-scored sentiment (Positive / Neutral / Negative)."],
            ]} />
          </Section>

          {/* Snapshots */}
          <Section title="Saving & Managing Snapshots">
            <div className="flex items-start gap-2 mb-1">
              <Save className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs font-semibold text-gray-200">Snapshot actions</span>
            </div>
            <Table rows={[
              ["Save Snapshot", "Stores your holdings, sector summary, and recommendations at this moment."],
              ["Load", "Restores holdings and results from a saved snapshot (market data is refreshed)."],
              ["Rename", "Adds a descriptive label (e.g. 'Q3 2025 rebalance'). Press Enter to confirm."],
              ["Delete", "Permanently removes the snapshot — cannot be undone."],
            ]} />
            <p className="text-xs text-gray-500 mt-1">
              Snapshots are stored in <code className="text-gray-300">stock_picker.db</code> next to{" "}
              <code className="text-gray-300">StockPicker.exe</code>. Keep that file to preserve history.
            </p>
          </Section>

          {/* Tips */}
          <Section title="Tips & Troubleshooting">
            <ul className="text-xs text-gray-500 space-y-1.5 list-none">
              <li><span className="text-gray-300 font-medium">Slow analysis?</span> Yahoo Finance is queried live. Large portfolios or slow internet can take 30+ seconds.</li>
              <li><span className="text-gray-300 font-medium">N/A metrics?</span> Yahoo Finance doesn't always publish every data point (e.g. expense ratios for stocks).</li>
              <li><span className="text-gray-300 font-medium">App won't open?</span> Close the terminal window, wait 10 seconds, and double-click StockPicker.exe again. Ensure nothing else uses port 8000.</li>
              <li><span className="text-gray-300 font-medium">CSV won't import?</span> Rename your export columns in a spreadsheet so they match the expected names exactly.</li>
              <li><span className="text-gray-300 font-medium">Data privacy:</span> All data stays on your computer. Only live Yahoo Finance API calls leave your machine.</li>
            </ul>
          </Section>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 flex-shrink-0 text-xs text-gray-600 text-center">
          Stock Picker v1.0 · Press <kbd className="bg-gray-700 text-gray-300 rounded px-1 py-0.5">F1</kbd> or click <strong className="text-gray-400">Help</strong> to open this window at any time
        </div>
      </div>
    </div>
  );
}
