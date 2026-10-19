"""
Model 4: Type 2 Diabetes Adverse Event Classifier — Training
============================================================
Trains an adverse glycemic event classifier tailored to Type 2 Diabetes physiology
using the Shanghai_T2DM clinical cohort.

Clinical Objective:
  In Type 2 Diabetes, acute severe hypoglycemia (< 54 mg/dL) is rare (0.58%),
  while Severe Hyperglycemia (> 250 mg/dL) and hyperosmolar risks are prevalent (6.35%).
  Focal weighting heavily prioritizes detecting impending severe hyperglycemia excursions
  while preserving vigilance for acute crashes.

Outputs:
  - models/model4/lgbm_t2_classifier.pkl
  - models/model4/feature_cols.json
  - models/model4/threshold_config.json
  - models/model4/training_results.csv
"""

import sys
import json
import pickle
import warnings
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from catboost import CatBoostClassifier
from sklearn.metrics import (
    roc_auc_score, f1_score, precision_score,
    recall_score, confusion_matrix, precision_recall_curve
)

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data" / "processed" / "model4"
MODEL_DIR = ROOT / "models" / "model4"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Add ROOT to sys.path so EnsembleClassifier unpickles cleanly anywhere
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ensemble_classifier import EnsembleClassifier

NON_FEATURES = [
    "timestamp", "patient_id",
    "label", "label_30min",
    "target_hyper", "target_hypo", "is_hyper_event"
]


def load_split(split: str):
    df = pd.read_parquet(DATA_DIR / f"{split}.parquet")
    drop_cols = [c for c in NON_FEATURES if c in df.columns]
    X = df.drop(columns=drop_cols).select_dtypes(include=[np.number])

    y_120 = df["label"].values.astype(int)
    y_30 = df["label_30min"].values.astype(int) if "label_30min" in df.columns else y_120
    is_hyper = df["target_hyper"].values.astype(int) if "target_hyper" in df.columns else np.zeros(len(df), dtype=int)
    is_hypo = df["target_hypo"].values.astype(int) if "target_hypo" in df.columns else np.zeros(len(df), dtype=int)
    return X, y_120, y_30, is_hyper, is_hypo, df


def find_optimal_threshold(y_true, y_prob):
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
    f1_scores = 2 * (precisions * recalls) / (precisions + recalls + 1e-9)
    best_idx = np.argmax(f1_scores)
    best_threshold = float(thresholds[best_idx]) if best_idx < len(thresholds) else 0.5
    best_f1 = float(f1_scores[best_idx])
    return round(best_threshold, 4), round(best_f1, 4)


