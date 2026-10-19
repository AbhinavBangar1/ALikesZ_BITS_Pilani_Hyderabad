"""
Model 3: Type 2 Diabetes Glucose Forecaster — Data Preparation
==============================================================
Ingests Shanghai_T2DM dataset, resamples to regular 5-minute telemetry ticks,
and engineers Type 2 physiological features (Carbs on Board, 24h baseline drift,
circadian rhythms, and Dawn Phenomenon markers).

Outputs:
  - data/processed/model3/train.parquet
  - data/processed/model3/val.parquet
  - data/processed/model3/test.parquet
"""

import os
import re
import warnings
from pathlib import Path
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data-T2DM" / "Shanghai_T2DM"
OUT_DIR = ROOT / "data" / "processed" / "model3"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def parse_carbs_from_diet(text: str) -> float:
    """
    Parses carbohydrate content from dietary text records in grams.
    """
    if not isinstance(text, str) or text.lower().strip() in ["data not available", "nan", ""]:
        return 0.0
    total_carbs = 0.0
    lines = text.strip().split("\n")
    for line in lines:
        m = re.search(r'(\d+(?:\.\d+)?)\s*g', line, re.IGNORECASE)
        if not m:
            continue
        grams = float(m.group(1))
        lower_line = line.lower()
        if any(w in lower_line for w in ["rice", "bread", "grain", "noodle", "dumpling", "porridge", "corn", "potato", "bun", "oat", "flour", "steamed bread"]):
            total_carbs += grams * 0.45
        elif any(w in lower_line for w in ["fruit", "apple", "banana", "lotus", "orange", "pear"]):
            total_carbs += grams * 0.20
        elif any(w in lower_line for w in ["vegetable", "cucumber", "cabbage", "soup", "tomato", "radish", "gourd", "cauliflower"]):
            total_carbs += grams * 0.05
        elif any(w in lower_line for w in ["egg", "meat", "pork", "beef", "chicken", "fish", "shrimp", "curd", "tofu"]):
            total_carbs += grams * 0.02
        else:
            total_carbs += grams * 0.20
    return round(total_carbs, 1)


