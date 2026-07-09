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

export interface CompositeStockExposure {
  ticker: string;
  name: string;
  total_weight_pct: number;
  direct_weight_pct: number;
  fund_lookthrough_weight_pct: number;
  source_fund_count: number;
}

export interface PortfolioSummary {
  total_value: number;
  sector_weights: SectorWeight[];
  top_stocks: StockExposure[];
  composite_stocks: CompositeStockExposure[];
  overlap_stocks: CompositeStockExposure[];
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
  news_sentiment_score: number;
  news_story_count: number;
  next_earnings_date: string | null;
  days_to_next_earnings: number | null;
  earnings_proximity_bonus: number;
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

export interface MarketIndexReturn {
  name: string;
  symbol: string;
  ytd_return_pct: number | null;
  price: number | null;
}

export interface MarketStory {
  id: string;
  title: string;
  source: string | null;
  summary: string | null;
  url: string;
  published_at: string | null;
  tickers: string[];
  sentiment_score: number;
}

export interface MarketOverviewResponse {
  sectors: SectorETFReturn[];
  indexes: MarketIndexReturn[];
  stories: MarketStory[];
}
