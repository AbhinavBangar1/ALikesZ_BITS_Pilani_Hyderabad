"""
Model 1: Glucose Forecasting — Data Preparation
================================================
Sources:
  - Primary : data-T1DM/HUPA-UCM Diabetes Dataset/Preprocessed (25 patients, 5-min intervals)
  - Secondary: data-T1DM/sharpic-ManchesterCSCoordinatedDiabetesStudy-ea52718 (Manchester)

Split (HUPA-UCM):
  - Train    : patients 1–20  (20 patients)
  - Validate : patients 21–22 (2 patients)
  - Test     : patients 23–25 (3 patients)

Output:
  - data/processed/model1/train.parquet
  - data/processed/model1/val.parquet
  - data/processed/model1/test.parquet
"""

import os
import re
import glob
import warnings
import numpy as np
import pandas as pd
from pathlib import Path

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[3]          # project root
HUPA_DIR      = ROOT / "data-T1DM" / "HUPA-UCM Diabetes Dataset" / "Preprocessed"
MANCHESTER_DIR = ROOT / "data-T1DM" / "sharpic-ManchesterCSCoordinatedDiabetesStudy-ea52718"
OUT_DIR       = ROOT / "data" / "processed" / "model1"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Prediction horizons: predict glucose at t+30, t+60, t+120 minutes
# At 5-min resolution: 6 steps, 12 steps, 24 steps
HORIZONS  = {"30min": 6, "60min": 12, "120min": 24}
LOOKBACK  = 24   # 2-hour lookback window (24 × 5-min = 120 min)

FEATURE_COLS = [
    "glucose",
    "calories",
    "heart_rate",
    "steps",
    "basal_rate",
    "bolus_volume_delivered",
    "carb_input",
]

# ── 1. Load HUPA-UCM ──────────────────────────────────────────────────────────
def load_hupa_patient(fpath: Path, patient_id: str) -> pd.DataFrame:
    df = pd.read_csv(fpath, sep=";", parse_dates=["time"])
    df = df.rename(columns={"time": "timestamp"})
    df["patient_id"] = patient_id
    df["source"] = "HUPA-UCM"

    # Convert glucose from mg/dL (already in mg/dL for HUPA-UCM)
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Forward-fill small gaps (≤3 missing readings), then drop remaining NaN rows
    df[FEATURE_COLS] = df[FEATURE_COLS].ffill(limit=3)
    df = df.dropna(subset=["glucose"])
    return df


def load_all_hupa() -> pd.DataFrame:
    files = sorted(HUPA_DIR.glob("HUPA*.csv"))
    print(f"Found {len(files)} HUPA-UCM patient files.")
    frames = []
    for f in files:
        pid = f.stem          # e.g. HUPA0001P
        frames.append(load_hupa_patient(f, pid))
    return pd.concat(frames, ignore_index=True)


