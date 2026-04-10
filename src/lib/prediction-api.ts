export const REQUESTED_PREDICTION_MODEL = "champion_pure";
export const PERSISTED_PREDICTION_MODEL = "dixon_coles";

export interface PredictionApiOutcomePrice {
  probability: number;
  fair_odds: number;
}

export interface PredictionApiFairOdds {
  home: PredictionApiOutcomePrice;
  draw: PredictionApiOutcomePrice;
  away: PredictionApiOutcomePrice;
}

export interface PredictionApiTotalsMarket {
  line: number;
  over_probability: number;
  under_probability: number;
  over_fair_odds: number;
  under_fair_odds: number;
}

export interface PredictionApiProjectionQuality {
  confidence_score: number;
  confidence_band: string;
  data_quality_score: number;
  data_quality_band: string;
  uncertainty: number;
  calibration_applied: boolean;
  notes: string[];
}

export interface PredictionApiPrediction {
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  lambda_home: number;
  lambda_away: number;
  projected_home_goals: number;
  projected_away_goals: number;
  fair_odds: PredictionApiFairOdds;
  totals: PredictionApiTotalsMarket[];
  btts_yes_prob: number;
  btts_yes_fair_odds: number;
  model_version: string;
  model_family: string;
  blended: boolean;
  gating_status: string;
  projection_quality: PredictionApiProjectionQuality;
  score_matrix: number[][];
  metadata: Record<string, unknown> | null;
}

export interface PredictionApiBatchResponse {
  predictions: PredictionApiPrediction[];
}

export interface PredictionApiRetrainResponse {
  success: boolean;
  message: string;
  returncode: number;
}

export function getPredictionApiBaseUrl() {
  const baseUrl = process.env.PREDICTION_API_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/+$/, "");
}

export function getPredictionApiUrl(path: string) {
  const baseUrl = getPredictionApiBaseUrl();
  if (!baseUrl) {
    return null;
  }

  return new URL(path.replace(/^\//, ""), `${baseUrl}/`).toString();
}

export function getPredictionApiSecretOrThrow() {
  const secret = process.env.PREDICTION_API_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "PREDICTION_API_SECRET must be configured when prediction jobs are enabled"
    );
  }

  return secret;
}

export function getPredictionApiJsonHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getPredictionApiSecretOrThrow()}`,
  };
}
