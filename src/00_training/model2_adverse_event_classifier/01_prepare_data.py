"""
Model 2: Adverse Glycemic Event Classifier — Data Preparation
=============================================================
Defines impending clinical adverse events based on ADA/EASD consensus guidelines:
  - Level 2 Hypoglycemia (< 54 mg/dL)
  - Severe Hyperglycemia / Ketosis Danger (> 250 mg/dL)
within the NEXT 2 hours (Tier 2 proactive alert) and NEXT 30 minutes (Tier 1 urgent alert).

Engineered Feature Space (40 Physiological Markers):
  1. Baseline 12 Rolling Metrics:
     glucose_mean, glucose_std, glucose_min, glucose_max, glucose_last,
     glucose_roc, glucose_roc_1h, hypo_count_window, hyper_count_window,
     time_below_70_pct, time_above_180_pct, hour_of_day
  2. Glycemic Volatility:
     mage, conga, glucose_cv (coefficient of variation)
  3. Patient-Specific Baseline Ratio:
     glucose_to_baseline_ratio (current glucose / historical window mean, default 1.0)
  4. Frequency-Domain (FFT) Spectral Density:
     fft_power_low, fft_power_high, fft_total_energy, fft_ratio_high_low, fft_dominant_freq
  5. Pharmacokinetic Metabolic Decays:
     iob_est, cob_est, metabolic_delta, metabolic_predicted_glucose
  6. Non-linear Glycemic Risk & Acceleration:
     lbgi, hbgi, glucose_accel, glucose_roc_15m, glucose_roc_30m, glucose_roc_60m, hour_sin, hour_cos
  7. Multi-Horizon Trajectory Projections & Boundary Penetration Depths:
     proj_30, proj_60, proj_120, dist_to_54, dist_to_250, proj_hypo_danger, proj_hyper_danger

Outputs:
  - data/processed/model2/train.parquet
  - data/processed/model2/val.parquet
  - data/processed/model2/test.parquet
"""