# ── 2. Load Manchester Study ──────────────────────────────────────────────────
def load_manchester() -> pd.DataFrame:
    """
    Merges Glucose + Activity + Nutrition + Bolus for each Manchester patient.
    Resamples everything to 5-min intervals to match HUPA-UCM.
    """
    gluc_files = sorted((MANCHESTER_DIR / "Glucose Data").glob("UoMGlucose*.csv"))
    print(f"Found {len(gluc_files)} Manchester patient files.")
    all_patients = []

    for gf in gluc_files:
        # Extract patient ID suffix e.g. 2301
        pid_suffix = re.search(r"(\d{4})", gf.stem).group(1)
        patient_id = f"Manchester_{pid_suffix}"

        # --- Glucose (mmol/L → convert to mg/dL) ---
        gluc = pd.read_csv(gf)
        gluc["timestamp"] = pd.to_datetime(gluc["bg_ts"], dayfirst=True, errors="coerce")
        gluc = gluc.dropna(subset=["timestamp"])
        gluc = gluc.rename(columns={"value": "glucose"})
        gluc["glucose"] = gluc["glucose"] * 18.0182   # mmol/L → mg/dL
        gluc = gluc.set_index("timestamp")[["glucose"]].sort_index()
        gluc.index = pd.DatetimeIndex(gluc.index)
        gluc = gluc.resample("5min").mean()

        # --- Activity ---
        act_file = MANCHESTER_DIR / "Activity Data" / f"UoMActivity{pid_suffix}.csv"
        if act_file.exists():
            act = pd.read_csv(act_file)
            act["timestamp"] = pd.to_datetime(act["activity_ts"], dayfirst=True, errors="coerce")
            act = act.dropna(subset=["timestamp"])
            act = act.rename(columns={"step_count": "steps", "active_Kcal": "calories"})
            act = act[["timestamp", "steps", "calories"]].set_index("timestamp").sort_index()
            act.index = pd.DatetimeIndex(act.index)
            act = act.resample("5min").sum()
        else:
            act = pd.DataFrame(columns=["steps", "calories"])

        # --- Nutrition (Carbs) ---
        nut_file = MANCHESTER_DIR / "Nutrition Data" / f"UoMNutrition{pid_suffix}.csv"
        if nut_file.exists():
            nut = pd.read_csv(nut_file)
            nut["timestamp"] = pd.to_datetime(nut["meal_ts"], dayfirst=True, errors="coerce")
            nut = nut.dropna(subset=["timestamp"])
            nut = nut.rename(columns={"carbs_g": "carb_input"})
            nut = nut[["timestamp", "carb_input"]].set_index("timestamp").sort_index()
            nut["carb_input"] = pd.to_numeric(nut["carb_input"], errors="coerce").fillna(0)
            nut.index = pd.DatetimeIndex(nut.index)
            nut = nut.resample("5min").sum()
        else:
            nut = pd.DataFrame(columns=["carb_input"])

        # --- Bolus Insulin ---
        bol_file = MANCHESTER_DIR / "Insulin Data" / "Bolus Data" / f"UoMBolus{pid_suffix}.csv"
        if bol_file.exists():
            bol = pd.read_csv(bol_file)
            bol["timestamp"] = pd.to_datetime(bol["bolus_ts"], dayfirst=True, errors="coerce")
            bol = bol.dropna(subset=["timestamp"])
            bol = bol.rename(columns={"bolus_dose": "bolus_volume_delivered"})
            bol = bol[["timestamp", "bolus_volume_delivered"]].set_index("timestamp").sort_index()
            bol.index = pd.DatetimeIndex(bol.index)
            bol = bol.resample("5min").sum()
        else:
            bol = pd.DataFrame(columns=["bolus_volume_delivered"])

        # Merge all on glucose timeline
        df = gluc.join(act, how="left") \
                 .join(nut, how="left") \
                 .join(bol, how="left")

        df["basal_rate"] = np.nan               # not available in Manchester
        df["heart_rate"] = np.nan               # not available in Manchester
        df = df.fillna({"steps": 0, "calories": 0, "carb_input": 0,
                        "bolus_volume_delivered": 0})
        df = df.dropna(subset=["glucose"])
        df = df.reset_index().rename(columns={"index": "timestamp"})
        df["patient_id"] = patient_id
        df["source"] = "Manchester"
        all_patients.append(df)

    if not all_patients:
        return pd.DataFrame()
    return pd.concat(all_patients, ignore_index=True)


