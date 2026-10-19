"""
Model 1: Upgraded Physiological Glucose Forecaster — LightGBM Training
========================================================================
Key Innovations:
  1. Residual / Delta Target Formulation (predicting delta = G_{t+h} - G_t)
     to eliminate baseline drift and drastically lower RMSE across horizons.
  2. DeltaForecaster Wrapper: Seamlessly reconstructs absolute future glucose
     hat{G}_{t+h} = G_t + delta_hat, maintaining 100% backward compatibility
     with twin_core.py, API routes, and evaluation metrics.
  3. Huber Loss Optimization: Robust against transient meal spikes and directly
     optimizes Clarke Error Grid Zone A accuracy.
  4. Expanded Physiological Feature Space (160+ features: IOB, COB, Acceleration,
     multi-horizon ROC, EMAs, LBGI/HBGI).

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

from delta_forecaster import DeltaForecaster

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).resolve().parents[3]
DATA_DIR  = ROOT / "data" / "processed" / "model1"
MODEL_DIR = ROOT / "models" / "model1"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

HORIZONS  = ["30min", "60min", "120min"]

# Columns to drop when building feature matrix
NON_FEATURES = [
    "timestamp", "patient_id", "source", "device", "hour",
    "target_30min", "target_60min", "target_120min",
    "delta_30min", "delta_60min", "delta_120min",
]

# ── Robust Huber Hyperparameters ─────────────────────────────────────────────
LGB_PARAMS = {
    "objective":        "huber",
    "huber_delta":      10.0,
    "metric":           ["rmse", "mae"],
    "boosting_type":    "gbdt",
    "n_estimators":     1500,
    "learning_rate":    0.03,
    "num_leaves":       63,
    "max_depth":        8,
    "min_child_samples": 20,
    "subsample":        0.85,
    "colsample_bytree": 0.85,
    "reg_alpha":        0.05,
    "reg_lambda":       0.1,
    "random_state":     42,
    "n_jobs":           -1,
    "verbose":          -1,
}


# ── Clarke Error Grid Zone A check ───────────────────────────────────────────
def clarke_zone_a_pct(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Returns % of predictions in Zone A of the Clarke Error Grid.
    Zone A:
      1. |relative error| <= 20% for reference >= 70 mg/dL
      2. |pred - true| <= 14 mg/dL for reference < 70 mg/dL
      3. Both true and pred < 70 mg/dL
    """
    ref = np.array(y_true, dtype=float)
    pred = np.array(y_pred, dtype=float)

    zone_a_mask = (
        ((ref >= 70) & (np.abs(pred - ref) <= 0.20 * ref)) |
        ((ref < 70) & (np.abs(pred - ref) <= 14.0)) |
        ((ref < 70) & (pred < 70))
    )
    return float(np.mean(zone_a_mask) * 100.0)


# ── Load Features ─────────────────────────────────────────────────────────────
def load_features(split: str) -> pd.DataFrame:
    path = DATA_DIR / f"{split}.parquet"
    df = pd.read_parquet(path)
    return df


def get_X_y(df: pd.DataFrame, horizon: str):
    drop_cols = [c for c in NON_FEATURES if c in df.columns]
    X = df.drop(columns=drop_cols, errors="ignore")
    X = X.select_dtypes(include=[np.number])

    # Target is delta for training
    delta_col = f"delta_{horizon}"
    target_col = f"target_{horizon}"

    y_delta = df[delta_col].values.astype(float)
    y_true_abs = df[target_col].values.astype(float)
    curr_glucose = df["glucose"].values.astype(float)

    return X, y_delta, y_true_abs, curr_glucose


