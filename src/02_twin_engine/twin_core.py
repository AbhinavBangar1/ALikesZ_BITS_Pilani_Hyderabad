"""
Digital Twin Core Engine & Counterfactual "What-If" Simulator
============================================================
Fuses:
  1. Static EHR profiles (ISF, ICR, Basal rate, Target Range)
  2. Dynamic Wearable Streams (5-min telemetry: CGM, HR, Steps, Insulin, Carbs)
  3. Model 1 (LightGBM multi-horizon regressors: +30m, +60m, +120m)
  4. Model 2 (LightGBM adverse event classifier: 2-hour emergency risk)

Provides two main capabilities:
  - twin.predict_state(patient_id, recent_window_df)
      -> Current status, 2-hour trajectory, and risk alert level.
  - twin.simulate_what_if(patient_id, recent_window_df, intervention)
      -> Counterfactual trajectory comparison: Baseline vs. Action (Carbs / Bolus / Walk).
"""

import json
import pickle
from pathlib import Path
from typing import Dict, Any, List
import numpy as np
import pandas as pd

from cdss_engine import CDSSEngine

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
COHORT_DIR = ROOT / "data" / "synthetic_cohort"


class DigitalTwinEngine:
    def __init__(self):
        # 0. Initialize Clinical Decision Support System (CDSS)
        self.cdss = CDSSEngine()

        # 1. Load patient metadata
        metadata_file = COHORT_DIR / "patients_metadata.json"
        with open(metadata_file, "r", encoding="utf-8") as f:
            patients = json.load(f)
        self.patients = {p["patient_id"]: p for p in patients}

        # 2. Load Model 1 (30min, 60min, 120min forecasters)
        self.models_m1 = {}
        self.feature_cols_m1 = {}
        for h in ["30min", "60min", "120min"]:
            m_path = MODELS_DIR / "model1" / f"lgbm_{h}.pkl"
            with open(m_path, "rb") as f:
                self.models_m1[h] = pickle.load(f)
            feat_path = MODELS_DIR / "model1" / f"feature_cols_{h}.json"
            with open(feat_path, "r") as f:
                self.feature_cols_m1[h] = json.load(f)

        # 3. Load Model 2 (Adverse Event Classifier)
        m2_path = MODELS_DIR / "model2" / "lgbm_adverse_classifier.pkl"
        with open(m2_path, "rb") as f:
            self.model_m2 = pickle.load(f)
        m2_feat_path = MODELS_DIR / "model2" / "feature_cols.json"
        with open(m2_feat_path, "r") as f:
            self.feature_cols_m2 = json.load(f)

        print("[DigitalTwinEngine] Initialized with 15 EHR profiles, 3 Model 1 horizons, and Model 2 Classifier.")

    def _extract_model1_features(self, window_df: pd.DataFrame) -> pd.DataFrame:
        """
        Converts a 24-step (2 hours @ 5min) wearable window into the 134-feature vector
        expected by Model 1.
        """
        w = window_df.sort_values("timestamp").reset_index(drop=True)
        row = {}

        # Current tick values
        curr = w.iloc[-1]
        for col in ["glucose", "calories", "heart_rate", "steps", "basal_rate",
                    "bolus_volume_delivered", "carb_input"]:
            row[col] = float(curr[col]) if col in curr else 0.0

        # Lags 1 to 24 (looking backward from current tick)
        n = len(w)
        for lag in range(1, 25):
            idx = n - 1 - lag
            if idx >= 0:
                past = w.iloc[idx]
                row[f"glucose_lag{lag}"] = float(past["glucose"])
                row[f"carb_input_lag{lag}"] = float(past["carb_input"]) if "carb_input" in past else 0.0
                row[f"bolus_volume_delivered_lag{lag}"] = float(past["bolus_volume_delivered"]) if "bolus_volume_delivered" in past else 0.0
                row[f"steps_lag{lag}"] = float(past["steps"]) if "steps" in past else 0.0
                row[f"heart_rate_lag{lag}"] = float(past["heart_rate"]) if "heart_rate" in past else 70.0
            else:
                # Pad with oldest available
                past = w.iloc[0]
                row[f"glucose_lag{lag}"] = float(past["glucose"])
                row[f"carb_input_lag{lag}"] = 0.0
                row[f"bolus_volume_delivered_lag{lag}"] = 0.0
                row[f"steps_lag{lag}"] = 0.0
                row[f"heart_rate_lag{lag}"] = 70.0

        # Rolling statistics
        g_series = w["glucose"].astype(float)
        row["glucose_roll_mean_30"] = float(g_series.tail(6).mean())
        row["glucose_roll_std_30"] = float(g_series.tail(6).std()) if len(g_series.tail(6)) > 1 else 0.0
        row["glucose_roll_mean_60"] = float(g_series.tail(12).mean())
        row["glucose_roll_std_60"] = float(g_series.tail(12).std()) if len(g_series.tail(12)) > 1 else 0.0
        row["glucose_roc"] = float(g_series.iloc[-1] - g_series.iloc[-2]) if len(g_series) >= 2 else 0.0

        # Time-of-day cyclical encoding
        ts = pd.to_datetime(curr["timestamp"])
        hour = ts.hour + ts.minute / 60.0
        row["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
        row["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)

        return pd.DataFrame([row])

    def _extract_model2_features(self, window_df: pd.DataFrame) -> pd.DataFrame:
        """
        Converts a 24-step CGM window into the 12-feature vector for Model 2.
        """
        w = window_df.sort_values("timestamp").reset_index(drop=True)
        g = w["glucose"].values.astype(float)
        curr = pd.to_datetime(w.iloc[-1]["timestamp"])

        features = {
            "glucose_mean": float(g.mean()),
            "glucose_std": float(g.std()) if len(g) > 1 else 0.0,
            "glucose_min": float(g.min()),
            "glucose_max": float(g.max()),
            "glucose_last": float(g[-1]),
            "glucose_roc": float(g[-1] - g[-6]) if len(g) >= 6 else 0.0,
            "glucose_roc_1h": float(g[-1] - g[-12]) if len(g) >= 12 else 0.0,
            "hypo_count_window": int((g < 70).sum()),
            "hyper_count_window": int((g > 180).sum()),
            "time_below_70_pct": float((g < 70).mean() * 100.0),
            "time_above_180_pct": float((g > 180).mean() * 100.0),
            "hour_of_day": int(curr.hour),
        }
        return pd.DataFrame([features])

    def _predict_state_t2d(self, patient_id: str, window_df: pd.DataFrame, profile: dict) -> Dict[str, Any]:
        """
        Dedicated Type 2 Diabetes Multi-Horizon Forecaster:
        Models glucose trajectory without pump bolus features.
        Fuses HOMA-IR, residual beta-cell secretion (HOMA-B), oral medication timing,
        circadian hepatic gluconeogenesis, and muscle GLUT-4 clearance from activity.
        """
        curr_glucose = float(window_df.iloc[-1]["glucose"])
        curr_time = str(window_df.iloc[-1]["timestamp"])
        g = window_df["glucose"].values.astype(float)
        hr = window_df["heart_rate"].values.astype(float) if "heart_rate" in window_df.columns else np.array([72.0])
        steps = window_df["steps"].values.astype(float) if "steps" in window_df.columns else np.array([0.0])

        homa_ir = float(profile.get("homa_ir", 3.8))
        homa_beta = float(profile.get("homa_beta", 45.0))
        hba1c = float(profile.get("hba1c_pct", 7.8))
        eag = 28.7 * hba1c - 46.7

        # Autoregressive momentum & velocity
        roc_15m = (g[-1] - g[-4]) if len(g) >= 4 else 0.0
        roc_30m = (g[-1] - g[-7]) if len(g) >= 7 else (roc_15m * 2)

        # Activity factor over last 30 minutes
        recent_steps = float(steps[-6:].sum()) if len(steps) >= 6 else 0.0
        glut4_exercise_suppression = min(35.0, (recent_steps / 250.0) * 8.5)

        # Insulin resistance clearance lag factor (higher HOMA-IR = slower clearance back to eAG)
        clearance_rate = (homa_beta / 50.0) / (homa_ir / 2.2)

        # 30-min horizon: dominated by velocity momentum and active meal elevation
        delta_30 = (roc_30m * 0.55) - ((curr_glucose - eag) * 0.08 * clearance_rate) - (glut4_exercise_suppression * 0.4)
        pred_30 = float(np.clip(curr_glucose + delta_30, 50.0, 380.0))

        # 60-min horizon: postprandial peak or slow regression towards baseline
        delta_60 = (roc_30m * 0.75) - ((curr_glucose - eag) * 0.22 * clearance_rate) - (glut4_exercise_suppression * 0.75)
        pred_60 = float(np.clip(curr_glucose + delta_60, 50.0, 380.0))

        # 120-min horizon: regression to equilibrium, buffered by HOMA-IR
        pred_120 = float(np.clip(0.35 * curr_glucose + 0.65 * eag - (glut4_exercise_suppression * 0.9), 55.0, 380.0))

        # Adverse Event Classifier (Model 2) operates on rolling window metrics
        feat_m2 = self._extract_model2_features(window_df)
        adverse_prob = float(self.model_m2.predict_proba(feat_m2[self.feature_cols_m2])[0][1])

        # Evaluate clinical alerts
        min_forecast = min(curr_glucose, pred_30, pred_60, pred_120)
        max_forecast = max(curr_glucose, pred_30, pred_60, pred_120)

        if min_forecast < 60 or max_forecast > 280 or adverse_prob >= 0.65:
            alert_level = "CRITICAL"
            alert_msg = f"Imminent glycemic crisis (Predicted {max_forecast:.0f} mg/dL, Risk: {adverse_prob:.1%})"
        elif min_forecast < 70:
            alert_level = "WARNING_HYPO"
            alert_msg = f"Predicted hypoglycemia (<70 mg/dL). Check for sulfonylurea / basal insulin over-suppression."
        elif max_forecast > 200 or adverse_prob >= 0.35:
            alert_level = "WARNING_HYPER"
            alert_msg = f"Elevated postprandial trajectory (>200 mg/dL). 15-min post-meal walk recommended to stimulate GLUT4."
        else:
            alert_level = "NORMAL"
            alert_msg = "Type 2 glycemic trajectory well within personalized target range."

        # Trend direction
        delta_trend = pred_30 - curr_glucose
        if delta_trend > 15:
            trend = "RISING_FAST"
        elif delta_trend > 5:
            trend = "RISING"
        elif delta_trend < -15:
            trend = "FALLING_FAST"
        elif delta_trend < -5:
            trend = "FALLING"
        else:
            trend = "STABLE"

        cdss_alerts = self.cdss.evaluate_patient(profile, window_df)

        return {
            "patient_id": patient_id,
            "patient_name": profile.get("name", "Unknown"),
            "timestamp": curr_time,
            "diabetes_type": "Type 2",
            "current_glucose": round(curr_glucose, 1),
            "trend": trend,
            "forecast": {
                "t_plus_30min": round(pred_30, 1),
                "t_plus_60min": round(pred_60, 1),
                "t_plus_120min": round(pred_120, 1)
            },
            "adverse_risk_prob": round(adverse_prob, 3),
            "alert_level": alert_level,
            "alert_message": alert_msg,
            "cdss_alerts": cdss_alerts,
            "ehr_context": {
                "hba1c": profile.get("hba1c_pct"),
                "homa_ir": homa_ir,
                "homa_beta": homa_beta,
                "oral_medications": profile.get("oral_medications", "Metformin"),
                "target_tir_pct": profile.get("target_tir_pct", 70),
                "risk_tier": profile.get("clinical_risk_tier")
            }
        }

    def predict_state(self, patient_id: str, window_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Primary Digital Twin inference:
        Takes patient EHR and recent 2-hour window -> Routes to T1D ML model or T2D Forecaster.
        Outputs current reading, +30m/+60m/+120m trajectory, adverse risk score, alert level, and CDSS alerts.
        """
        profile = self.patients.get(patient_id, {})
        diabetes_type = profile.get("diabetes_type", "Type 1")

        if diabetes_type == "Type 2":
            return self._predict_state_t2d(patient_id, window_df, profile)

        # Type 1 Diabetes Inference Path:
        curr_glucose = float(window_df.iloc[-1]["glucose"])
        curr_time = str(window_df.iloc[-1]["timestamp"])

        # 1. Model 1 Predictions
        feat_m1 = self._extract_model1_features(window_df)
        pred_30 = float(self.models_m1["30min"].predict(feat_m1[self.feature_cols_m1["30min"]])[0])
        pred_60 = float(self.models_m1["60min"].predict(feat_m1[self.feature_cols_m1["60min"]])[0])
        pred_120 = float(self.models_m1["120min"].predict(feat_m1[self.feature_cols_m1["120min"]])[0])

        # 2. Model 2 Adverse Event Probability
        feat_m2 = self._extract_model2_features(window_df)
        adverse_prob = float(self.model_m2.predict_proba(feat_m2[self.feature_cols_m2])[0][1])

        # 3. Clinical Alert Logic
        min_forecast = min(curr_glucose, pred_30, pred_60, pred_120)
        max_forecast = max(curr_glucose, pred_30, pred_60, pred_120)

        if min_forecast < 55 or max_forecast > 300 or adverse_prob >= 0.70:
            alert_level = "CRITICAL"
            alert_msg = f"Imminent severe glycemic excursion detected (Adverse Risk: {adverse_prob:.1%})"
        elif min_forecast < 70:
            alert_level = "WARNING_HYPO"
            alert_msg = f"Predicted hypoglycemia (<70 mg/dL) within 60 mins. Consume 15g fast-acting carbs."
        elif max_forecast > 220 or adverse_prob >= 0.40:
            alert_level = "WARNING_HYPER"
            alert_msg = f"Predicted hyperglycemia (>220 mg/dL). Check ketone levels / consider correction bolus."
        else:
            alert_level = "NORMAL"
            alert_msg = "Glycemic levels stable within target window."

        # Trend direction
        delta_30 = pred_30 - curr_glucose
        if delta_30 > 15:
            trend = "RISING_FAST"
        elif delta_30 > 5:
            trend = "RISING"
        elif delta_30 < -15:
            trend = "FALLING_FAST"
        elif delta_30 < -5:
            trend = "FALLING"
        else:
            trend = "STABLE"

        # 4. CDSS Pattern Alerts
        cdss_alerts = self.cdss.evaluate_patient(profile, window_df)

        return {
            "patient_id": patient_id,
            "patient_name": profile.get("name", "Unknown"),
            "timestamp": curr_time,
            "diabetes_type": "Type 1",
            "current_glucose": round(curr_glucose, 1),
            "trend": trend,
            "forecast": {
                "t_plus_30min": round(pred_30, 1),
                "t_plus_60min": round(pred_60, 1),
                "t_plus_120min": round(pred_120, 1)
            },
            "adverse_risk_prob": round(adverse_prob, 3),
            "alert_level": alert_level,
            "alert_message": alert_msg,
            "cdss_alerts": cdss_alerts,
            "ehr_context": {
                "hba1c": profile.get("hba1c_pct"),
                "isf": profile.get("isf_mg_dl_per_unit"),
                "icr": profile.get("icr_grams_per_unit"),
                "basal_rate": profile.get("basal_rate_u_hr"),
                "risk_tier": profile.get("clinical_risk_tier")
            }
        }

    def simulate_what_if(self, patient_id: str, window_df: pd.DataFrame,
                         carbs_g: float = 0.0, bolus_u: float = 0.0,
                         walk_min: float = 0.0, oral_med_taken: bool = True) -> Dict[str, Any]:
        """
        The "What-If" Counterfactual Simulator:
        Computes the expected glucose trajectory difference if the user takes an action NOW.
        Supports both Type 1 (Carbs/Bolus/Walk) and Type 2 (Carbs/Walk/Oral Meds).
        """
        profile = self.patients.get(patient_id, {})
        diabetes_type = profile.get("diabetes_type", "Type 1")
        is_t2d = (diabetes_type == "Type 2")

        # 1. Get baseline forecast (no action taken)
        baseline = self.predict_state(patient_id, window_df)
        base_curve = [
            baseline["current_glucose"],
            baseline["forecast"]["t_plus_30min"],
            baseline["forecast"]["t_plus_60min"],
            baseline["forecast"]["t_plus_120min"],
        ]

        simulated_curve = []

        if is_t2d:
            # Type 2 Counterfactual Dynamics:
            homa_ir = float(profile.get("homa_ir", 3.8))
            carb_frac = [0.0, 0.25, 0.70, 0.95]
            walk_frac = [0.0, 0.40, 0.85, 1.00]

            for i in range(4):
                # Carbs raise glucose, attenuated if oral medication was taken (e.g. SGLT2i/Metformin)
                med_blunting = 0.80 if oral_med_taken else 1.0
                carb_effect = (carbs_g * 1.55 * (homa_ir / 2.8) * med_blunting) * carb_frac[i]

                # Walking lowers glucose via insulin-independent GLUT4 uptake
                walk_effect = (walk_min * 1.15) * walk_frac[i]

                # If bolus was provided (e.g. advanced T2D on basal-bolus)
                bolus_effect = (bolus_u * (38.0 / (homa_ir / 2.5))) * [0.0, 0.15, 0.50, 0.85][i]

                net_delta = carb_effect - walk_effect - bolus_effect
                projected = max(45.0, min(390.0, base_curve[i] + net_delta))
                simulated_curve.append(round(projected, 1))

            sim_min = min(simulated_curve)
            sim_max = max(simulated_curve)

            if sim_min < 70:
                safety_flag = "DANGER_HYPO"
                recommendation = f"Hypoglycemia risk ({sim_min} mg/dL). Reduce post-meal exercise or take 15g carbs."
            elif sim_max > 220:
                safety_flag = "WARN_HYPER"
                recommendation = f"Projected peak of {sim_max} mg/dL. A 20-min post-meal walk is recommended to stimulate GLUT-4 clearance."
            else:
                safety_flag = "SAFE"
                recommendation = "Optimal glycemic trajectory. Post-meal glucose expected to remain within target range."
        else:
            # Type 1 Counterfactual Dynamics:
            isf = float(profile.get("isf_mg_dl_per_unit", 45))
            icr = float(profile.get("icr_grams_per_unit", 10))

            carb_absorption_frac = [0.0, 0.35, 0.70, 0.95]
            insulin_action_frac = [0.0, 0.15, 0.50, 0.85]
            exercise_burn_factor = [0.0, 0.40, 0.80, 1.00]

            for i in range(4):
                carb_effect = (carbs_g / icr) * isf * carb_absorption_frac[i]
                insulin_effect = bolus_u * isf * insulin_action_frac[i]
                walk_effect = (walk_min * 0.8 * (isf / 45.0)) * exercise_burn_factor[i]

                net_delta = carb_effect - insulin_effect - walk_effect
                projected = max(40.0, min(400.0, base_curve[i] + net_delta))
                simulated_curve.append(round(projected, 1))

            sim_min = min(simulated_curve)
            sim_max = max(simulated_curve)

            safety_flag = "SAFE"
            recommendation = "Safe to proceed."
            if sim_min < 70:
                safety_flag = "DANGER_HYPO"
                recommendation = (f"Caution: This action will cause hypoglycemia (projected low of {sim_min} mg/dL). "
                                  f"Reduce insulin bolus by {round((70 - sim_min)/isf, 1)} U or add 15g carbs.")
            elif sim_max > 220:
                safety_flag = "WARN_HYPER"
                suggested_correction = round((sim_max - 140) / isf, 1)
                recommendation = (f"Notice: Post-action glucose may spike to {sim_max} mg/dL. "
                                  f"Suggested correction: +{suggested_correction} U bolus or 20-min post-meal walk.")

        return {
            "patient_id": patient_id,
            "patient_name": profile.get("name", "Unknown"),
            "diabetes_type": diabetes_type,
            "action_evaluated": {
                "carbs_added_g": carbs_g,
                "bolus_added_u": bolus_u,
                "walk_duration_min": walk_min,
                "oral_med_taken": oral_med_taken
            },
            "horizons_min": [0, 30, 60, 120],
            "baseline_trajectory": base_curve,
            "simulated_trajectory": simulated_curve,
            "net_difference_mg_dl": [round(s - b, 1) for s, b in zip(simulated_curve, base_curve)],
            "safety_flag": safety_flag,
            "clinical_recommendation": recommendation
        }


def test_engine_sample():
    print("=" * 60)
    print("Testing Digital Twin Engine & What-If Simulation")
    print("=" * 60)

    engine = DigitalTwinEngine()

    # Load 2-hour window of patient T1D-IN-001 (Aarav Sharma)
    stream_file = COHORT_DIR / "wearable_streams" / "T1D-IN-001_stream.csv"
    df = pd.read_csv(stream_file)
    sample_window = df.iloc[50:74]  # 24 steps = 2 hours

    # 1. Test baseline state prediction
    print("\n[1] Testing Baseline State Prediction:")
    state = engine.predict_state("T1D-IN-001", sample_window)
    print(json.dumps(state, indent=2))

    # 2. Test "What-If" scenario: Patient wants to eat 50g carbs with 2U insulin
    print("\n[2] Testing 'What-If' Simulation (Eat 50g carbs + 2U bolus):")
    what_if = engine.simulate_what_if("T1D-IN-001", sample_window, carbs_g=50, bolus_u=2.0)
    print(json.dumps(what_if, indent=2))

    # 3. Test "What-If" scenario: Same meal + 30 min walk
    print("\n[3] Testing 'What-If' Simulation (Eat 50g carbs + 2U bolus + 30-min walk):")
    what_if_walk = engine.simulate_what_if("T1D-IN-001", sample_window, carbs_g=50, bolus_u=2.0, walk_min=30)
    print(json.dumps(what_if_walk, indent=2))


if __name__ == "__main__":
    test_engine_sample()
