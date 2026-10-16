"""
Model 1: Glucose Forecaster — LightGBM Training
================================================
Trains THREE separate LightGBM regressors (one per horizon):
  - t+30min  (6 steps ahead  @ 5-min resolution)
  - t+60min  (12 steps ahead @ 5-min resolution)
  - t+120min (24 steps ahead @ 5-min resolution)

Evaluation metric: RMSE + MAE + Clarke Error Grid Zone A/B accuracy
Saves model artifacts to: models/model1/
"""

import warnings
import json
import pickle
import numpy as np
import pandas as pd
import lightgbm as lgb
from pathlib import Path
from sklearn.metrics import mean_absolute_error, mean_squared_error

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).resolve().parents[3]
DATA_DIR  = ROOT / "data" / "processed" / "model1"
MODEL_DIR = ROOT / "models" / "model1"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

HORIZONS  = ["30min", "60min", "120min"]

# Columns to drop when building feature matrix
NON_FEATURES = [
    "timestamp", "patient_id", "source", "device",
    "target_30min", "target_60min", "target_120min",
    "hour",       # keep sin/cos encoded version instead
]

# ── LightGBM Hyperparameters ─────────────────────────────────────────────────
LGB_PARAMS = {
    "objective":        "regression",
    "metric":           ["rmse", "mae"],
    "boosting_type":    "gbdt",
    "n_estimators":     1000,
    "learning_rate":    0.05,
    "num_leaves":       63,
    "max_depth":        -1,
    "min_child_samples": 20,
    "subsample":        0.8,
    "colsample_bytree": 0.8,
    "reg_alpha":        0.1,
    "reg_lambda":       0.1,
    "random_state":     42,
    "n_jobs":           -1,
    "verbose":          -1,
}


# ── Clarke Error Grid Zone A check (simplified) ───────────────────────────────
def clarke_zone_a_pct(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Returns % of predictions in Zone A of the Clarke Error Grid.
    Zone A: |relative error| <= 20% OR both true and pred < 70 mg/dL.
    """
    in_zone_a = (
        (np.abs(y_pred - y_true) / (y_true + 1e-6) <= 0.20) |
        ((y_true < 70) & (y_pred < 70))
    )
    return in_zone_a.mean() * 100


# ── Load & Prepare Features ───────────────────────────────────────────────────
def load_features(split: str) -> pd.DataFrame:
    path = DATA_DIR / f"{split}.parquet"
    df = pd.read_parquet(path)
    return df


def get_X_y(df: pd.DataFrame, horizon: str):
    drop_cols = [c for c in NON_FEATURES if c in df.columns]
    target_col = f"target_{horizon}"
    X = df.drop(columns=drop_cols).drop(columns=[target_col], errors="ignore")
    # Drop other target columns too
    other_targets = [f"target_{h}" for h in HORIZONS if h != horizon]
    X = X.drop(columns=[c for c in other_targets if c in X.columns])
    X = X.select_dtypes(include=[np.number])
    y = df[target_col].values
    return X, y


# ── Train One Model ────────────────────────────────────────────────────────────
def train_horizon(horizon: str, train_df: pd.DataFrame,
                  val_df: pd.DataFrame, test_df: pd.DataFrame):

    print(f"\n-- Horizon: {horizon} --")

    X_train, y_train = get_X_y(train_df, horizon)
    X_val,   y_val   = get_X_y(val_df,   horizon)
    X_test,  y_test  = get_X_y(test_df,  horizon)

    print(f"  Features: {X_train.shape[1]}")
    print(f"  Train: {len(X_train):,} | Val: {len(X_val):,} | Test: {len(X_test):,}")

    model = lgb.LGBMRegressor(**LGB_PARAMS)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[
            lgb.early_stopping(stopping_rounds=50, verbose=False),
            lgb.log_evaluation(period=100),
        ],
    )

    # ── Evaluate on validation ─────────────────────────────────────────────
    val_pred  = model.predict(X_val)
    val_rmse  = np.sqrt(mean_squared_error(y_val, val_pred))
    val_mae   = mean_absolute_error(y_val, val_pred)
    val_zone_a = clarke_zone_a_pct(y_val, val_pred)

    # ── Evaluate on test ───────────────────────────────────────────────────
    test_pred   = model.predict(X_test)
    test_rmse   = np.sqrt(mean_squared_error(y_test, test_pred))
    test_mae    = mean_absolute_error(y_test, test_pred)
    test_zone_a = clarke_zone_a_pct(y_test, test_pred)

    metrics = {
        "horizon":        horizon,
        "val_rmse":       round(val_rmse, 3),
        "val_mae":        round(val_mae, 3),
        "val_zone_a_pct": round(val_zone_a, 2),
        "test_rmse":      round(test_rmse, 3),
        "test_mae":       round(test_mae, 3),
        "test_zone_a_pct": round(test_zone_a, 2),
        "best_iteration": model.best_iteration_,
        "n_features":     X_train.shape[1],
    }

    print(f"\n  Val  -> RMSE: {val_rmse:.2f} mg/dL | MAE: {val_mae:.2f} mg/dL | Zone-A: {val_zone_a:.1f}%")
    print(f"  Test -> RMSE: {test_rmse:.2f} mg/dL | MAE: {test_mae:.2f} mg/dL | Zone-A: {test_zone_a:.1f}%")

    # ── Top 10 feature importances ─────────────────────────────────────────
    feat_importance = pd.Series(
        model.feature_importances_, index=X_train.columns
    ).sort_values(ascending=False)
    print(f"\n  Top 10 features:\n{feat_importance.head(10).to_string()}")

    # ── Save model ─────────────────────────────────────────────────────────
    model_path = MODEL_DIR / f"lgbm_{horizon}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"\n  Saved: {model_path}")

    # ── Save feature column names (needed for inference) ──────────────────
    feature_cols_path = MODEL_DIR / f"feature_cols_{horizon}.json"
    with open(feature_cols_path, "w") as f:
        json.dump(list(X_train.columns), f)

    return metrics


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Model 1 — Glucose Forecaster Training (LightGBM)")
    print("=" * 60)

    print("\nLoading data...")
    train_df = load_features("train")
    val_df   = load_features("val")
    test_df  = load_features("test")
    print(f"Train: {len(train_df):,} | Val: {len(val_df):,} | Test: {len(test_df):,}")

    all_metrics = []
    for horizon in HORIZONS:
        metrics = train_horizon(horizon, train_df, val_df, test_df)
        all_metrics.append(metrics)

    # ── Summary ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("FINAL RESULTS SUMMARY")
    print("=" * 60)
    summary = pd.DataFrame(all_metrics)
    print(summary.to_string(index=False))

    summary.to_csv(MODEL_DIR / "training_results.csv", index=False)
    print(f"\nResults saved to {MODEL_DIR / 'training_results.csv'}")