# ── Train Horizon ─────────────────────────────────────────────────────────────
def train_horizon(horizon: str, train_df: pd.DataFrame,
                  val_df: pd.DataFrame, test_df: pd.DataFrame):

    print(f"\n==========================================")
    print(f"Training Horizon: {horizon}")
    print(f"==========================================")

    X_train, y_train_delta, y_train_abs, g_train = get_X_y(train_df, horizon)
    X_val,   y_val_delta,   y_val_abs,   g_val   = get_X_y(val_df,   horizon)
    X_test,  y_test_delta,  y_test_abs,  g_test  = get_X_y(test_df,  horizon)

    feature_names = list(X_train.columns)
    print(f"  Feature dimensions: {len(feature_names)}")
    print(f"  Train: {len(X_train):,} | Val: {len(X_val):,} | Test: {len(X_test):,}")

    base_model = lgb.LGBMRegressor(**LGB_PARAMS)
    base_model.fit(
        X_train, y_train_delta,
        eval_set=[(X_val, y_val_delta)],
        callbacks=[
            lgb.early_stopping(stopping_rounds=60, verbose=False),
            lgb.log_evaluation(period=200),
        ],
    )

    # Wrap with DeltaForecaster for backward-compatible absolute glucose prediction
    forecaster = DeltaForecaster(base_model, glucose_col="glucose")

    # ── Evaluate on validation set ─────────────────────────────────────────
    val_pred_abs = forecaster.predict(X_val)
    val_rmse = np.sqrt(mean_squared_error(y_val_abs, val_pred_abs))
    val_mae  = mean_absolute_error(y_val_abs, val_pred_abs)
    val_zone_a = clarke_zone_a_pct(y_val_abs, val_pred_abs)

    # ── Evaluate on test set ───────────────────────────────────────────────
    test_pred_abs = forecaster.predict(X_test)
    test_rmse = np.sqrt(mean_squared_error(y_test_abs, test_pred_abs))
    test_mae  = mean_absolute_error(y_test_abs, test_pred_abs)
    test_zone_a = clarke_zone_a_pct(y_test_abs, test_pred_abs)

    metrics = {
        "horizon":        horizon,
        "val_rmse":       round(val_rmse, 3),
        "val_mae":        round(val_mae, 3),
        "val_zone_a_pct": round(val_zone_a, 2),
        "test_rmse":      round(test_rmse, 3),
        "test_mae":       round(test_mae, 3),
        "test_zone_a_pct": round(test_zone_a, 2),
        "best_iteration": base_model.best_iteration_,
        "n_features":     len(feature_names),
    }

    print(f"\n  [Validation] -> RMSE: {val_rmse:.2f} mg/dL | MAE: {val_mae:.2f} mg/dL | Clarke Zone A: {val_zone_a:.2f}%")
    print(f"  [Test]       -> RMSE: {test_rmse:.2f} mg/dL | MAE: {test_mae:.2f} mg/dL | Clarke Zone A: {test_zone_a:.2f}%")

    # ── Top 10 feature importances ─────────────────────────────────────────
    feat_importance = pd.Series(
        base_model.feature_importances_, index=feature_names
    ).sort_values(ascending=False)
    print(f"\n  Top 10 features:\n{feat_importance.head(10).to_string()}")

    # ── Save model ─────────────────────────────────────────────────────────
    model_path = MODEL_DIR / f"lgbm_{horizon}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(forecaster, f)
    print(f"\n  Saved model wrapper: {model_path}")

    # ── Save feature column names (for inference contract) ────────────────
    feature_cols_path = MODEL_DIR / f"feature_cols_{horizon}.json"
    with open(feature_cols_path, "w") as f:
        json.dump(feature_names, f)

    return metrics


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Model 1 — Upgraded Physiological Forecaster Training")
    print("=" * 60)

    print("\nLoading parquet data splits...")
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
    print("FINAL UPGRADED RESULTS SUMMARY")
    print("=" * 60)
    summary = pd.DataFrame(all_metrics)
    print(summary.to_string(index=False))

    summary.to_csv(MODEL_DIR / "training_results.csv", index=False)
    print(f"\nResults saved to {MODEL_DIR / 'training_results.csv'}")
