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
  current_price: number | null;
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
  opportunistic_recommendations: Recommendation[];
}

export interface RecommendationPageResponse {
  underweight_sectors: string[];
  items: Recommendation[];
  has_more: boolean;
}

export interface RelatedRecommendationResponse {
  source_ticker: string;
  items: Recommendation[];
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

export type PurchasePlanInputMode = "dollars" | "shares";

export interface PurchasePlanLineIn {
  ticker: string;
  name?: string;
  holding_type: "etf" | "mutual_fund" | "stock";
  input_mode: PurchasePlanInputMode;
  dollars?: number;
  shares?: number;
}

export interface PurchasePlanEvaluateRequest {
  current_holdings: HoldingIn[];
  plan_lines: PurchasePlanLineIn[];
}

export interface PurchasePlanLineResult {
  ticker: string;
  name: string;
  holding_type: "etf" | "mutual_fund" | "stock";
  input_mode: PurchasePlanInputMode;
  dollars: number;
  shares: number | null;
  resolved_price: number | null;
}

export interface PlanSectorDelta {
  sector: string;
  before_weight_pct: number;
  after_weight_pct: number;
  delta_weight_pct: number;
}

export interface PlanScoreBreakdown {
  sector_balance_before: number;
  sector_balance_after: number;
  concentration_before: number;
  concentration_after: number;
  overlap_before: number;
  overlap_after: number;
  diversification_before: number;
  diversification_after: number;
  overall_before: number;
  overall_after: number;
}

export interface PlanSuggestion {
  action: string;
  severity: string;
  message: string;
}

export interface PurchasePlanEvaluationResponse {
  normalized_plan_lines: PurchasePlanLineResult[];
  invalid_plan_lines: string[];
  projected_holdings: HoldingIn[];
  before_summary: PortfolioSummary;
  after_summary: PortfolioSummary;
  sector_deltas: PlanSectorDelta[];
  score_breakdown: PlanScoreBreakdown;
  suggestions: PlanSuggestion[];
}
