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
from delta_forecaster import DeltaForecaster
from ensemble_classifier import EnsembleClassifier
from t2_forecaster import T2DForecaster

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
COHORT_DIR = ROOT / "data" / "synthetic_cohort"


class DigitalTwinEngine:
    def __init__(self):
        # 0. Initialize Clinical Decision Support System (CDSS)
        self.cdss = CDSSEngine()

        # 1. Load patient metadata
        metadata_file = COHORT_DIR / "patients_metadata.json"
        if metadata_file.exists():
            with open(metadata_file, "r", encoding="utf-8") as f:
                patients = json.load(f)
            self.patients = {p["patient_id"]: p for p in patients}
        else:
            self.patients = {}

        # 2. Load Model 1 (Type 1 Forecaster: 30min, 60min, 120min)
        self.models_m1 = {}
        self.feature_cols_m1 = {}
        for h in ["30min", "60min", "120min"]:
            m_path = MODELS_DIR / "model1" / f"lgbm_{h}.pkl"
            with open(m_path, "rb") as f:
                self.models_m1[h] = pickle.load(f)
            feat_path = MODELS_DIR / "model1" / f"feature_cols_{h}.json"
            with open(feat_path, "r") as f:
                self.feature_cols_m1[h] = json.load(f)

        # 3. Load Model 2 (Type 1 Adverse Event Classifier)
        m2_path = MODELS_DIR / "model2" / "lgbm_adverse_classifier.pkl"
        with open(m2_path, "rb") as f:
            self.model_m2 = pickle.load(f)
        m2_feat_path = MODELS_DIR / "model2" / "feature_cols.json"
        with open(m2_feat_path, "r") as f:
            self.feature_cols_m2 = json.load(f)

        # 4. Load Model 3 (Type 2 Multi-Horizon Forecaster: +30m, +60m, +120m)
        m3_path = MODELS_DIR / "model3" / "lgbm_t2_forecaster.pkl"
        with open(m3_path, "rb") as f:
            self.model_m3 = pickle.load(f)
        m3_feat_path = MODELS_DIR / "model3" / "feature_cols_t2.json"
        with open(m3_feat_path, "r") as f:
            self.feature_cols_m3 = json.load(f)

        # 5. Load Model 4 (Type 2 Adverse Event Classifier)
        m4_path = MODELS_DIR / "model4" / "lgbm_t2_classifier.pkl"
        with open(m4_path, "rb") as f:
            self.model_m4 = pickle.load(f)
        m4_feat_path = MODELS_DIR / "model4" / "feature_cols.json"
        with open(m4_feat_path, "r") as f:
            self.feature_cols_m4 = json.load(f)

        print(f"[DigitalTwinEngine] Initialized 2x2 Engine: T1D (Model 1 & 2), T2D (Model 3 & 4), {len(self.patients)} EHR profiles.")

    def _extract_model1_features(self, window_df: pd.DataFrame) -> pd.DataFrame:
        """
        Converts a 24-step (2 hours @ 5min) wearable window into the 155-feature vector
        expected by Model 1, equipped with sensor dropout protection.
        """
        w = window_df.sort_values("timestamp").reset_index(drop=True)

        # ── Missing Data & Dropout Fallback (PCHIP / forward-fill)
        if w.isnull().values.any():
            w = w.ffill().bfill()
        if len(w) < 24:
            pad_n = 24 - len(w)
            first_rows = w.iloc[[0] * pad_n]
            w = pd.concat([first_rows, w], ignore_index=True)

        row = {}

        # Current tick values
        curr = w.iloc[-1]
        for col in ["glucose", "calories", "heart_rate", "steps", "basal_rate",
                    "bolus_volume_delivered", "carb_input"]:
            row[col] = float(curr[col]) if col in curr and not pd.isna(curr[col]) else 0.0

        # Lags 1 to 24 (looking backward from current tick)
        n = len(w)
        for lag in range(1, 25):
            idx = n - 1 - lag
            if idx >= 0:
                past = w.iloc[idx]
                row[f"glucose_lag{lag}"] = float(past["glucose"])
                row[f"carb_input_lag{lag}"] = float(past["carb_input"]) if "carb_input" in past and not pd.isna(past["carb_input"]) else 0.0
                row[f"bolus_volume_delivered_lag{lag}"] = float(past["bolus_volume_delivered"]) if "bolus_volume_delivered" in past and not pd.isna(past["bolus_volume_delivered"]) else 0.0
                row[f"steps_lag{lag}"] = float(past["steps"]) if "steps" in past and not pd.isna(past["steps"]) else 0.0
                row[f"heart_rate_lag{lag}"] = float(past["heart_rate"]) if "heart_rate" in past and not pd.isna(past["heart_rate"]) else 70.0
            else:
                past = w.iloc[0]
                row[f"glucose_lag{lag}"] = float(past["glucose"])
                row[f"carb_input_lag{lag}"] = 0.0
                row[f"bolus_volume_delivered_lag{lag}"] = 0.0
                row[f"steps_lag{lag}"] = 0.0
                row[f"heart_rate_lag{lag}"] = 70.0

        g_series = w["glucose"].astype(float)
        g_vals = g_series.values
        curr_g = float(g_vals[-1])

        # Rolling statistics
        row["glucose_roll_mean_30"] = float(g_series.tail(6).mean())
        row["glucose_roll_std_30"] = float(g_series.tail(6).std()) if len(g_series.tail(6)) > 1 else 0.0
        row["glucose_roll_mean_60"] = float(g_series.tail(12).mean())
        row["glucose_roll_std_60"] = float(g_series.tail(12).std()) if len(g_series.tail(12)) > 1 else 0.0
        row["glucose_roc"] = float(g_vals[-1] - g_vals[-2]) if len(g_vals) >= 2 else 0.0

        # Acceleration and multi-horizon ROC
        row["glucose_accel"] = float((g_vals[-1] - g_vals[-2]) - (g_vals[-2] - g_vals[-3])) if len(g_vals) >= 3 else 0.0
        row["glucose_roc_15m"] = float(g_vals[-1] - g_vals[-4]) if len(g_vals) >= 4 else 0.0
        row["glucose_roc_30m"] = float(g_vals[-1] - g_vals[-7]) if len(g_vals) >= 7 else 0.0
        row["glucose_roc_60m"] = float(g_vals[-1] - g_vals[-13]) if len(g_vals) >= 13 else 0.0

        # Rolling extremes
        row["glucose_roll_min_30"] = float(g_series.tail(6).min())
        row["glucose_roll_max_30"] = float(g_series.tail(6).max())
        row["glucose_roll_range_30"] = float(row["glucose_roll_max_30"] - row["glucose_roll_min_30"])
        row["glucose_roll_min_60"] = float(g_series.tail(12).min())
        row["glucose_roll_max_60"] = float(g_series.tail(12).max())
        row["glucose_roll_range_60"] = float(row["glucose_roll_max_60"] - row["glucose_roll_min_60"])

        # Exponential Moving Averages (EMA)
        ema15 = float(g_series.ewm(span=3, adjust=False).mean().iloc[-1])
        ema30 = float(g_series.ewm(span=6, adjust=False).mean().iloc[-1])
        ema60 = float(g_series.ewm(span=12, adjust=False).mean().iloc[-1])
        row["glucose_ema_15"] = ema15
        row["glucose_ema_30"] = ema30
        row["glucose_ema_60"] = ema60
        row["glucose_diff_ema_15"] = float(curr_g - ema15)
        row["glucose_diff_ema_60"] = float(curr_g - ema60)

        # Estimated IOB and COB decays
        iob_decay = np.exp(-np.arange(25) / 12.0)
        cob_decay = np.exp(-np.arange(25) / 8.0)
        bolus_hist = np.array([row.get(f"bolus_volume_delivered_lag{i}", 0.0) for i in range(1, 25)] + [row["bolus_volume_delivered"]])
        carb_hist  = np.array([row.get(f"carb_input_lag{i}", 0.0) for i in range(1, 25)] + [row["carb_input"]])
        row["iob_est"] = float(np.sum(bolus_hist[::-1] * iob_decay))
        row["cob_est"] = float(np.sum(carb_hist[::-1] * cob_decay))

        # Kovatchev Low / High Blood Glucose Risk Indices
        clipped = np.clip(curr_g, 10.0, 600.0)
        f_g = 1.509 * (np.log(clipped) ** 1.084 - 5.381)
        r = 10.0 * (f_g ** 2)
        row["lbgi"] = float(r if f_g < 0 else 0.0)
        row["hbgi"] = float(r if f_g > 0 else 0.0)

        row["tbr_30_pct"] = float((g_series.tail(6) < 70.0).mean() * 100.0)
        row["tar_30_pct"] = float((g_series.tail(6) > 180.0).mean() * 100.0)

        # Patient-Specific Baseline Ratio
        g_baseline = float(g_series.mean()) if len(g_series) > 0 and g_series.mean() > 0 else 1.0
        row["glucose_to_baseline_ratio"] = float(curr_g / g_baseline)

        # Time-of-day cyclical encoding
        ts = pd.to_datetime(curr["timestamp"])
        hour = ts.hour + ts.minute / 60.0
        row["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
        row["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)

        return pd.DataFrame([row])

    def _extract_model2_features(self, window_df: pd.DataFrame) -> pd.DataFrame:
        """
        Converts a 24-step CGM window into the 40-feature physiological vector for Model 2.
        """
        w = window_df.sort_values("timestamp").reset_index(drop=True)
        if w.isnull().values.any():
            w = w.ffill().bfill()
        if len(w) < 24:
            pad_n = 24 - len(w)
            first_rows = w.iloc[[0] * pad_n]
            w = pd.concat([first_rows, w], ignore_index=True)

        g = w["glucose"].values.astype(float)
        curr = pd.to_datetime(w.iloc[-1]["timestamp"])

        g_mean = float(g.mean())
        g_std = float(g.std()) if len(g) > 1 else 0.0
        g_min = float(g.min())
        g_max = float(g.max())
        g_last = float(g[-1])

        g_roc = float(g[-1] - g[-6]) if len(g) >= 6 else 0.0
        g_roc_1h = float(g[-1] - g[-12]) if len(g) >= 12 else 0.0
        roc_15m = float(g[-1] - g[-3]) if len(g) >= 3 else (g_roc * 0.5)
        roc_30m = g_roc
        roc_60m = g_roc_1h
        g_accel = float((g[-1] - g[-2]) - (g[-2] - g[-3])) if len(g) >= 3 else 0.0

        # Pharmacokinetics
        iob_decay = np.exp(-np.arange(25) / 12.0)
        cob_decay = np.exp(-np.arange(25) / 8.0)
        bolus_vals = w["bolus_volume_delivered"].fillna(0).values.astype(float) if "bolus_volume_delivered" in w.columns else np.zeros(len(w))
        carb_vals = w["carb_input"].fillna(0).values.astype(float) if "carb_input" in w.columns else np.zeros(len(w))
        iob_est = float(np.sum(bolus_vals[-25:][::-1] * iob_decay[:min(len(bolus_vals), 25)]))
        cob_est = float(np.sum(carb_vals[-25:][::-1] * cob_decay[:min(len(carb_vals), 25)]))
        metabolic_delta = float((cob_est * 3.5) - (iob_est * 45.0))
        metabolic_predicted_glucose = float(g_last + metabolic_delta)

        # Kovatchev Risk Indices
        clipped = np.clip(g_last, 10.0, 600.0)
        f_g = 1.509 * (np.log(clipped) ** 1.084 - 5.381)
        r_g = 10.0 * (f_g ** 2)
        lbgi = float(r_g if f_g < 0 else 0.0)
        hbgi = float(r_g if f_g > 0 else 0.0)

        # Circadian
        hour_frac = curr.hour + curr.minute / 60.0
        hour_sin = float(np.sin(2 * np.pi * hour_frac / 24.0))
        hour_cos = float(np.cos(2 * np.pi * hour_frac / 24.0))

        # Dynamic projections & boundary distances
        proj_30 = float(g_last + roc_30m)
        proj_60 = float(g_last + 2 * roc_30m)
        proj_120 = float(g_last + 4 * roc_30m)
        dist_to_54 = float(g_last - 54.0)
        dist_to_250 = float(250.0 - g_last)

        min_proj = min(g_last, proj_30, proj_60, proj_120)
        max_proj = max(g_last, proj_30, proj_60, proj_120)
        proj_hypo_danger = float(max(0.0, 54.0 - min(min_proj, metabolic_predicted_glucose)))
        proj_hyper_danger = float(max(0.0, max(max_proj, metabolic_predicted_glucose) - 250.0))

        # Volatility
        diffs = np.abs(np.diff(g))
        mask = diffs > g_std
        mage = float(np.mean(diffs[mask])) if np.any(mask) else g_std
        conga = float(np.std(g[12:] - g[:-12])) if len(g) >= 12 else 0.0
        glucose_cv = float((g_std / g_mean) * 100.0) if g_mean > 0 else 0.0

        # FFT
        g_detrend = g - g_mean
        fft_vals = np.abs(np.fft.rfft(g_detrend)) ** 2
        fft_power_low = float(np.sum(fft_vals[1:4]))
        fft_power_high = float(np.sum(fft_vals[4:]))
        fft_total_energy = float(np.sum(fft_vals[1:]))
        fft_ratio_high_low = float(fft_power_high / (fft_power_low + 1e-6))
        fft_dominant_freq = int(np.argmax(fft_vals[1:]) + 1)

        features = {
            "glucose_mean":               g_mean,
            "glucose_std":                g_std,
            "glucose_min":                g_min,
            "glucose_max":                g_max,
            "glucose_last":               g_last,
            "glucose_roc":                g_roc,
            "glucose_roc_1h":             g_roc_1h,
            "hypo_count_window":          int((g < 70).sum()),
            "hyper_count_window":         int((g > 180).sum()),
            "time_below_70_pct":          float((g < 70).mean() * 100.0),
            "time_above_180_pct":         float((g > 180).mean() * 100.0),
            "hour_of_day":                int(curr.hour),
            "mage":                       mage,
            "conga":                      conga,
            "glucose_cv":                 glucose_cv,
            "glucose_to_baseline_ratio":  float(g_last / g_mean) if g_mean > 0 else 1.0,
            "fft_power_low":              fft_power_low,
            "fft_power_high":             fft_power_high,
            "fft_total_energy":           fft_total_energy,
            "fft_ratio_high_low":         fft_ratio_high_low,
            "fft_dominant_freq":          fft_dominant_freq,
            "iob_est":                    iob_est,
            "cob_est":                    cob_est,
            "metabolic_delta":            metabolic_delta,
            "metabolic_predicted_glucose": metabolic_predicted_glucose,
            "lbgi":                       lbgi,
            "hbgi":                       hbgi,
            "glucose_accel":              g_accel,
            "glucose_roc_15m":            roc_15m,
            "glucose_roc_30m":            roc_30m,
            "glucose_roc_60m":            roc_60m,
            "hour_sin":                   hour_sin,
            "hour_cos":                   hour_cos,
            "proj_30":                    proj_30,
            "proj_60":                    proj_60,
            "proj_120":                   proj_120,
            "dist_to_54":                 dist_to_54,
            "dist_to_250":                dist_to_250,
            "proj_hypo_danger":           proj_hypo_danger,
            "proj_hyper_danger":          proj_hyper_danger,
        }
        return pd.DataFrame([features])

    def _extract_t2d_features(self, window_df: pd.DataFrame) -> pd.DataFrame:
        """
        Extracts Type 2 physiological feature representation (lags, rolling stats, 24h drift,
        circadian rhythms, Dawn phenomenon, FFT spectral markers) for Model 3 and Model 4.
        """
        w = window_df.sort_values("timestamp").reset_index(drop=True)
        if w.isnull().values.any():
            w = w.ffill().bfill()
        if len(w) < 24:
            pad_n = 24 - len(w)
            first_rows = w.iloc[[0] * pad_n]
            w = pd.concat([first_rows, w], ignore_index=True)

        g = w["glucose"].values.astype(float)
        carbs = w["carb_input"].fillna(0).values.astype(float) if "carb_input" in w.columns else np.zeros(len(w))
        curr = pd.to_datetime(w.iloc[-1]["timestamp"])

        g_last = float(g[-1])
        n = len(g)

        # Autoregressive lags 1 to 24
        lags = {}
        for lag in range(1, 25):
            idx = n - 1 - lag
            if idx >= 0:
                lags[f"glucose_lag{lag}"] = float(g[idx])
                lags[f"carb_input_lag{lag}"] = float(carbs[idx])
            else:
                lags[f"glucose_lag{lag}"] = float(g[0])
                lags[f"carb_input_lag{lag}"] = 0.0

        g_series = pd.Series(g)

        # Rolling statistics
        g_mean_30 = float(g_series.tail(6).mean())
        g_std_30 = float(g_series.tail(6).std()) if len(g) >= 2 else 0.0
        g_min_30 = float(g_series.tail(6).min())
        g_max_30 = float(g_series.tail(6).max())
        g_range_30 = g_max_30 - g_min_30

        g_mean_60 = float(g_series.tail(12).mean())
        g_std_60 = float(g_series.tail(12).std()) if len(g) >= 2 else 0.0
        g_min_60 = float(g_series.tail(12).min())
        g_max_60 = float(g_series.tail(12).max())
        g_range_60 = g_max_60 - g_min_60

        # Velocities and acceleration
        g_roc = float(g[-1] - g[-2]) if len(g) >= 2 else 0.0
        g_accel = float((g[-1] - g[-2]) - (g[-2] - g[-3])) if len(g) >= 3 else 0.0
        g_roc_15m = float(g[-1] - g[-4]) if len(g) >= 4 else (g_roc * 2.0)
        g_roc_30m = float(g[-1] - g[-7]) if len(g) >= 7 else (g_roc * 4.0)
        g_roc_60m = float(g[-1] - g[-13]) if len(g) >= 13 else (g_roc * 8.0)

        # Long-term baseline & 24-hour drift
        g_mean_24h = float(g_series.mean()) if len(g_series) > 0 and g_series.mean() > 0 else 140.0
        g_drift_24h = float(g_last - g_mean_24h)
        g_ratio = float(g_last / g_mean_24h) if g_mean_24h > 0 else 1.0
        g_cv = float((g_std_60 / g_mean_60) * 100.0) if g_mean_60 > 0 else 0.0

        # EMAs
        ema15 = float(g_series.ewm(span=3, adjust=False).mean().iloc[-1])
        ema30 = float(g_series.ewm(span=6, adjust=False).mean().iloc[-1])
        ema60 = float(g_series.ewm(span=12, adjust=False).mean().iloc[-1])
        diff_ema15 = float(g_last - ema15)
        diff_ema60 = float(g_last - ema60)

        # COB & IOB (IOB is strictly 0.0 for T2D)
        cob_decay = np.exp(-np.arange(25) / 8.0)
        carb_vals = np.array([lags[f"carb_input_lag{i}"] for i in range(24, 0, -1)] + [carbs[-1]])
        cob_est = float(np.sum(carb_vals * cob_decay[::-1]))
        carb_roll_sum_2h = float(np.sum(carb_vals))
        iob_est = 0.0

        # Circadian rhythm & Dawn phenomenon
        hour_val = curr.hour + curr.minute / 60.0
        hour_sin = float(np.sin(2 * np.pi * hour_val / 24.0))
        hour_cos = float(np.cos(2 * np.pi * hour_val / 24.0))
        hour_int = int(curr.hour)
        dawn_phenomenon = 1.0 if (4 <= hour_int <= 8) else 0.0
        postprandial_window = 1.0 if ((12 <= hour_int <= 14) or (18 <= hour_int <= 21)) else 0.0

        # Glycemic volatility
        diffs = np.abs(np.diff(g))
        mask = diffs > g_std_60
        mage = float(np.mean(diffs[mask])) if np.any(mask) else g_std_60
        conga = float(np.std(g[12:] - g[:-12])) if len(g) >= 12 else 0.0

        # Kovatchev risk indices
        clipped_g = np.clip(g_last, 10.0, 600.0)
        f_g = 1.509 * (np.log(clipped_g) ** 1.084 - 5.381)
        r_g = 10.0 * (f_g ** 2)
        lbgi = float(r_g if f_g < 0 else 0.0)
        hbgi = float(r_g if f_g > 0 else 0.0)

        tbr_30 = float((g_series.tail(6) < 70.0).mean() * 100.0)
        tar_30 = float((g_series.tail(6) > 180.0).mean() * 100.0)

        # Projections & danger thresholds
        proj_30 = float(g_last + g_roc_30m)
        proj_60 = float(g_last + 2.0 * g_roc_30m)
        proj_120 = float(g_last + 4.0 * g_roc_30m)

        dist_to_180 = float(180.0 - g_last)
        dist_to_250 = float(250.0 - g_last)
        dist_to_54 = float(g_last - 54.0)

        min_proj = min(g_last, proj_30, proj_60, proj_120)
        max_proj = max(g_last, proj_30, proj_60, proj_120)
        proj_hyper_danger = float(max(0.0, max_proj - 250.0))
        proj_hypo_danger = float(max(0.0, 54.0 - min_proj))

        # FFT Spectral Density
        g_detrend = g - g.mean()
        fft_vals = np.abs(np.fft.rfft(g_detrend)) ** 2
        fft_power_low = float(np.sum(fft_vals[1:4]))
        fft_power_high = float(np.sum(fft_vals[4:]))
        fft_total_energy = float(np.sum(fft_vals[1:]))
        fft_ratio_high_low = float(fft_power_high / (fft_power_low + 1e-6))
        fft_dominant_freq = int(np.argmax(fft_vals[1:]) + 1)

        features = {
            "glucose":                   g_last,
            "glucose_roll_mean_30":      g_mean_30,
            "glucose_roll_std_30":       g_std_30,
            "glucose_roll_min_30":       g_min_30,
            "glucose_roll_max_30":       g_max_30,
            "glucose_roll_range_30":     g_range_30,
            "glucose_roll_mean_60":      g_mean_60,
            "glucose_roll_std_60":       g_std_60,
            "glucose_roll_min_60":       g_min_60,
            "glucose_roll_max_60":       g_max_60,
            "glucose_roll_range_60":     g_range_60,
            "glucose_roc":               g_roc,
            "glucose_accel":             g_accel,
            "glucose_roc_15m":           g_roc_15m,
            "glucose_roc_30m":           g_roc_30m,
            "glucose_roc_60m":           g_roc_60m,
            "glucose_mean_24h":          g_mean_24h,
            "glucose_drift_24h":         g_drift_24h,
            "glucose_to_baseline_ratio": g_ratio,
            "glucose_cv":                g_cv,
            "glucose_ema_15":            ema15,
            "glucose_ema_30":            ema30,
            "glucose_ema_60":            ema60,
            "glucose_diff_ema_15":       diff_ema15,
            "glucose_diff_ema_60":       diff_ema60,
            "carb_input":                float(carbs[-1]),
            "cob_est":                   cob_est,
            "carb_roll_sum_2h":          carb_roll_sum_2h,
            "iob_est":                   iob_est,
            "hour_of_day":               hour_int,
            "hour_sin":                  hour_sin,
            "hour_cos":                  hour_cos,
            "dawn_phenomenon":           dawn_phenomenon,
            "postprandial_window":       postprandial_window,
            "mage":                      mage,
            "conga":                     conga,
            "lbgi":                      lbgi,
            "hbgi":                      hbgi,
            "tbr_30_pct":                tbr_30,
            "tar_30_pct":                tar_30,
            "proj_30":                   proj_30,
            "proj_60":                   proj_60,
            "proj_120":                  proj_120,
            "dist_to_180":               dist_to_180,
            "dist_to_250":               dist_to_250,
            "dist_to_54":                dist_to_54,
            "proj_hyper_danger":         proj_hyper_danger,
            "proj_hypo_danger":          proj_hypo_danger,
            "fft_power_low":             fft_power_low,
            "fft_power_high":            fft_power_high,
            "fft_total_energy":          fft_total_energy,
            "fft_ratio_high_low":        fft_ratio_high_low,
            "fft_dominant_freq":         fft_dominant_freq,
        }

        for i in range(1, 25):
            features[f"glucose_lag{i}"] = lags[f"glucose_lag{i}"]
            features[f"carb_input_lag{i}"] = lags[f"carb_input_lag{i}"]

        return pd.DataFrame([features])

    def _predict_state_t2d(self, patient_id: str, window_df: pd.DataFrame, profile: dict) -> Dict[str, Any]:
        """
        Dedicated Type 2 Diabetes Inference Engine (Model 3 & Model 4):
        - Model 3 Forecaster: Predicts +30m, +60m, and +120m trajectories trained on Shanghai_T2DM.
        - Model 4 Classifier: Evaluates impending adverse excursion risk (prioritizing severe hyperglycemia >250 mg/dL).
        """
        curr_glucose = float(window_df.iloc[-1]["glucose"])
        curr_time = str(window_df.iloc[-1]["timestamp"])

        # 1. Extract Type 2 physiological feature representation
        feat_t2 = self._extract_t2d_features(window_df)

        # 2. Model 3 Multi-Horizon Predictions (Shanghai_T2DM Trained)
        pred_30 = float(self.model_m3["30min"].predict(feat_t2[self.feature_cols_m3])[0])
        pred_60 = float(self.model_m3["60min"].predict(feat_t2[self.feature_cols_m3])[0])
        pred_120 = float(self.model_m3["120min"].predict(feat_t2[self.feature_cols_m3])[0])

        # 3. Model 4 Adverse Event Probability (Shanghai_T2DM Trained)
        adverse_prob = float(self.model_m4.predict_proba(feat_t2[self.feature_cols_m4])[0][1])

        # 4. Clinical Alert Logic
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

        homa_ir = float(profile.get("homa_ir", 3.8)) if profile.get("homa_ir") is not None else 3.8
        homa_beta = float(profile.get("homa_beta", 45.0)) if profile.get("homa_beta") is not None else 45.0

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
