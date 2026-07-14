import type {
  PortfolioIn,
  PortfolioSaveRequest,
  PortfolioSnapshot,
  PortfolioSnapshotListItem,
  PortfolioSummary,
  RecommendationPageResponse,
  RecommendationResponse,
  RelatedRecommendationResponse,
  MarketOverviewResponse,
  SectorETFReturn,
  SnapshotDeleteResponse,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function post<T>(path: string, body: unknown, query?: Record<string, string | number | undefined | null>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && `${value}` !== "") {
        url.searchParams.set(key, `${value}`);
      }
    }
  }
  const res = await fetch(url.toString(), {
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

  getRecommendationPage: (
    portfolio: PortfolioIn,
    params: {
      section: "diversification" | "opportunistic";
      assetType: "all" | "funds" | "stocks";
      maxPrice: number | null;
      offset: number;
      limit?: number;
    },
  ) =>
    post<RecommendationPageResponse>("/api/portfolio/recommend/page", portfolio, {
      section: params.section,
      asset_type: params.assetType,
      max_price: params.maxPrice,
      offset: params.offset,
      limit: params.limit ?? 6,
    }),

  getRelatedRecommendations: (
    portfolio: PortfolioIn,
    params: {
      sourceTicker: string;
      excludeTickers: string[];
      assetType: "all" | "funds" | "stocks";
      maxPrice: number | null;
      limit?: number;
    },
  ) =>
    post<RelatedRecommendationResponse>("/api/portfolio/recommend/related", portfolio, {
      source_ticker: params.sourceTicker,
      exclude_tickers: params.excludeTickers.join(","),
      asset_type: params.assetType,
      max_price: params.maxPrice,
      limit: params.limit ?? 6,
    }),

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
