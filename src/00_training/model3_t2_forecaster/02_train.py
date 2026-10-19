"""
Model 3: Type 2 Diabetes Multi-Horizon Glucose Forecaster — Training
====================================================================
Trains dedicated LightGBM Delta Regressors (+30m, +60m, +120m) tailored
to Type 2 Diabetes physiology using the Shanghai_T2DM clinical dataset.

Features:
  - Rolling 30m, 60m stats & multi-scale velocity
  - Long-term 24-hour baseline drift
  - Carbs-on-board (COB) decay
  - Circadian sine/cosine & Dawn Phenomenon hepatic indicators
  - Non-linear Kovatchev risk indices (LBGI, HBGI)
  - Trajectory boundary projections

Saves:
  - models/model3/lgbm_t2_forecaster.pkl
  - models/model3/feature_cols_t2.json
  - models/model3/training_results.csv
"""

import sys
import json
import pickle
import warnings
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import mean_squared_error, mean_absolute_error

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data" / "processed" / "model3"
MODEL_DIR = ROOT / "models" / "model3"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Add ROOT to sys.path so DeltaForecaster and T2DForecaster unpickle cleanly anywhere
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from delta_forecaster import DeltaForecaster
from t2_forecaster import T2DForecaster

HORIZONS = ["30min", "60min", "120min"]
NON_FEATURES = [
    "timestamp", "patient_id",
    "target_30min", "delta_30min",
    "target_60min", "delta_60min",
    "target_120min", "delta_120min"
]


def clarke_error_grid(ref, pred):
    """
    Computes Clarke Error Grid Analysis Zone A and Zone A+B percentages.
    """
    ref = np.array(ref, dtype=float)
    pred = np.array(pred, dtype=float)

    # Zone A: clinically accurate
    za = (((ref >= 70) & (np.abs(pred - ref) <= 0.20 * ref)) |
          ((ref < 70) & (np.abs(pred - ref) <= 14.0)) |
          ((ref < 70) & (pred < 70)))

    # Zone B: benign errors
    zb = (~za) & (((ref >= 180) & (pred <= 180) & (pred >= 70)) |
                  ((ref <= 70) & (pred >= 70) & (pred <= 180)) |
                  ((ref > 70) & (ref < 180) & (np.abs(pred - ref) <= 0.40 * ref)))

    za_pct = float(np.mean(za) * 100.0)
    zab_pct = float((np.mean(za) + np.mean(zb)) * 100.0)
    return za_pct, zab_pct


def main():
    print("=" * 65)
    print("Model 3: Type 2 Multi-Horizon Forecaster Training (Shanghai_T2DM)")
    print("=" * 65)

    print("\nLoading parquet splits...")
    df_train = pd.read_parquet(DATA_DIR / "train.parquet")
    df_val = pd.read_parquet(DATA_DIR / "val.parquet")
    df_test = pd.read_parquet(DATA_DIR / "test.parquet")

    drop_cols = [c for c in NON_FEATURES if c in df_train.columns]
    feature_cols = [c for c in df_train.columns if c not in drop_cols and pd.api.types.is_numeric_dtype(df_train[c])]

    print(f"Features ({len(feature_cols)}): {feature_cols[:8]} ... (total {len(feature_cols)})")
    print(f"Train: {len(df_train):,} | Val: {len(df_val):,} | Test: {len(df_test):,}")

    X_train = df_train[feature_cols]
    X_val = df_val[feature_cols]
    X_test = df_test[feature_cols]

    forecaster_dict = {}
    results = []

    for h in HORIZONS:
        print(f"\n--- Training Horizon +{h} (Delta Target: delta_{h}) ---")
        y_train_delta = df_train[f"delta_{h}"].values
        y_val_delta = df_val[f"delta_{h}"].values
        y_test_abs = df_test[f"target_{h}"].values

        params = {
            "objective": "huber",
            "alpha": 10.0,
            "metric": "mae",
            "boosting_type": "gbdt",
            "n_estimators": 800,
            "learning_rate": 0.04,
            "num_leaves": 95,
            "max_depth": 7,
            "subsample": 0.80,
            "colsample_bytree": 0.80,
            "random_state": 42,
            "n_jobs": -1,
            "verbose": -1,
        }

        model = lgb.LGBMRegressor(**params)
        model.fit(
            X_train, y_train_delta,
            eval_set=[(X_val, y_val_delta)],
            callbacks=[
                lgb.early_stopping(stopping_rounds=40, verbose=False),
                lgb.log_evaluation(period=200),
            ]
        )

        wrapped = DeltaForecaster(model, glucose_col="glucose")
        forecaster_dict[h] = wrapped

        preds = wrapped.predict(X_test)
        rmse = float(np.sqrt(mean_squared_error(y_test_abs, preds)))
        mae = float(mean_absolute_error(y_test_abs, preds))
        za, zab = clarke_error_grid(y_test_abs, preds)

        print(f"[{h} Test Metrics]")
        print(f"  RMSE:          {rmse:.2f} mg/dL")
        print(f"  MAE:           {mae:.2f} mg/dL")
        print(f"  Clarke Zone A: {za:.2f}%")
        print(f"  Clarke Zone A+B: {zab:.2f}%")

        results.append({
            "horizon": h,
            "rmse": round(rmse, 2),
            "mae": round(mae, 2),
            "clarke_zone_a": round(za, 2),
            "clarke_zone_ab": round(zab, 2),
            "best_iteration": model.best_iteration_
        })

    # Wrap all 3 horizons into T2DForecaster
    t2_forecaster = T2DForecaster(forecaster_dict)

    # Save artifact
    out_model_path = MODEL_DIR / "lgbm_t2_forecaster.pkl"
    with open(out_model_path, "wb") as f:
        pickle.dump(t2_forecaster, f)
    print(f"\nSaved Upgraded Model 3: {out_model_path}")

    # Also save copy in training directory
    with open(Path(__file__).parent / "lgbm_t2_forecaster.pkl", "wb") as f:
        pickle.dump(t2_forecaster, f)

    feat_path = MODEL_DIR / "feature_cols_t2.json"
    with open(feat_path, "w") as f:
        json.dump(feature_cols, f, indent=2)
    with open(Path(__file__).parent / "feature_cols_t2.json", "w") as f:
        json.dump(feature_cols, f, indent=2)
    print(f"Saved Feature Columns ({len(feature_cols)}): {feat_path}")

    res_df = pd.DataFrame(results)
    res_df.to_csv(MODEL_DIR / "training_results.csv", index=False)
    res_df.to_csv(Path(__file__).parent / "training_results.csv", index=False)
    print(f"Saved Training Summary:\n{res_df}")


if __name__ == "__main__":
    main()