# ── 3. Engineer Rolling Window Features ───────────────────────────────────────
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each patient independently, create:
    - lag features for past LOOKBACK steps (2-hour window)
    - rolling glucose statistics (mean, std over 30 and 60 min)
    - time-of-day cyclic features (sin/cos hour)
    - target columns: glucose at t+30min, t+60min, t+120min
    """
    results = []
    for pid, grp in df.groupby("patient_id"):
        grp = grp.sort_values("timestamp").reset_index(drop=True)

        # ── Lag features (past 2 hours of glucose, carbs, insulin, activity)
        lag_cols = ["glucose", "carb_input", "bolus_volume_delivered", "steps", "heart_rate"]
        for lag in range(1, LOOKBACK + 1):
            for col in lag_cols:
                if col in grp.columns:
                    grp[f"{col}_lag{lag}"] = grp[col].shift(lag)

        # ── Rolling statistics on glucose
        grp["glucose_roll_mean_30"] = grp["glucose"].rolling(6).mean()
        grp["glucose_roll_std_30"]  = grp["glucose"].rolling(6).std()
        grp["glucose_roll_mean_60"] = grp["glucose"].rolling(12).mean()
        grp["glucose_roll_std_60"]  = grp["glucose"].rolling(12).std()

        # ── Glucose rate of change (delta per 5 min) and acceleration
        grp["glucose_roc"] = grp["glucose"].diff()
        grp["glucose_accel"] = grp["glucose_roc"].diff()
        grp["glucose_roc_15m"] = grp["glucose"] - grp["glucose"].shift(3)
        grp["glucose_roc_30m"] = grp["glucose"] - grp["glucose"].shift(6)
        grp["glucose_roc_60m"] = grp["glucose"] - grp["glucose"].shift(12)

        # ── Rolling extremes
        grp["glucose_roll_min_30"] = grp["glucose"].rolling(6).min()
        grp["glucose_roll_max_30"] = grp["glucose"].rolling(6).max()
        grp["glucose_roll_range_30"] = grp["glucose_roll_max_30"] - grp["glucose_roll_min_30"]
        grp["glucose_roll_min_60"] = grp["glucose"].rolling(12).min()
        grp["glucose_roll_max_60"] = grp["glucose"].rolling(12).max()
        grp["glucose_roll_range_60"] = grp["glucose_roll_max_60"] - grp["glucose_roll_min_60"]

        # ── Exponential Moving Averages (EMA)
        grp["glucose_ema_15"] = grp["glucose"].ewm(span=3, adjust=False).mean()
        grp["glucose_ema_30"] = grp["glucose"].ewm(span=6, adjust=False).mean()
        grp["glucose_ema_60"] = grp["glucose"].ewm(span=12, adjust=False).mean()
        grp["glucose_diff_ema_15"] = grp["glucose"] - grp["glucose_ema_15"]
        grp["glucose_diff_ema_60"] = grp["glucose"] - grp["glucose_ema_60"]

        # ── Estimated Insulin on Board (IOB) & Carbs on Board (COB) decay
        iob_decay = np.exp(-np.arange(LOOKBACK + 1) / 12.0)
        cob_decay = np.exp(-np.arange(LOOKBACK + 1) / 8.0)

        bolus_series = grp["bolus_volume_delivered"].fillna(0) if "bolus_volume_delivered" in grp.columns else pd.Series(0, index=grp.index)
        carb_series  = grp["carb_input"].fillna(0) if "carb_input" in grp.columns else pd.Series(0, index=grp.index)

        iob_vals = np.zeros(len(grp))
        cob_vals = np.zeros(len(grp))
        b_arr = bolus_series.values
        c_arr = carb_series.values
        for idx in range(LOOKBACK, len(grp)):
            iob_vals[idx] = np.sum(b_arr[idx - LOOKBACK: idx + 1][::-1] * iob_decay)
            cob_vals[idx] = np.sum(c_arr[idx - LOOKBACK: idx + 1][::-1] * cob_decay)
        grp["iob_est"] = iob_vals
        grp["cob_est"] = cob_vals

        # ── Kovatchev Low / High Blood Glucose Risk Indices (LBGI & HBGI)
        clipped_g = np.clip(grp["glucose"].values, 10.0, 600.0)
        f_g = 1.509 * (np.log(clipped_g) ** 1.084 - 5.381)
        risk = 10.0 * (f_g ** 2)
        grp["lbgi"] = np.where(f_g < 0, risk, 0.0)
        grp["hbgi"] = np.where(f_g > 0, risk, 0.0)

        # ── Glycemic volatility ratios
        grp["tbr_30_pct"] = (grp["glucose"].rolling(6).apply(lambda x: (x < 70).mean() * 100.0, raw=True)).fillna(0)
        grp["tar_30_pct"] = (grp["glucose"].rolling(6).apply(lambda x: (x > 180).mean() * 100.0, raw=True)).fillna(0)

        # ── Patient-Specific Baseline Ratio (current glucose / historical lookback mean)
        hist_mean = grp["glucose"].rolling(LOOKBACK).mean()
        grp["glucose_to_baseline_ratio"] = (grp["glucose"] / hist_mean.replace(0, np.nan)).fillna(1.0)

        # ── Time-of-day cyclical encoding
        grp["hour"] = grp["timestamp"].dt.hour + grp["timestamp"].dt.minute / 60
        grp["hour_sin"] = np.sin(2 * np.pi * grp["hour"] / 24)
        grp["hour_cos"] = np.cos(2 * np.pi * grp["hour"] / 24)

        # ── Targets (Absolute & Delta)
        for label, steps in HORIZONS.items():
            grp[f"target_{label}"] = grp["glucose"].shift(-steps)
            grp[f"delta_{label}"] = grp[f"target_{label}"] - grp["glucose"]

        # ── Drop rows with NaN in targets or insufficient lookback
        grp = grp.dropna(subset=[f"target_{k}" for k in HORIZONS])
        grp = grp.iloc[LOOKBACK:]           # ensure full lookback available

        results.append(grp)

    return pd.concat(results, ignore_index=True)


# ── 4. Split & Save ───────────────────────────────────────────────────────────
def split_and_save(hupa_df: pd.DataFrame, manchester_df: pd.DataFrame):
    # HUPA-UCM patient list (sorted by numeric ID)
    hupa_patients = sorted(hupa_df["patient_id"].unique(),
                           key=lambda x: int(re.search(r"\d+", x).group()))

    train_ids    = hupa_patients[:20]
    val_ids      = hupa_patients[20:22]
    test_ids     = hupa_patients[22:]

    print(f"\nHUPA-UCM split:")
    print(f"  Train    ({len(train_ids)} patients): {train_ids}")
    print(f"  Validate ({len(val_ids)} patients) : {val_ids}")
    print(f"  Test     ({len(test_ids)} patients): {test_ids}")

    train_hupa = hupa_df[hupa_df["patient_id"].isin(train_ids)]
    val_hupa   = hupa_df[hupa_df["patient_id"].isin(val_ids)]
    test_hupa  = hupa_df[hupa_df["patient_id"].isin(test_ids)]

    # Manchester goes entirely into TRAIN (augments training data)
    if not manchester_df.empty:
        print(f"\nManchester patients added to training: {manchester_df['patient_id'].nunique()}")
        train_df = pd.concat([train_hupa, manchester_df], ignore_index=True)
    else:
        train_df = train_hupa

    val_df  = val_hupa
    test_df = test_hupa

    # Engineer features per split
    print("\nEngineering features...")
    train_df = engineer_features(train_df)
    val_df   = engineer_features(val_df)
    test_df  = engineer_features(test_df)

    print(f"\nFinal shapes:")
    print(f"  Train    : {train_df.shape}")
    print(f"  Validate : {val_df.shape}")
    print(f"  Test     : {test_df.shape}")

    train_df.to_parquet(OUT_DIR / "train.parquet",    index=False)
    val_df.to_parquet(OUT_DIR / "val.parquet",        index=False)
    test_df.to_parquet(OUT_DIR / "test.parquet",      index=False)

    print(f"\nSaved to {OUT_DIR}/")
    return train_df, val_df, test_df


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Model 1 — Data Preparation")
    print("=" * 60)

    print("\n[1/3] Loading HUPA-UCM...")
    hupa_df = load_all_hupa()
    print(f"      Total rows: {len(hupa_df):,}, Patients: {hupa_df['patient_id'].nunique()}")

    print("\n[2/3] Loading Manchester Study...")
    manchester_df = load_manchester()
    if not manchester_df.empty:
        print(f"      Total rows: {len(manchester_df):,}, Patients: {manchester_df['patient_id'].nunique()}")
    else:
        print("      No Manchester data found, skipping.")

    print("\n[3/3] Splitting and saving...")
    train_df, val_df, test_df = split_and_save(hupa_df, manchester_df)

    print("\nDone. Preview of training features:")
    feature_cols = [c for c in train_df.columns if not c.startswith("target_")]
    print(train_df[feature_cols[:10]].head(3).to_string())