def engineer_t2d_features(df_5m: pd.DataFrame) -> pd.DataFrame:
    """
    Given a patient's continuous 5-minute stream (timestamp, glucose, carb_input),
    computes full Type 2 physiological feature vectors and multi-horizon targets.
    """
    df = df_5m.sort_values("timestamp").reset_index(drop=True)
    n = len(df)
    if n < 30:
        return pd.DataFrame()

    g = df["glucose"].values.astype(float)
    carbs = df["carb_input"].values.astype(float)
    ts = pd.to_datetime(df["timestamp"])

    # 1. Autoregressive lags (past 2 hours @ 5-min steps: 1 to 24)
    lags = {}
    for i in range(1, 25):
        lags[f"glucose_lag{i}"] = np.roll(g, i)
        lags[f"carb_input_lag{i}"] = np.roll(carbs, i)
        lags[f"glucose_lag{i}"][:i] = g[0]
        lags[f"carb_input_lag{i}"][:i] = 0.0

    # Glucose matrix over the past 24 steps + current tick
    # Shape: (N, 25)
    lag_cols = [lags[f"glucose_lag{i}"] for i in range(24, 0, -1)] + [g]
    g_matrix = np.column_stack(lag_cols)

    # 2. Rolling statistics (30-min = 6 steps, 60-min = 12 steps)
    g_mean_30 = np.mean(g_matrix[:, -6:], axis=1)
    g_std_30 = np.std(g_matrix[:, -6:], axis=1)
    g_min_30 = np.min(g_matrix[:, -6:], axis=1)
    g_max_30 = np.max(g_matrix[:, -6:], axis=1)
    g_range_30 = g_max_30 - g_min_30

    g_mean_60 = np.mean(g_matrix[:, -12:], axis=1)
    g_std_60 = np.std(g_matrix[:, -12:], axis=1)
    g_min_60 = np.min(g_matrix[:, -12:], axis=1)
    g_max_60 = np.max(g_matrix[:, -12:], axis=1)
    g_range_60 = g_max_60 - g_min_60

    # 3. Velocities and Acceleration
    g_roc = g - lags["glucose_lag1"]
    g_accel = g_roc - (lags["glucose_lag1"] - lags["glucose_lag2"])
    g_roc_15m = g - lags["glucose_lag3"]
    g_roc_30m = g - lags["glucose_lag6"]
    g_roc_60m = g - lags["glucose_lag12"]

    # 4. Long-Term Baseline & 24-Hour Drift
    # Rolling 24-hour mean (up to 288 steps)
    g_series = pd.Series(g)
    g_mean_24h = g_series.rolling(288, min_periods=12).mean().bfill().values
    g_drift_24h = g - g_mean_24h
    g_ratio = np.where(g_mean_24h > 0, g / g_mean_24h, 1.0)
    g_cv = np.where(g_mean_60 > 0, (g_std_60 / g_mean_60) * 100.0, 0.0)

    # 5. EMAs
    ema15 = g_series.ewm(span=3, adjust=False).mean().values
    ema30 = g_series.ewm(span=6, adjust=False).mean().values
    ema60 = g_series.ewm(span=12, adjust=False).mean().values
    diff_ema15 = g - ema15
    diff_ema60 = g - ema60

    # 6. Carbs-on-Board (COB) & IOB
    # Exponential absorption decay over 2 hours
    cob_decay = np.exp(-np.arange(25) / 8.0)
    carb_matrix = np.column_stack([lags[f"carb_input_lag{i}"] for i in range(24, 0, -1)] + [carbs])
    cob_est = np.sum(carb_matrix * cob_decay[::-1], axis=1)
    carb_roll_sum_2h = np.sum(carb_matrix, axis=1)
    iob_est = np.zeros(n, dtype=float)

    # 7. Circadian Rhythm & Dawn Phenomenon Markers
    hours = ts.dt.hour.values + ts.dt.minute.values / 60.0
    hour_sin = np.sin(2 * np.pi * hours / 24.0)
    hour_cos = np.cos(2 * np.pi * hours / 24.0)
    hour_int = ts.dt.hour.values
    # Dawn phenomenon: early morning hepatic glucose release surge typical in T2D
    dawn_phenomenon = ((hour_int >= 4) & (hour_int <= 8)).astype(float)
    postprandial_window = (((hour_int >= 12) & (hour_int <= 14)) | ((hour_int >= 18) & (hour_int <= 21))).astype(float)

    # 8. Glycemic Volatility (MAGE & CONGA)
    conga = np.std(g_matrix[:, 12:] - g_matrix[:, :-12], axis=1)
    diffs = np.abs(np.diff(g_matrix, axis=1))
    sd_col = g_std_60[:, None]
    mask = diffs > sd_col
    sum_exc = np.sum(np.where(mask, diffs, 0.0), axis=1)
    cnt_exc = np.sum(mask, axis=1)
    mage = np.where(cnt_exc > 0, sum_exc / np.maximum(cnt_exc, 1), g_std_60)

    # 9. Non-linear Kovatchev Risk Indices
    clipped_g = np.clip(g, 10.0, 600.0)
    f_g = 1.509 * (np.log(clipped_g) ** 1.084 - 5.381)
    r_g = 10.0 * (f_g ** 2)
    lbgi = np.where(f_g < 0, r_g, 0.0)
    hbgi = np.where(f_g > 0, r_g, 0.0)

    tbr_30 = (np.sum(g_matrix[:, -6:] < 70.0, axis=1) / 6.0) * 100.0
    tar_30 = (np.sum(g_matrix[:, -6:] > 180.0, axis=1) / 6.0) * 100.0

    # 10. Dynamic Trajectory Projections & Boundary Distances
    proj_30 = g + g_roc_30m
    proj_60 = g + 2.0 * g_roc_30m
    proj_120 = g + 4.0 * g_roc_30m

    dist_to_180 = 180.0 - g
    dist_to_250 = 250.0 - g
    dist_to_54 = g - 54.0

    min_proj = np.minimum(g, np.minimum(proj_30, np.minimum(proj_60, proj_120)))
    max_proj = np.maximum(g, np.maximum(proj_30, np.maximum(proj_60, proj_120)))
    proj_hypo_danger = np.maximum(0.0, 54.0 - min_proj)
    proj_hyper_danger = np.maximum(0.0, max_proj - 250.0)

    # 11. Multi-Horizon Future Targets (at 5-min ticks: +6 steps = 30m, +12 = 60m, +24 = 120m)
    t30 = np.roll(g, -6)
    t60 = np.roll(g, -12)
    t120 = np.roll(g, -24)

    # Build Feature DataFrame
    feat_dict = {
        "timestamp": ts.values,
        "patient_id": df["patient_id"].values,
        # Baseline glucose
        "glucose": g,
        "glucose_roll_mean_30": g_mean_30,
        "glucose_roll_std_30": g_std_30,
        "glucose_roll_min_30": g_min_30,
        "glucose_roll_max_30": g_max_30,
        "glucose_roll_range_30": g_range_30,
        "glucose_roll_mean_60": g_mean_60,
        "glucose_roll_std_60": g_std_60,
        "glucose_roll_min_60": g_min_60,
        "glucose_roll_max_60": g_max_60,
        "glucose_roll_range_60": g_range_60,
        # Velocities
        "glucose_roc": g_roc,
        "glucose_accel": g_accel,
        "glucose_roc_15m": g_roc_15m,
        "glucose_roc_30m": g_roc_30m,
        "glucose_roc_60m": g_roc_60m,
        # Long-Term Drift
        "glucose_mean_24h": g_mean_24h,
        "glucose_drift_24h": g_drift_24h,
        "glucose_to_baseline_ratio": g_ratio,
        "glucose_cv": g_cv,
        # EMAs
        "glucose_ema_15": ema15,
        "glucose_ema_30": ema30,
        "glucose_ema_60": ema60,
        "glucose_diff_ema_15": diff_ema15,
        "glucose_diff_ema_60": diff_ema60,
        # Carbs on Board
        "carb_input": carbs,
        "cob_est": cob_est,
        "carb_roll_sum_2h": carb_roll_sum_2h,
        "iob_est": iob_est,
        # Circadian & Dawn
        "hour_of_day": hour_int,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "dawn_phenomenon": dawn_phenomenon,
        "postprandial_window": postprandial_window,
        # Volatility & Non-linear Risk
        "mage": mage,
        "conga": conga,
        "lbgi": lbgi,
        "hbgi": hbgi,
        "tbr_30_pct": tbr_30,
        "tar_30_pct": tar_30,
        # Projections & Bounds
        "proj_30": proj_30,
        "proj_60": proj_60,
        "proj_120": proj_120,
        "dist_to_180": dist_to_180,
        "dist_to_250": dist_to_250,
        "dist_to_54": dist_to_54,
        "proj_hyper_danger": proj_hyper_danger,
        "proj_hypo_danger": proj_hypo_danger,
        # Targets
        "target_30min": t30,
        "delta_30min": t30 - g,
        "target_60min": t60,
        "delta_60min": t60 - g,
        "target_120min": t120,
        "delta_120min": t120 - g,
    }

    # Add lags 1 to 24
    for i in range(1, 25):
        feat_dict[f"glucose_lag{i}"] = lags[f"glucose_lag{i}"]
        feat_dict[f"carb_input_lag{i}"] = lags[f"carb_input_lag{i}"]

    out_df = pd.DataFrame(feat_dict)

    # Trim lookback warmup (first 24 rows) and target lookahead (last 24 rows)
    out_df = out_df.iloc[24:-24].reset_index(drop=True)
    return out_df


