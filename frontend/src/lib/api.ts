import type {
  PortfolioIn,
  PortfolioSaveRequest,
  PortfolioSnapshot,
  PortfolioSnapshotListItem,
  PortfolioSummary,
  RecommendationResponse,
  MarketOverviewResponse,
  SectorETFReturn,
  SnapshotDeleteResponse,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  analysePortfolio: (portfolio: PortfolioIn) =>
    post<PortfolioSummary>("/api/portfolio/analyse", portfolio),

  getRecommendations: (portfolio: PortfolioIn) =>
    post<RecommendationResponse>("/api/portfolio/recommend", portfolio),

  savePortfolioSnapshot: (payload: PortfolioSaveRequest) =>
    post<PortfolioSnapshotListItem>("/api/portfolio/save", payload),

  getPortfolioHistory: (limit = 25) =>
    get<PortfolioSnapshotListItem[]>(`/api/portfolio/history?limit=${limit}`),

  getPortfolioSnapshot: (snapshotId: number) =>
    get<PortfolioSnapshot>(`/api/portfolio/history/${snapshotId}`),

  renamePortfolioSnapshot: (snapshotId: number, label: string | null) =>
    put<PortfolioSnapshotListItem>(`/api/portfolio/history/${snapshotId}`, { label }),

  deletePortfolioSnapshot: (snapshotId: number) =>
    del<SnapshotDeleteResponse>(`/api/portfolio/history/${snapshotId}`),

  getSectorReturns: () => get<SectorETFReturn[]>("/api/market/sectors"),

  getMarketOverview: (limit = 15) =>
    get<MarketOverviewResponse>(`/api/market/overview?limit=${limit}`),
};
