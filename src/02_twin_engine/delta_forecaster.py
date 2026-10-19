import numpy as np
import pandas as pd


class DeltaForecaster:
    """
    Physiological Residual / Delta Forecaster Wrapper.
    
    Trained on metabolic change delta = G_{t+h} - G_t.
    At inference time, seamlessly reconstructs absolute plasma glucose:
        G_hat_{t+h} = G_t + delta_hat_{t+h}
    clamped to clinically realistic physiological bounds [40, 400] mg/dL.
    
    Exposes standard scikit-learn / LightGBM .predict() interface for 100%
    backward compatibility with twin_core.py, API servers, and evaluation suites.
    """
    def __init__(self, base_model, glucose_col="glucose"):
        self.base_model = base_model
        self.glucose_col = glucose_col

    def predict(self, X):
        if isinstance(X, pd.DataFrame):
            if self.glucose_col in X.columns:
                curr_g = X[self.glucose_col].values.astype(float)
            else:
                curr_g = X.iloc[:, 0].values.astype(float)
        elif hasattr(X, "ndim") and X.ndim == 2:
            curr_g = X[:, 0].astype(float)
        else:
            curr_g = np.array([float(X)])

        delta = self.base_model.predict(X)
        pred = curr_g + delta
        return np.clip(pred, 40.0, 400.0)

    @property
    def feature_importances_(self):
        if hasattr(self.base_model, "feature_importances_"):
            return self.base_model.feature_importances_
        return None

    @property
    def best_iteration_(self):
        if hasattr(self.base_model, "best_iteration_"):
            return self.base_model.best_iteration_
        return None
