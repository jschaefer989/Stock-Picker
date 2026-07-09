// Shared TypeScript types mirroring backend Pydantic models

export interface HoldingIn {
  ticker: string;
  name?: string;
  value: number;
  holding_type: "etf" | "mutual_fund" | "stock";
}

export interface PortfolioIn {
  holdings: HoldingIn[];
}

export interface PortfolioSaveRequest {
  holdings: HoldingIn[];
  label?: string;
}

export interface SectorWeight {
  sector: string;
  weight_pct: number;
}

export interface StockExposure {
  ticker: string;
  name: string;
  weight_pct: number;
}

export interface PortfolioSummary {
  total_value: number;
  sector_weights: SectorWeight[];
  top_stocks: StockExposure[];
}

export interface Recommendation {
  ticker: string;
  name: string;
  category: string;
  rationale: string;
  sectors_covered: string[];
  ytd_return_pct: number | null;
  ranking_score: number;
  momentum_3m_pct: number;
  avg_dollar_volume_3m: number;
  liquidity_log10: number;
  expense_ratio_pct: number | null;
  expense_penalty: number;
}

export interface RecommendationResponse {
  underweight_sectors: string[];
  recommendations: Recommendation[];
}

export interface PortfolioSnapshotListItem {
  id: number;
  created_at: string;
  label: string | null;
  holdings_count: number;
  total_value: number;
}

export interface PortfolioSnapshot {
  id: number;
  created_at: string;
  label: string | null;
  holdings: HoldingIn[];
  summary: PortfolioSummary;
  recommendations: RecommendationResponse;
}

export interface SnapshotDeleteResponse {
  status: string;
  id: number;
}

export interface SectorETFReturn {
  sector: string;
  etf_ticker: string;
  ytd_return_pct: number | null;
}
