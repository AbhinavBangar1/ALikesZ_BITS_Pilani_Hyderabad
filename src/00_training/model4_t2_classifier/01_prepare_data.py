"""
Model 4: Type 2 Diabetes Adverse Event Classifier — Data Preparation
===================================================================
Prepares adverse glycemic event classification datasets from Shanghai_T2DM.
In Type 2 Diabetes, the dominant life-threatening and chronic danger is
Severe Hyperglycemia / Hyperosmolar Hyperglycemic State (HHS) (> 250 mg/dL),
while severe hypoglycemia (< 54 mg/dL) is rare.

Outputs:
  - data/processed/model4/train.parquet
  - data/processed/model4/val.parquet
  - data/processed/model4/test.parquet
"""

import warnings
from pathlib import Path
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[3]
MODEL3_DATA_DIR = ROOT / "data" / "processed" / "model3"
OUT_DIR = ROOT / "data" / "processed" / "model4"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def extract_model4_features(df_m3: pd.DataFrame) -> pd.DataFrame:
    """
    Extracts Model 4 feature matrix, FFT spectral markers, and Type 2 adverse event labels.
    """
    # Glucose window array over past 24 steps
    glucose_cols = [f"glucose_lag{i}" for i in range(24, 0, -1)] + ["glucose"]
    g_matrix = df_m3[glucose_cols].values.astype(float)
    g_last = df_m3["glucose"].values.astype(float)
    g_mean = np.mean(g_matrix, axis=1)

    # Frequency-Domain (FFT) Spectral Density
    g_detrend = g_matrix - g_mean[:, None]
    fft_vals = np.fft.rfft(g_detrend, axis=1)
    fft_power = np.abs(fft_vals) ** 2
    fft_power_low = np.sum(fft_power[:, 1:4], axis=1)
    fft_power_high = np.sum(fft_power[:, 4:], axis=1)
    fft_total_energy = np.sum(fft_power[:, 1:], axis=1)
    fft_ratio_high_low = np.where(fft_power_low > 0, fft_power_high / fft_power_low, 0.0)
    fft_ratio_high_low = np.nan_to_num(fft_ratio_high_low, nan=0.0, posinf=0.0)
    fft_dominant_freq = np.argmax(fft_power[:, 1:], axis=1) + 1

    # Targets & Adverse Event Definitions
    t30 = df_m3["target_30min"].values.astype(float)
    t60 = df_m3["target_60min"].values.astype(float)
    t120 = df_m3["target_120min"].values.astype(float)

    # In T2D: Severe Hyperglycemia (> 250 mg/dL) is primary clinical crisis
    target_hyper = ((t30 > 250.0) | (t60 > 250.0) | (t120 > 250.0)).astype(int)
    target_hypo = ((t30 < 54.0) | (t60 < 54.0) | (t120 < 54.0)).astype(int)
    labels_120 = (target_hyper | target_hypo).astype(int)
    labels_30 = ((t30 > 250.0) | (t30 < 54.0)).astype(int)

    features_df = pd.DataFrame({
        "timestamp":                 df_m3["timestamp"].values,
        "patient_id":                df_m3["patient_id"].values,
        "glucose":                   g_last,
        "glucose_roll_mean_30":      df_m3["glucose_roll_mean_30"].values,
        "glucose_roll_std_30":       df_m3["glucose_roll_std_30"].values,
        "glucose_roll_min_30":       df_m3["glucose_roll_min_30"].values,
        "glucose_roll_max_30":       df_m3["glucose_roll_max_30"].values,
        "glucose_roll_range_30":     df_m3["glucose_roll_range_30"].values,
        "glucose_roll_mean_60":      df_m3["glucose_roll_mean_60"].values,
        "glucose_roll_std_60":       df_m3["glucose_roll_std_60"].values,
        "glucose_roll_min_60":       df_m3["glucose_roll_min_60"].values,
        "glucose_roll_max_60":       df_m3["glucose_roll_max_60"].values,
        "glucose_roll_range_60":     df_m3["glucose_roll_range_60"].values,
        "glucose_roc":               df_m3["glucose_roc"].values,
        "glucose_accel":             df_m3["glucose_accel"].values,
        "glucose_roc_15m":           df_m3["glucose_roc_15m"].values,
        "glucose_roc_30m":           df_m3["glucose_roc_30m"].values,
        "glucose_roc_60m":           df_m3["glucose_roc_60m"].values,
        "glucose_mean_24h":          df_m3["glucose_mean_24h"].values,
        "glucose_drift_24h":         df_m3["glucose_drift_24h"].values,
        "glucose_to_baseline_ratio": df_m3["glucose_to_baseline_ratio"].values,
        "glucose_cv":                df_m3["glucose_cv"].values,
        "carb_input":                df_m3["carb_input"].values,
        "cob_est":                   df_m3["cob_est"].values,
        "carb_roll_sum_2h":          df_m3["carb_roll_sum_2h"].values,
        "iob_est":                   df_m3["iob_est"].values,
        "hour_of_day":               df_m3["hour_of_day"].values,
        "hour_sin":                  df_m3["hour_sin"].values,
        "hour_cos":                  df_m3["hour_cos"].values,
        "dawn_phenomenon":           df_m3["dawn_phenomenon"].values,
        "postprandial_window":       df_m3["postprandial_window"].values,
        "mage":                      df_m3["mage"].values,
        "conga":                     df_m3["conga"].values,
        "lbgi":                      df_m3["lbgi"].values,
        "hbgi":                      df_m3["hbgi"].values,
        "tbr_30_pct":                df_m3["tbr_30_pct"].values,
        "tar_30_pct":                df_m3["tar_30_pct"].values,
        "proj_30":                   df_m3["proj_30"].values,
        "proj_60":                   df_m3["proj_60"].values,
        "proj_120":                  df_m3["proj_120"].values,
        "dist_to_180":               df_m3["dist_to_180"].values,
        "dist_to_250":               df_m3["dist_to_250"].values,
        "dist_to_54":                df_m3["dist_to_54"].values,
        "proj_hyper_danger":         df_m3["proj_hyper_danger"].values,
        "proj_hypo_danger":          df_m3["proj_hypo_danger"].values,
        # FFT features
        "fft_power_low":             fft_power_low,
        "fft_power_high":            fft_power_high,
        "fft_total_energy":          fft_total_energy,
        "fft_ratio_high_low":        fft_ratio_high_low,
        "fft_dominant_freq":         fft_dominant_freq,
        # Targets
        "label":                     labels_120,
        "label_30min":               labels_30,
        "target_hyper":              target_hyper,
        "target_hypo":               target_hypo,
        "is_hyper_event":            target_hyper,
    })

    print(f"  Processed rows: {len(features_df):,} | 120m Rate: {labels_120.mean():.2%} | Hyper: {target_hyper.mean():.2%} | Hypo: {target_hypo.mean():.2%}")
    return features_df


def main():
    print("=" * 65)
    print("Model 4: Type 2 Adverse Classifier — Data Preparation")
    print("=" * 65)

    for split in ["train", "val", "test"]:
        print(f"\nProcessing {split} split from {MODEL3_DATA_DIR / f'{split}.parquet'}...")
        m3_df = pd.read_parquet(MODEL3_DATA_DIR / f"{split}.parquet")
        m4_df = extract_model4_features(m3_df)

        out_path = OUT_DIR / f"{split}.parquet"
        m4_df.to_parquet(out_path, index=False)
        print(f"  Saved {split} to {out_path}")

    print("\nModel 4 Data Preparation Complete.")


if __name__ == "__main__":
    main()
