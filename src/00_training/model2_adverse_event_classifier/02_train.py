"""
Model 2: Adverse Event Classifier — LightGBM Training
======================================================
Binary classifier: Will an adverse glycemic event (hypo/hyper/DKA)
occur in the next 2 hours, given the last 2 hours of CGM?

Handles severe class imbalance via scale_pos_weight.
Evaluation: AUROC, F1, Precision, Recall, Specificity.
Saves model to: models/model2/
"""

import warnings
import json
import pickle
import numpy as np
import pandas as pd
import lightgbm as lgb
from pathlib import Path
from sklearn.metrics import (
    roc_auc_score, f1_score, precision_score,
    recall_score, classification_report, confusion_matrix
)

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).resolve().parents[3]
DATA_DIR  = ROOT / "data" / "processed" / "model2"
MODEL_DIR = ROOT / "models" / "model2"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

NON_FEATURES = ["patient_id", "window_end_time", "label"]

# ── Load & Prepare Features ───────────────────────────────────────────────────
def load_split(split: str):
    df = pd.read_parquet(DATA_DIR / f"{split}.parquet")
    drop_cols = [c for c in NON_FEATURES if c in df.columns]
    X = df.drop(columns=drop_cols).select_dtypes(include=[np.number])
    y = df["label"].values
    return X, y


# ── Train Classifier ──────────────────────────────────────────────────────────
def train_classifier(X_train, y_train, X_val, y_val):
    neg  = (y_train == 0).sum()
    pos  = (y_train == 1).sum()
    scale_pw = neg / (pos + 1e-6)   # handle class imbalance

    print(f"\nClass balance -> Negative: {neg:,} | Positive: {pos:,} | scale_pos_weight: {scale_pw:.1f}")

    params = {
        "objective":         "binary",
        "metric":            ["binary_logloss", "auc"],
        "boosting_type":     "gbdt",
        "n_estimators":      1000,
        "learning_rate":     0.05,
        "num_leaves":        31,
        "max_depth":         -1,
        "min_child_samples": 20,
        "subsample":         0.8,
        "colsample_bytree":  0.8,
        "scale_pos_weight":  scale_pw,
        "reg_alpha":         0.1,
        "reg_lambda":        0.1,
        "random_state":      42,
        "n_jobs":            -1,
        "verbose":           -1,
    }

    model = lgb.LGBMClassifier(**params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[
            lgb.early_stopping(stopping_rounds=50, verbose=False),
            lgb.log_evaluation(period=100),
        ],
    )
    return model


# ── Evaluate ──────────────────────────────────────────────────────────────────
def evaluate(model, X, y, split_name: str, threshold: float = 0.5) -> dict:
    proba = model.predict_proba(X)[:, 1]
    pred  = (proba >= threshold).astype(int)

    auroc = roc_auc_score(y, proba) if y.sum() > 0 else float("nan")
    f1    = f1_score(y, pred, zero_division=0)
    prec  = precision_score(y, pred, zero_division=0)
    rec   = recall_score(y, pred, zero_division=0)

    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel() \
        if y.sum() > 0 and (y == 0).sum() > 0 else (0, 0, 0, 0)
    spec = tn / (tn + fp + 1e-6)

    print(f"\n-- {split_name} Results (threshold={threshold}) --")
    print(f"  AUROC      : {auroc:.4f}")
    print(f"  F1 Score   : {f1:.4f}")
    print(f"  Precision  : {prec:.4f}  (of 'high risk' alarms, how many were real?)")
    print(f"  Recall     : {rec:.4f}  (of real adverse events, how many did we catch?)")
    print(f"  Specificity: {spec:.4f}  (of true negatives, how many did we correctly not alarm?)")
    if y.sum() > 0 and (y == 0).sum() > 0:
        print(f"\n  Confusion Matrix:\n  {confusion_matrix(y, pred, labels=[0,1])}")

    return {
        "split": split_name, "auroc": round(auroc, 4), "f1": round(f1, 4),
        "precision": round(prec, 4), "recall": round(rec, 4),
        "specificity": round(spec, 4),
    }


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Model 2 — Adverse Event Classifier Training (LightGBM)")
    print("=" * 60)

    print("\nLoading data...")
    X_train, y_train = load_split("train")
    X_val,   y_val   = load_split("val")
    X_test,  y_test  = load_split("test")
    print(f"Train: {len(X_train):,} | Val: {len(X_val):,} | Test: {len(X_test):,}")

    print("\nTraining classifier...")
    model = train_classifier(X_train, y_train, X_val, y_val)

    val_metrics  = evaluate(model, X_val,   y_val,   "Validation")
    test_metrics = evaluate(model, X_test,  y_test,  "Test")

    # ── Feature importance ─────────────────────────────────────────────────
    feat_importance = pd.Series(
        model.feature_importances_, index=X_train.columns
    ).sort_values(ascending=False)
    print(f"\nTop features:\n{feat_importance.to_string()}")

    # ── Save model ─────────────────────────────────────────────────────────
    model_path = MODEL_DIR / "lgbm_adverse_classifier.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"\nSaved: {model_path}")

    feat_cols_path = MODEL_DIR / "feature_cols.json"
    with open(feat_cols_path, "w") as f:
        json.dump(list(X_train.columns), f)

    # ── Save metrics ───────────────────────────────────────────────────────
    metrics_df = pd.DataFrame([val_metrics, test_metrics])
    metrics_df.to_csv(MODEL_DIR / "training_results.csv", index=False)
    print(f"\nResults saved to {MODEL_DIR / 'training_results.csv'}")
    print("\nDone.")
