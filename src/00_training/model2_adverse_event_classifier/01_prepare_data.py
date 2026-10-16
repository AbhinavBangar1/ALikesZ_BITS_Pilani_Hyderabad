"""
Model 2: Adverse Event Classifier — Data Preparation
=====================================================
Source: data-T1DM/DCLP3/Data Files/
  - cgm.txt          : CGM readings (PtID, Period, DataDtTm, CGM in mg/dL)
  - AdvEvent_a.txt   : Adverse events (Hyperglycemia, Hypoglycemia, DKA)

Strategy:
  - For each 2-hour rolling window of CGM per patient, label it 1 if
    an adverse event occurred within the NEXT 2 hours, else 0.
  - Features: statistical summaries of the CGM window + rate of change.
  - Class imbalance handled via scale_pos_weight in LightGBM.

Split: 70% Train / 15% Val / 15% Test (time-based within each patient)

Output:
  - data/processed/model2/train.parquet
  - data/processed/model2/val.parquet
  - data/processed/model2/test.parquet
"""

import re
import warnings
import numpy as np
import pandas as pd
from pathlib import Path

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).resolve().parents[3]
DCLP3_DIR = ROOT / "data-T1DM" / "DCLP3" / "Data Files"
OUT_DIR   = ROOT / "data" / "processed" / "model2"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WINDOW_STEPS = 24   # 2-hour window at 5-min resolution
HORIZON_STEPS = 24  # Look 2 hours ahead for adverse event


# ── 1. Load CGM ───────────────────────────────────────────────────────────────
def load_cgm() -> pd.DataFrame:
    fpath = DCLP3_DIR / "cgm.txt"
    df = pd.read_csv(fpath, sep="|")
    df = df.rename(columns={"PtID": "patient_id", "DataDtTm": "timestamp", "CGM": "glucose"})

    # Parse DCLP3's SAS datetime format: e.g. '12DEC17:00:04:24'
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="%d%b%y:%H:%M:%S", errors="coerce")
    df = df.dropna(subset=["timestamp", "glucose"])
    df["glucose"] = pd.to_numeric(df["glucose"], errors="coerce")
    df = df.dropna(subset=["glucose"])
    df = df.sort_values(["patient_id", "timestamp"]).reset_index(drop=True)
    print(f"CGM loaded: {len(df):,} rows, {df['patient_id'].nunique()} patients")
    return df


# ── 2. Load Adverse Events ─────────────────────────────────────────────────────
def load_adverse_events() -> pd.DataFrame:
    fpath = DCLP3_DIR / "AdvEvent_a.txt"
    df = pd.read_csv(fpath, sep="|", encoding="utf-16")
    df = df.rename(columns={"PtID": "patient_id", "AEOnsetDt": "event_time"})

    # Keep only glucose-related adverse events
    df["event_time"] = pd.to_datetime(df["event_time"], errors="coerce")
    df = df.dropna(subset=["event_time"])

    # Tag event severity
    df["event_type"] = df["ParentMedCondListID"].fillna("Unknown")

    hypo_mask  = df["event_type"].str.contains("Hypoglycemia|hypo", case=False, na=False)
    hyper_mask = df["event_type"].str.contains("Hyperglycemia|hyper|ketosis|DKA", case=False, na=False)
    df = df[hypo_mask | hyper_mask].copy()

    df = df[["patient_id", "event_time", "event_type"]]
    print(f"Adverse events loaded: {len(df):,} events, {df['patient_id'].nunique()} patients")
    return df


