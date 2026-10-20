export interface TelemetryRecord {
  timestamp: string;
  glucose: number;
  heart_rate: number;
  steps: number;
  insulin_units?: number;
  carbs_grams?: number;
  carb_input?: number;
  bolus_volume_delivered?: number;
}

export interface LiveHrPoint {
  timestamp: string;
  heart_rate: number;
  rr_ms?: number;
  activity_state?: string;
  steps?: number;
}

export interface TwinForecast {
  current_glucose: number;
  trend: string;
  alert_level: string;
  alert_message: string;
  adverse_risk_prob: number;
  diabetes_type?: string;
  forecast: {
    t_plus_30min: number;
    t_plus_60min: number;
    t_plus_120min: number;
  };
}

export interface PatientEHR {
  patient_id: string;
  name: string;
  age: number;
  gender: string;
  city: string;
  hba1c_pct: number;
  bmi: number;
  clinical_risk_tier: string;
  diabetes_type?: string;
  delivery_system: string;
  cgm_device?: string;
  isf_mg_dl_per_unit?: number;
  icr_grams_per_unit?: number;
  basal_rate_u_hr?: number;
  homa_ir?: number;
  oral_medications?: string;
  target_tir_pct?: number;
  years_with_t1d?: number;
  years_with_diabetes?: number;
}

export interface CDSSAlert {
  pattern_id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  status: "ACTIVE" | "ACKNOWLEDGED" | "DISMISSED";
  timestamp: string;
  description: string;
  clinical_rationale: string;
  recommended_action: string;
}
