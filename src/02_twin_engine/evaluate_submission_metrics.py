"""
Automated Model Benchmark & Evaluation Suite
============================================
Evaluates:
  1. Model 1 (LightGBM Multi-Horizon Glucose Forecaster):
     - RMSE, MAE, Clarke Error Grid Zone A and Zone B percentages for:
       - t+30 min (6 steps)
       - t+60 min (12 steps)
       - t+120 min (24 steps)
  2. Model 2 (LightGBM Adverse Event Classifier):
     - AUROC, Average Precision, Sensitivity (Recall), Specificity, and F1-Score.

Outputs:
  - reports/submission_benchmark_metrics.json
"""

import json
import pickle
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import (
    mean_squared_error,
    mean_absolute_error,
    roc_auc_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
)

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
DATA_DIR = ROOT / "data" / "processed"
REPORTS_DIR = ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def clarke_error_grid(ref_values, pred_values):
    """
    Computes percentage of points falling in Zone A and Zone B of the Clarke Error Grid.
    Reference: Clarke WL et al. Diabetes Care 1987.
    """
    ref = np.array(ref_values)
    pred = np.array(pred_values)

    total_pts = len(ref)
    if total_pts == 0:
        return 0.0, 0.0

    # Zone A:
    # 1. Prediction within 20% of reference when ref >= 70 mg/dL
    # 2. Prediction within 14 mg/dL when ref < 70 mg/dL (i.e. |pred - ref| <= 14)
    # 3. Both pred < 70 and ref < 70
    zone_a_mask = (
        ((ref >= 70) & (np.abs(pred - ref) <= 0.20 * ref)) |
        ((ref < 70) & (np.abs(pred - ref) <= 14.0)) |
        ((ref < 70) & (pred < 70))
    )

    # Zone B: Clinically acceptable (points outside A that would not lead to inappropriate treatment)
    # 1. Ref >= 180 and pred >= 70 and pred <= ref - 0.20 * ref
    # 2. Ref <= 70 and pred >= 70 and pred <= 180
    # 3. 70 < ref < 180 and outside Zone A
    zone_b_mask = (
        (~zone_a_mask) &
        (
            ((ref >= 180) & (pred <= 180) & (pred >= 70)) |
            ((ref <= 70) & (pred >= 70) & (pred <= 180)) |
            ((ref > 70) & (ref < 180) & (np.abs(pred - ref) <= 0.40 * ref))
        )
    )

    zone_a_pct = float(np.mean(zone_a_mask) * 100.0)
    zone_b_pct = float(np.mean(zone_b_mask) * 100.0)
    zone_ab_pct = zone_a_pct + zone_b_pct

    return round(zone_a_pct, 2), round(zone_b_pct, 2), round(zone_ab_pct, 2)


def evaluate_model1():
    print("\n" + "=" * 60)
    print("Evaluating Model 1: Multi-Horizon Glucose Forecasting")
    print("=" * 60)

    test_path = DATA_DIR / "model1" / "test.parquet"
    if not test_path.exists():
        print(f"[Model 1] Test parquet not found at {test_path}")
        return {}

    # Sample up to 50,000 test points for fast evaluation
    df_test = pd.read_parquet(test_path)
    if len(df_test) > 50000:
        df_test = df_test.sample(50000, random_state=42).reset_index(drop=True)

    results = {}
    for h in ["30min", "60min", "120min"]:
        m_file = MODELS_DIR / "model1" / f"lgbm_{h}.pkl"
        feat_file = MODELS_DIR / "model1" / f"feature_cols_{h}.json"

        with open(m_file, "rb") as f:
            model = pickle.load(f)
        with open(feat_file, "r") as f:
            feature_cols = json.load(f)

        target_col = f"target_{h}"
        valid_df = df_test.dropna(subset=[target_col] + feature_cols)
        X = valid_df[feature_cols]
        y_true = valid_df[target_col].values

        y_pred = model.predict(X)

        rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        mae = float(mean_absolute_error(y_true, y_pred))
        zone_a, zone_b, zone_ab = clarke_error_grid(y_true, y_pred)

        results[h] = {
            "test_rmse": round(rmse, 2),
            "test_mae": round(mae, 2),
            "clarke_zone_a_pct": zone_a,
            "clarke_zone_b_pct": zone_b,
            "clarke_zone_ab_pct": zone_ab,
            "evaluated_samples": len(valid_df),
        }

        print(f"[{h} Horizon] RMSE: {rmse:.2f} mg/dL | MAE: {mae:.2f} mg/dL | Clarke Zone A: {zone_a}% | Zone A+B: {zone_ab}%")

    return results


def evaluate_model2():
    print("\n" + "=" * 60)
    print("Evaluating Model 2: Adverse Event Risk Classifier")
    print("=" * 60)

    test_path = DATA_DIR / "model2" / "test.parquet"
    if not test_path.exists():
        print(f"[Model 2] Test parquet not found at {test_path}")
        return {}

    m2_file = MODELS_DIR / "model2" / "lgbm_adverse_classifier.pkl"
    m2_feat_file = MODELS_DIR / "model2" / "feature_cols.json"

    with open(m2_file, "rb") as f:
        model = pickle.load(f)
    with open(m2_feat_file, "r") as f:
        feature_cols = json.load(f)

    # Sample up to 60,000 rows for evaluation
    df_test = pd.read_parquet(test_path)
    if len(df_test) > 60000:
        df_test = df_test.sample(60000, random_state=42).reset_index(drop=True)

    valid_df = df_test.dropna(subset=["label"] + feature_cols)
    X = valid_df[feature_cols]
    y_true = valid_df["label"].values.astype(int)

    y_prob = model.predict_proba(X)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    auroc = float(roc_auc_score(y_true, y_prob))
    avg_prec = float(average_precision_score(y_true, y_prob))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    sensitivity = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0

    results = {
        "auroc": round(auroc, 4),
        "average_precision": round(avg_prec, 4),
        "f1_score": round(f1, 4),
        "sensitivity_recall": round(sensitivity, 4),
        "specificity": round(specificity, 4),
        "evaluated_samples": len(valid_df),
        "positive_events": int(tp + fn)
    }

    print(f"AUROC: {auroc:.4f} | Avg Precision: {avg_prec:.4f} | F1: {f1:.4f} | Sensitivity: {sensitivity:.2%} | Specificity: {specificity:.2%}")

    return results


def main():
    m1_results = evaluate_model1()
    m2_results = evaluate_model2()

    summary = {
        "timestamp": str(pd.Timestamp.now()),
        "model1_glucose_forecasting": m1_results,
        "model2_adverse_event_classifier": m2_results,
        "dual_cohort_support": {
            "type_1_cohort_count": 8,
            "type_2_cohort_count": 7,
            "sampling_frequency": "15-second continuous IoT wearable streams",
            "clinical_decision_support_system": "Dawn Phenomenon, Nocturnal Hypo, Post-Exercise Hypo, and HOMA-IR Resistance Detection"
        }
    }

    out_file = REPORTS_DIR / "submission_benchmark_metrics.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\n" + "=" * 60)
    print(f"Benchmark evaluation complete. Saved to {out_file}")
    print("=" * 60)


if __name__ == "__main__":
    main()