# ── 3. Create Labeled Windows ─────────────────────────────────────────────────
def create_labeled_windows(cgm_df: pd.DataFrame, events_df: pd.DataFrame) -> pd.DataFrame:
    """
    Slide a 2-hour window across each patient's CGM time series.
    Label = 1 if ANY adverse event occurs within the next 2 hours.
    """
    records = []
    all_patients = cgm_df["patient_id"].unique()

    for pid in all_patients:
        pt_cgm = cgm_df[cgm_df["patient_id"] == pid].reset_index(drop=True)
        pt_events = events_df[events_df["patient_id"] == pid]["event_time"].values

        # Resample patient CGM to uniform 5-min grid
        pt_cgm = pt_cgm.set_index("timestamp")["glucose"]
        pt_cgm = pt_cgm.resample("5min").mean().ffill(limit=3)
        pt_cgm = pt_cgm.dropna()

        glucose_vals = pt_cgm.values
        timestamps   = pt_cgm.index

        n = len(glucose_vals)
        if n < WINDOW_STEPS + HORIZON_STEPS:
            continue

        for i in range(WINDOW_STEPS, n - HORIZON_STEPS):
            window = glucose_vals[i - WINDOW_STEPS: i]
            window_end_time   = timestamps[i]
            horizon_end_time  = timestamps[min(i + HORIZON_STEPS - 1, n - 1)]

            # ── Features from 2-hour CGM window
            feat = {
                "patient_id":         pid,
                "window_end_time":    window_end_time,
                "glucose_mean":       window.mean(),
                "glucose_std":        window.std(),
                "glucose_min":        window.min(),
                "glucose_max":        window.max(),
                "glucose_last":       window[-1],
                "glucose_roc":        window[-1] - window[-6] if len(window) >= 6 else 0,   # 30-min delta
                "glucose_roc_1h":     window[-1] - window[-12] if len(window) >= 12 else 0, # 60-min delta
                "hypo_count_window":  (window < 70).sum(),
                "hyper_count_window": (window > 180).sum(),
                "time_below_70_pct":  (window < 70).mean() * 100,
                "time_above_180_pct": (window > 180).mean() * 100,
                "hour_of_day":        window_end_time.hour,
            }

            # ── Label: any adverse event in next 2 hours?
            label = 0
            if len(pt_events) > 0:
                upcoming = [
                    t for t in pt_events
                    if window_end_time <= pd.Timestamp(t) <= pd.Timestamp(horizon_end_time)
                ]
                label = 1 if len(upcoming) > 0 else 0

            feat["label"] = label
            records.append(feat)

    df = pd.DataFrame(records)
    print(f"\nWindowed dataset: {len(df):,} rows | Positive (adverse event) rate: {df['label'].mean():.3%}")
    return df


# ── 4. Split & Save ───────────────────────────────────────────────────────────
def split_and_save(df: pd.DataFrame):
    """
    Time-based split within each patient: 70/15/15
    """
    train_parts, val_parts, test_parts = [], [], []

    for pid, grp in df.groupby("patient_id"):
        grp = grp.sort_values("window_end_time").reset_index(drop=True)
        n = len(grp)
        t1 = int(n * 0.70)
        t2 = int(n * 0.85)
        train_parts.append(grp.iloc[:t1])
        val_parts.append(grp.iloc[t1:t2])
        test_parts.append(grp.iloc[t2:])

    train_df = pd.concat(train_parts, ignore_index=True)
    val_df   = pd.concat(val_parts,   ignore_index=True)
    test_df  = pd.concat(test_parts,  ignore_index=True)

    print(f"\nSplit sizes:")
    print(f"  Train    : {len(train_df):,} rows | Positive rate: {train_df['label'].mean():.3%}")
    print(f"  Validate : {len(val_df):,} rows | Positive rate: {val_df['label'].mean():.3%}")
    print(f"  Test     : {len(test_df):,} rows | Positive rate: {test_df['label'].mean():.3%}")

    train_df.to_parquet(OUT_DIR / "train.parquet", index=False)
    val_df.to_parquet(OUT_DIR  / "val.parquet",   index=False)
    test_df.to_parquet(OUT_DIR / "test.parquet",  index=False)
    print(f"\nSaved to {OUT_DIR}/")
    return train_df, val_df, test_df


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Model 2 — Adverse Event Classifier: Data Preparation")
    print("=" * 60)

    print("\n[1/3] Loading DCLP3 CGM...")
    cgm_df = load_cgm()

    print("\n[2/3] Loading adverse events...")
    events_df = load_adverse_events()

    print("\n[3/3] Building labeled windows and splitting...")
    windowed_df = create_labeled_windows(cgm_df, events_df)
    train_df, val_df, test_df = split_and_save(windowed_df)

    print("\nDone. Feature columns:")
    feat_cols = [c for c in train_df.columns if c not in ["patient_id", "window_end_time", "label"]]
    print(feat_cols)
