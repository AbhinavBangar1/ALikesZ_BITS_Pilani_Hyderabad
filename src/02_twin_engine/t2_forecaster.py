import numpy as np
import pandas as pd


class T2DForecaster:
    """
    Type 2 Diabetes Multi-Horizon Glucose Forecaster.
    Encapsulates dedicated delta regressors for +30m, +60m, and +120m horizons.
    
    Supports:
      - .predict(X, horizon="30min") -> 1D numpy array
      - [horizon].predict(X)         -> dict-like access
      - .predict_all(X)              -> dict of predictions for all 3 horizons
    """
    def __init__(self, models_dict=None):
        self.models = models_dict or {}

    def __getitem__(self, horizon):
        return self.models[horizon]

    def __contains__(self, horizon):
        return horizon in self.models

    def predict(self, X, horizon="30min"):
        if horizon in self.models:
            return self.models[horizon].predict(X)
        raise KeyError(f"Horizon '{horizon}' not found. Available: {list(self.models.keys())}")

    def predict_all(self, X):
        return {
            "30min": self.models["30min"].predict(X),
            "60min": self.models["60min"].predict(X),
            "120min": self.models["120min"].predict(X)
        }