def evaluate_threshold_performance(y_true, y_prob, threshold: float, label_name: str):
    pred = (y_prob >= threshold).astype(int)
    auroc = float(roc_auc_score(y_true, y_prob))
    f1 = float(f1_score(y_true, pred, zero_division=0))
    prec = float(precision_score(y_true, pred, zero_division=0))
    rec = float(recall_score(y_true, pred, zero_division=0))
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    spec = float(tn / (tn + fp + 1e-6))

    print(f"\n[{label_name} Performance @ tau*={threshold:.4f}]")
    print(f"  AUROC:       {auroc:.4f}")
    print(f"  F1 Score:    {f1:.4f}")
    print(f"  Precision:   {prec:.4f} ({prec:.1%})")
    print(f"  Recall:      {rec:.4f} ({rec:.1%})")
    print(f"  Specificity: {spec:.4f} ({spec:.1%})")
    print(f"  Confusion:   TN={tn:,}, FP={fp:,}, FN={fn:,}, TP={tp:,}")
    return {
        "auroc": round(auroc, 4),
        "f1": round(f1, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "specificity": round(spec, 4),
        "optimal_threshold": round(threshold, 4),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "true_negatives": int(tn),
        "false_negatives": int(fn),
    }


def main():
    print("=" * 65)
    print("Model 4: Type 2 Adverse Risk Classifier Training (Shanghai_T2DM)")
    print("=" * 65)

    print("\nLoading parquet data splits...")
    X_train, y_tr_120, y_tr_30, hyper_tr, hypo_tr, df_tr = load_split("train")
    X_val,   y_va_120, y_va_30, hyper_va, hypo_va, df_va = load_split("val")
    X_test,  y_te_120, y_te_30, hyper_te, hypo_te, df_te = load_split("test")

    feature_cols = list(X_train.columns)
    print(f"Features ({len(feature_cols)}): {feature_cols[:8]} ... (total {len(feature_cols)})")
    print(f"Train: {len(X_train):,} | Val: {len(X_val):,} | Test: {len(X_test):,}")

    # ── Asymmetric Focal Weighting for Severe Hyperglycemia ─────────────
    # Base positive balance
    base_pos_weight = (y_tr_120 == 0).sum() / (y_tr_120 == 1).sum()
    clinical_weights = np.ones(len(y_tr_120), dtype=float)
    clinical_weights = np.where(y_tr_120 == 1, base_pos_weight * 0.50, 1.0)
    # Heavily prioritize detecting severe hyperglycemia (> 250 mg/dL) at 3.5x rate
    clinical_weights = np.where(hyper_tr == 1, clinical_weights * 3.5, clinical_weights)
    clinical_weights = np.where(hypo_tr == 1, clinical_weights * 4.0, clinical_weights)
    clinical_weights = clinical_weights / clinical_weights.mean()

    # ── 1. LightGBM Classifier ────────────────────────────────────────────
    print("\n[1/3] Training LightGBM Classifier with Hyperglycemia Focal Weights...")
    lgb_params = {
        "objective":         "binary",
        "metric":            ["auc", "binary_logloss"],
        "boosting_type":     "gbdt",
        "n_estimators":      1000,
        "num_leaves":        63,
        "max_depth":         6,
        "learning_rate":     0.035,
        "min_child_samples": 40,
        "subsample":         0.75,
        "colsample_bytree":  0.80,
        "random_state":      42,
        "n_jobs":            -1,
        "verbose":           -1,
    }
    model_lgb = lgb.LGBMClassifier(**lgb_params)
    model_lgb.fit(
        X_train, y_tr_120,
        sample_weight=clinical_weights,
        eval_set=[(X_val, y_va_120)],
        callbacks=[
            lgb.early_stopping(stopping_rounds=40, verbose=False),
            lgb.log_evaluation(period=200),
        ],
    )

    # ── 2. CatBoost Classifier ───────────────────────────────────────────
    print("\n[2/3] Training CatBoost Classifier...")
    model_cat = CatBoostClassifier(
        iterations=800,
        learning_rate=0.04,
        depth=6,
        auto_class_weights="Balanced",
        eval_metric="AUC",
        random_seed=42,
        thread_count=-1,
        verbose=0,
    )
    model_cat.fit(
        X_train, y_tr_120,
        sample_weight=clinical_weights,
        eval_set=(X_val, y_va_120),
        early_stopping_rounds=40,
    )

    # ── 3. Build Ensemble Classifier ──────────────────────────────────────
    print("\n[3/3] Blending LightGBM + CatBoost Ensemble...")
    ensemble = EnsembleClassifier([model_lgb, model_cat], weights=[0.50, 0.50])

    val_prob_120 = ensemble.predict_proba(X_val)[:, 1]
    test_prob_120 = ensemble.predict_proba(X_test)[:, 1]

    val_auroc_120 = float(roc_auc_score(y_va_120, val_prob_120))
    test_auroc_120 = float(roc_auc_score(y_te_120, test_prob_120))
    opt_tau_120, opt_f1_120 = find_optimal_threshold(y_va_120, val_prob_120)

    # ── Multi-Horizon Evaluation ──────────────────────────────────────────
    print("\n" + "=" * 65)
    print("Multi-Horizon Clinical Risk Evaluation (Type 2 Diabetes)")
    print("=" * 65)

    tier2_metrics = evaluate_threshold_performance(
        y_te_120, test_prob_120, opt_tau_120, "Tier 2: 120-min Proactive Excursion Alert"
    )

    val_auroc_30 = float(roc_auc_score(y_va_30, val_prob_120))
    test_auroc_30 = float(roc_auc_score(y_te_30, test_prob_120))
    opt_tau_30, _ = find_optimal_threshold(y_va_30, val_prob_120)
    tier1_metrics = evaluate_threshold_performance(
        y_te_30, test_prob_120, opt_tau_30, "Tier 1: 30-min Urgent Excursion Alert"
    )

    # ── Save Artifacts ─────────────────────────────────────────────────────
    model_path = MODEL_DIR / "lgbm_t2_classifier.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(ensemble, f)
    with open(Path(__file__).parent / "lgbm_t2_classifier.pkl", "wb") as f:
        pickle.dump(ensemble, f)
    print(f"\nSaved Upgraded Model 4: {model_path}")

    feat_path = MODEL_DIR / "feature_cols.json"
    with open(feat_path, "w") as f:
        json.dump(feature_cols, f, indent=2)
    with open(Path(__file__).parent / "feature_cols.json", "w") as f:
        json.dump(feature_cols, f, indent=2)
    print(f"Saved Feature Columns ({len(feature_cols)}): {feat_path}")

    thresh_config = {
        "optimal_threshold": opt_tau_120,
        "default_threshold": 0.50,
        "tier2_120min_proactive_alert": {
            "validation_auroc": round(val_auroc_120, 4),
            "test_auroc": round(test_auroc_120, 4),
            "optimal_threshold": opt_tau_120,
            "test_f1": tier2_metrics["f1"],
            "test_precision": tier2_metrics["precision"],
            "test_recall": tier2_metrics["recall"],
            "test_specificity": tier2_metrics["specificity"],
            "confusion": {
                "tp": tier2_metrics["true_positives"],
                "fp": tier2_metrics["false_positives"],
                "tn": tier2_metrics["true_negatives"],
                "fn": tier2_metrics["false_negatives"],
            }
        },
        "tier1_30min_urgent_alert": {
            "validation_auroc": round(val_auroc_30, 4),
            "test_auroc": round(test_auroc_30, 4),
            "optimal_threshold": opt_tau_30,
            "test_f1": tier1_metrics["f1"],
            "test_precision": tier1_metrics["precision"],
            "test_recall": tier1_metrics["recall"],
            "test_specificity": tier1_metrics["specificity"],
            "confusion": {
                "tp": tier1_metrics["true_positives"],
                "fp": tier1_metrics["false_positives"],
                "tn": tier1_metrics["true_negatives"],
                "fn": tier1_metrics["false_negatives"],
            }
        }
    }
    with open(MODEL_DIR / "threshold_config.json", "w") as f:
        json.dump(thresh_config, f, indent=2)
    with open(Path(__file__).parent / "threshold_config.json", "w") as f:
        json.dump(thresh_config, f, indent=2)
    print(f"Saved Threshold Config: {MODEL_DIR / 'threshold_config.json'}")

    summary_df = pd.DataFrame([
        {
            "tier": "Tier 2 (120-min)",
            "split": "Test",
            "auroc": round(test_auroc_120, 4),
            "f1": tier2_metrics["f1"],
            "precision": tier2_metrics["precision"],
            "recall": tier2_metrics["recall"],
            "specificity": tier2_metrics["specificity"],
            "threshold": opt_tau_120,
        },
        {
            "tier": "Tier 1 (30-min)",
            "split": "Test",
            "auroc": round(test_auroc_30, 4),
            "f1": tier1_metrics["f1"],
            "precision": tier1_metrics["precision"],
            "recall": tier1_metrics["recall"],
            "specificity": tier1_metrics["specificity"],
            "threshold": opt_tau_30,
        }
    ])
    summary_df.to_csv(MODEL_DIR / "training_results.csv", index=False)
    summary_df.to_csv(Path(__file__).parent / "training_results.csv", index=False)
    print(f"Saved Training Summary:\n{summary_df}")


if __name__ == "__main__":
    main()
