"use client";

import { useEffect, useState } from "react";
import { BarChart2, TrendingUp, AlertCircle, Save, History, Pencil, Trash2, FolderOpen } from "lucide-react";

import PortfolioForm from "@/components/PortfolioForm";
import SectorSummary from "@/components/SectorSummary";
import RecommendationList from "@/components/RecommendationList";
import MarketOverview from "@/components/MarketOverview";
import { api } from "@/lib/api";
import type {
  HoldingIn,
  MarketIndexReturn,
  MarketStory,
  PortfolioSnapshotListItem,
  PortfolioSummary,
  RecommendationResponse,
  SectorETFReturn,
} from "@/lib/types";

type Tab = "summary" | "recommendations" | "market";

export default function Home() {
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [recs, setRecs] = useState<RecommendationResponse | null>(null);
  const [market, setMarket] = useState<SectorETFReturn[] | null>(null);
  const [marketIndexes, setMarketIndexes] = useState<MarketIndexReturn[]>([]);
  const [marketStories, setMarketStories] = useState<MarketStory[]>([]);
  const [currentHoldings, setCurrentHoldings] = useState<HoldingIn[]>([]);
  const [history, setHistory] = useState<PortfolioSnapshotListItem[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyBusyId, setHistoryBusyId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const currencyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const loadHistory = async () => {
    try {
      const items = await api.getPortfolioHistory(20);
      setHistory(items);
    } catch {
      // Ignore history fetch failure; main workflow should stay usable.
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleAnalyse = async (holdings: HoldingIn[]) => {
    setLoading(true);
    setError(null);
    const portfolio = { holdings };
    try {
      const [s, r, m] = await Promise.all([
        api.analysePortfolio(portfolio),
        api.getRecommendations(portfolio),
        api.getMarketOverview(),
      ]);
      setCurrentHoldings(holdings);
      setSummary(s);
      setRecs(r);
      setMarket(m.sectors);
      setMarketIndexes(m.indexes);
      setMarketStories(m.stories);
      setTab("summary");
      setSaveStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!currentHoldings.length) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const saved = await api.savePortfolioSnapshot({ holdings: currentHoldings });
      setSaveStatus(`Saved snapshot #${saved.id}.`);
      await loadHistory();
    } catch (err) {
      setSaveStatus(err instanceof Error ? `Save failed: ${err.message}` : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleLoadSnapshot = async (snapshotId: number) => {
    setLoading(true);
    setError(null);
    try {
      const [snapshot, m] = await Promise.all([
        api.getPortfolioSnapshot(snapshotId),
        api.getMarketOverview(),
      ]);
      setCurrentHoldings(snapshot.holdings);
      setSummary(snapshot.summary);
      setRecs(snapshot.recommendations);
      setMarket(m.sectors);
      setMarketIndexes(m.indexes);
      setMarketStories(m.stories);
      setTab("summary");
      setSaveStatus(`Loaded snapshot #${snapshot.id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load snapshot.");
    } finally {
      setLoading(false);
    }
  };

  const handleRenameStart = (item: PortfolioSnapshotListItem) => {
    setConfirmDeleteId(null);
    setRenamingId(item.id);
    setRenameValue(item.label ?? "");
  };

  const handleRenameConfirm = async (id: number) => {
    setHistoryBusyId(id);
    setSaveStatus(null);
    try {
      await api.renamePortfolioSnapshot(id, renameValue.trim() ? renameValue.trim() : null);
      setSaveStatus(`Renamed snapshot #${id}.`);
      setRenamingId(null);
      await loadHistory();
    } catch (err) {
      setSaveStatus(err instanceof Error ? `Rename failed: ${err.message}` : "Rename failed.");
    } finally {
      setHistoryBusyId(null);
    }
  };

  const handleDeleteStart = (item: PortfolioSnapshotListItem) => {
    setRenamingId(null);
    setConfirmDeleteId(item.id);
  };

  const handleDeleteConfirm = async (id: number) => {
    setHistoryBusyId(id);
    setSaveStatus(null);
    try {
      await api.deletePortfolioSnapshot(id);
      setSaveStatus(`Deleted snapshot #${id}.`);
      setConfirmDeleteId(null);
      await loadHistory();
    } catch (err) {
      setSaveStatus(err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed.");
    } finally {
      setHistoryBusyId(null);
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "summary", label: "Portfolio Summary", icon: <BarChart2 className="h-4 w-4" /> },
    { key: "recommendations", label: "Recommendations", icon: <TrendingUp className="h-4 w-4" /> },
    { key: "market", label: "Market Overview", icon: <BarChart2 className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold">Stock Picker</h1>
          <span className="text-xs text-gray-500 ml-auto">Portfolio Diversification Assistant</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Portfolio entry */}
        <section className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Enter Your Portfolio</h2>
          <PortfolioForm onSubmit={handleAnalyse} loading={loading} />
        </section>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Analysis failed</p>
              <p className="text-sm mt-0.5">{error}</p>
              <p className="text-xs mt-1 text-red-500">Make sure the backend is running at http://localhost:8000</p>
            </div>
          </div>
        )}

        {/* Results */}
        {(summary || recs || market) && (
          <section className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="px-6 pt-4 pb-2 flex flex-wrap items-center gap-3 border-b border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleSaveSnapshot}
                disabled={saving || !currentHoldings.length}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save Snapshot"}
              </button>
              {saveStatus && <p className="text-xs text-gray-500 dark:text-gray-400">{saveStatus}</p>}
            </div>

            {/* Tab bar */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 flex gap-1 overflow-x-auto">
              {tabs.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    tab === key
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {icon}
                  {label}
                  {key === "recommendations" && recs && (
                    <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs px-1.5 py-0.5">
                      {recs.underweight_sectors.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-6">
              {tab === "summary" && summary && <SectorSummary summary={summary} />}
              {tab === "recommendations" && recs && <RecommendationList data={recs} />}
              {tab === "market" && market && (
                <MarketOverview indexes={marketIndexes} sectors={market} stories={marketStories} />
              )}
            </div>
          </section>
        )}

        <section className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-4 w-4 text-gray-500" />
            <h2 className="text-base font-semibold">Saved Portfolio History</h2>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No saved snapshots yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      Snapshot #{item.id} {item.label ? `- ${item.label}` : ""}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {item.holdings_count} holdings • {currencyFmt.format(item.total_value)} total value
                  </p>

                  {/* Inline rename editor */}
                  {renamingId === item.id && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRenameConfirm(item.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        placeholder="Snapshot label (optional)"
                        className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRenameConfirm(item.id)}
                        disabled={historyBusyId === item.id}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Inline delete confirmation */}
                  {confirmDeleteId === item.id && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-1.5">
                      <p className="flex-1 text-xs text-red-700 dark:text-red-300">Delete this snapshot? This cannot be undone.</p>
                      <button
                        type="button"
                        onClick={() => void handleDeleteConfirm(item.id)}
                        disabled={historyBusyId === item.id}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Action buttons — hidden while rename/delete is active for this row */}
                  {renamingId !== item.id && confirmDeleteId !== item.id && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleLoadSnapshot(item.id)}
                        disabled={historyBusyId === item.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRenameStart(item)}
                        disabled={historyBusyId === item.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStart(item)}
                        disabled={historyBusyId === item.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Welcome state */}
        {!summary && !loading && !error && (
          <div className="text-center py-16 text-gray-400 dark:text-gray-600">
            <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-sm">Add your holdings above and click <strong>Analyse Portfolio</strong> to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}