def main():
    print("=" * 65)
    print("Model 3: Type 2 Forecaster — Ingesting Shanghai_T2DM Dataset")
    print("=" * 65)

    files = sorted([f for f in os.listdir(RAW_DIR) if f.endswith(".xlsx") or f.endswith(".xls")])
    unique_pids = sorted(list(set(f.split("_")[0] for f in files)))
    print(f"Discovered {len(files)} files across {len(unique_pids)} unique T2D patients.")

    # Strict Patient Isolation Split:
    # 70 Train, 10 Val, 20 Test
    train_pids = set(unique_pids[:70])
    val_pids = set(unique_pids[70:80])
    test_pids = set(unique_pids[80:])

    print(f"Patient Split: Train={len(train_pids)} | Val={len(val_pids)} | Test={len(test_pids)}")

    splits_data = {"train": [], "val": [], "test": []}

    for f in files:
        pid = f.split("_")[0]
        split = "train" if pid in train_pids else ("val" if pid in val_pids else "test")
        
        path = RAW_DIR / f
        try:
            df = pd.read_excel(path)
            cgm_col = [c for c in df.columns if "cgm" in str(c).lower()][0]
            diet_col = [c for c in df.columns if "diet" in str(c).lower()]

            df["timestamp"] = pd.to_datetime(df["Date"])
            df["glucose"] = pd.to_numeric(df[cgm_col], errors="coerce")

            if diet_col:
                df["carb_input"] = df[diet_col[0]].apply(parse_carbs_from_diet)
            else:
                df["carb_input"] = 0.0

            df = df.dropna(subset=["timestamp", "glucose"]).sort_values("timestamp")
            if len(df) < 15:
                continue

            # Resample from 15-min to standard 5-min intervals
            df = df.set_index("timestamp")
            g_5m = df["glucose"].resample("5min").interpolate(method="time")
            carb_5m = df["carb_input"].resample("5min").sum().fillna(0.0)

            df_5m = pd.DataFrame({
                "patient_id": pid,
                "glucose": g_5m,
                "carb_input": carb_5m
            }).dropna(subset=["glucose"]).reset_index()

            feat_df = engineer_t2d_features(df_5m)
            if not feat_df.empty:
                splits_data[split].append(feat_df)
        except Exception as e:
            print(f"Warning: Failed to process {f}: {e}")

    # Concatenate and save parquets
    for split, dfs in splits_data.items():
        if dfs:
            full_split_df = pd.concat(dfs, ignore_index=True)
            out_file = OUT_DIR / f"{split}.parquet"
            full_split_df.to_parquet(out_file, index=False)
            print(f"Saved {split.upper()} split: {len(full_split_df):,} rows -> {out_file}")

    print("\nModel 3 Data Preparation Complete.")


if __name__ == "__main__":
    main()