import warnings
import numpy as np
import pandas as pd
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[3]
MODEL1_DATA_DIR = ROOT / "data" / "processed" / "model1"
OUT_DIR = ROOT / "data" / "processed" / "model2"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def extract_model2_window_features(df_m1: pd.DataFrame) -> pd.DataFrame:
    """
    Extracts Model 2 feature matrix, FFT spectral markers, pharmacokinetic balances,
    multi-horizon projections, and specialized clinical labels.
    """
    print(f"  Input rows: {len(df_m1):,}")

    # Glucose window array over past 24 steps
    # lag24, lag23, ..., lag1, glucose
    glucose_cols = [f"glucose_lag{i}" for i in range(24, 0, -1)] + ["glucose"]
    g_matrix = df_m1[glucose_cols].values.astype(float)

    # 1. Baseline 12 features
    g_mean = np.mean(g_matrix, axis=1)
    g_std  = np.std(g_matrix, axis=1)
    g_min  = np.min(g_matrix, axis=1)
    g_max  = np.max(g_matrix, axis=1)
    g_last = df_m1["glucose"].values.astype(float)
    g_roc  = g_last - df_m1["glucose_lag6"].values.astype(float)
    g_roc_1h = g_last - df_m1["glucose_lag12"].values.astype(float)

    hypo_count  = np.sum(g_matrix < 70.0, axis=1)
    hyper_count = np.sum(g_matrix > 180.0, axis=1)
    time_below_70  = (hypo_count / 25.0) * 100.0
    time_above_180 = (hyper_count / 25.0) * 100.0

    ts = pd.to_datetime(df_m1["timestamp"])
    hour_of_day = ts.dt.hour.values

    # 2. Glycemic Volatility Features (CONGA, MAGE, CV)
    conga = np.std(g_matrix[:, 12:] - g_matrix[:, :-12], axis=1)

    diffs = np.abs(np.diff(g_matrix, axis=1))
    sd_col = g_std[:, None]
    mask = diffs > sd_col
    sum_excursions = np.sum(np.where(mask, diffs, 0.0), axis=1)
    count_excursions = np.sum(mask, axis=1)
    mage = np.where(count_excursions > 0, sum_excursions / np.maximum(count_excursions, 1), g_std)
    glucose_cv = np.where(g_mean > 0, (g_std / g_mean) * 100.0, 0.0)

    # 3. Patient-Specific Baseline Ratio (current glucose / window historical mean)
    g_ratio = np.where(g_mean > 0, g_last / g_mean, 1.0)
    g_ratio = np.nan_to_num(g_ratio, nan=1.0, posinf=1.0, neginf=1.0)

    # 4. Frequency-Domain (FFT) Spectral Density Features
    g_detrend = g_matrix - g_mean[:, None]
    fft_vals = np.fft.rfft(g_detrend, axis=1)
    fft_power = np.abs(fft_vals) ** 2

    # Low frequency power (slow drift: indices 1-3)
    fft_power_low = np.sum(fft_power[:, 1:4], axis=1)
    # High frequency power (rapid oscillations: indices 4-12)
    fft_power_high = np.sum(fft_power[:, 4:], axis=1)
    fft_total_energy = np.sum(fft_power[:, 1:], axis=1)
    fft_ratio_high_low = np.where(fft_power_low > 0, fft_power_high / fft_power_low, 0.0)
    fft_ratio_high_low = np.nan_to_num(fft_ratio_high_low, nan=0.0, posinf=0.0)
    fft_dominant_freq = np.argmax(fft_power[:, 1:], axis=1) + 1

    # 5. Pharmacokinetic Insulin & Carb Decays
    iob_est = df_m1["iob_est"].values.astype(float) if "iob_est" in df_m1.columns else np.zeros(len(df_m1))
    cob_est = df_m1["cob_est"].values.astype(float) if "cob_est" in df_m1.columns else np.zeros(len(df_m1))
    metabolic_delta = (cob_est * 3.5) - (iob_est * 45.0)
    metabolic_predicted_glucose = g_last + metabolic_delta

    # 6. Non-linear Glycemic Risk & Trajectories
    clipped_g = np.clip(g_last, 10.0, 600.0)
    f_g = 1.509 * (np.log(clipped_g) ** 1.084 - 5.381)
    r_g = 10.0 * (f_g ** 2)
    lbgi = np.where(f_g < 0, r_g, 0.0)
    hbgi = np.where(f_g > 0, r_g, 0.0)

    g_accel = df_m1["glucose_accel"].values.astype(float) if "glucose_accel" in df_m1.columns else np.zeros(len(df_m1))
    roc_15m = df_m1["glucose_roc_15m"].values.astype(float) if "glucose_roc_15m" in df_m1.columns else g_roc * 0.5
    roc_30m = df_m1["glucose_roc_30m"].values.astype(float) if "glucose_roc_30m" in df_m1.columns else g_roc
    roc_60m = df_m1["glucose_roc_60m"].values.astype(float) if "glucose_roc_60m" in df_m1.columns else g_roc_1h

    hour_frac = ts.dt.hour.values + ts.dt.minute.values / 60.0
    hour_sin = np.sin(2 * np.pi * hour_frac / 24.0)
    hour_cos = np.cos(2 * np.pi * hour_frac / 24.0)

    # 7. Multi-Horizon Projections & Penetration Depths
    proj_30 = g_last + roc_30m
    proj_60 = g_last + 2 * roc_30m
    proj_120 = g_last + 4 * roc_30m

    dist_to_54 = g_last - 54.0
    dist_to_250 = 250.0 - g_last

    min_proj = np.minimum(g_last, np.minimum(proj_30, np.minimum(proj_60, proj_120)))
    max_proj = np.maximum(g_last, np.maximum(proj_30, np.maximum(proj_60, proj_120)))

    proj_hypo_danger = np.maximum(0.0, 54.0 - np.minimum(min_proj, metabolic_predicted_glucose))
    proj_hyper_danger = np.maximum(0.0, np.maximum(max_proj, metabolic_predicted_glucose) - 250.0)

    # 8. Multi-Horizon Targets & Clinical Sub-types
    t30 = df_m1["target_30min"].values.astype(float)
    t60 = df_m1["target_60min"].values.astype(float)
    t120 = df_m1["target_120min"].values.astype(float)

    # Tier 2: 120-min Proactive Adverse Event (<54 mg/dL or >250 mg/dL)
    target_hypo = ((t30 < 54.0) | (t60 < 54.0) | (t120 < 54.0)).astype(int)
    target_hyper = ((t30 > 250.0) | (t60 > 250.0) | (t120 > 250.0)).astype(int)
    labels_120 = (target_hypo | target_hyper).astype(int)

    # Tier 1: 30-min Urgent Adverse Event (<54 mg/dL or >250 mg/dL)
    labels_30 = ((t30 < 54.0) | (t30 > 250.0)).astype(int)

    features_df = pd.DataFrame({
        "patient_id":                 df_m1["patient_id"].values,
        "window_end_time":            df_m1["timestamp"].values,
        # Baseline 12
        "glucose_mean":               g_mean,
        "glucose_std":                g_std,
        "glucose_min":                g_min,
        "glucose_max":                g_max,
        "glucose_last":               g_last,
        "glucose_roc":                g_roc,
        "glucose_roc_1h":             g_roc_1h,
        "hypo_count_window":          hypo_count,
        "hyper_count_window":         hyper_count,
        "time_below_70_pct":          time_below_70,
        "time_above_180_pct":         time_above_180,
        "hour_of_day":                hour_of_day,
        # Glycemic Volatility
        "mage":                       mage,
        "conga":                      conga,
        "glucose_cv":                 glucose_cv,
        # Patient-Specific Baseline Ratio
        "glucose_to_baseline_ratio":  g_ratio,
        # Frequency-Domain (FFT) Spectral Density
        "fft_power_low":              fft_power_low,
        "fft_power_high":             fft_power_high,
        "fft_total_energy":           fft_total_energy,
        "fft_ratio_high_low":         fft_ratio_high_low,
        "fft_dominant_freq":          fft_dominant_freq,
        # Pharmacokinetics
        "iob_est":                    iob_est,
        "cob_est":                    cob_est,
        "metabolic_delta":            metabolic_delta,
        "metabolic_predicted_glucose": metabolic_predicted_glucose,
        # Non-linear Risk & Trajectory
        "lbgi":                       lbgi,
        "hbgi":                       hbgi,
        "glucose_accel":              g_accel,
        "glucose_roc_15m":            roc_15m,
        "glucose_roc_30m":            roc_30m,
        "glucose_roc_60m":            roc_60m,
        "hour_sin":                   hour_sin,
        "hour_cos":                   hour_cos,
        # Projections & Boundary Distances
        "proj_30":                    proj_30,
        "proj_60":                    proj_60,
        "proj_120":                   proj_120,
        "dist_to_54":                 dist_to_54,
        "dist_to_250":                dist_to_250,
        "proj_hypo_danger":           proj_hypo_danger,
        "proj_hyper_danger":          proj_hyper_danger,
        # Target Labels & Clinical Sub-types
        "label":                      labels_120,
        "label_30min":                labels_30,
        "target_hypo":                target_hypo,
        "target_hyper":               target_hyper,
        "is_hypo_event":              target_hypo,
    })

    print(f"  Processed rows: {len(features_df):,} | 120m Rate: {labels_120.mean():.2%} | Hypo: {target_hypo.mean():.2%} | Hyper: {target_hyper.mean():.2%}")
    return features_df


def main():
    print("=" * 60)
    print("Model 2: Adverse Event Classifier — Data Preparation")
    print("=" * 60)

    for split in ["train", "val", "test"]:
        print(f"\nProcessing {split} split from {MODEL1_DATA_DIR / f'{split}.parquet'}...")
        m1_df = pd.read_parquet(MODEL1_DATA_DIR / f"{split}.parquet")
        m2_df = extract_model2_window_features(m1_df)

        out_path = OUT_DIR / f"{split}.parquet"
        m2_df.to_parquet(out_path, index=False)
        print(f"  Saved {split} to {out_path}")

    print("\nModel 2 Data Preparation Complete.")


if __name__ == "__main__":
    main()
