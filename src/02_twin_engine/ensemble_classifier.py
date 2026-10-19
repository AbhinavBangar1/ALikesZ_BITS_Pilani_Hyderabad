import numpy as np
import pandas as pd


class EnsembleClassifier:
    """
    Physiological Adverse Event Multi-Model Ensemble Classifier.
    Supports both:
      1. Standard multi-model linear probability averaging (LightGBM, CatBoost, XGBoost)
      2. Physiological Dual-Specialist architecture (Hypoglycemia + Hyperglycemia specialists
         fused via smooth L6-norm non-linear risk union)
    
    Exposes standard .predict_proba(X) and .predict(X) for 100% backward
    compatibility with twin_core.py, API endpoints, and evaluation suites.
    """
    def __init__(self, models=None, weights=None, model_hypo=None, model_hyper=None, w_hypo=0.8, p_norm=6):
        self.model_hypo = model_hypo
        self.model_hyper = model_hyper
        self.w_hypo = float(w_hypo)
        self.p_norm = int(p_norm)
        
        if models is not None:
            if isinstance(models, dict):
                self.models = list(models.values())
            elif isinstance(models, (list, tuple)):
                self.models = list(models)
            else:
                self.models = [models]
            n = len(self.models)
            if weights is None:
                self.weights = [1.0 / n] * n
            else:
                total = sum(weights)
                self.weights = [w / total for w in weights]
        else:
            self.models = None
            self.weights = None

    def predict_proba(self, X):
        if hasattr(X, "values"):
            X_mat = X
        else:
            X_mat = X
        
        # Dual-specialist physiological L_p norm fusion
        if self.model_hypo is not None and self.model_hyper is not None:
            p_hypo = self.model_hypo.predict_proba(X_mat)[:, 1]
            p_hyper = self.model_hyper.predict_proba(X_mat)[:, 1]
            p_comb = ((self.w_hypo * p_hypo) ** self.p_norm + p_hyper ** self.p_norm) ** (1.0 / self.p_norm)
            p_comb = np.clip(p_comb, 0.0, 1.0)
            return np.column_stack([1.0 - p_comb, p_comb])
        
        # Standard weighted probability blend
        prob = np.zeros((len(X), 2), dtype=float)
        for m, w in zip(self.models, self.weights):
            p = m.predict_proba(X_mat)
            prob += w * p
        return prob

    def predict(self, X, threshold=0.5):
        proba = self.predict_proba(X)[:, 1]
        return (proba >= threshold).astype(int)

    @property
    def classes_(self):
        return np.array([0, 1])

    @property
    def feature_importances_(self):
        if self.models and hasattr(self.models[0], "feature_importances_"):
            return self.models[0].feature_importances_
        if self.model_hypo and hasattr(self.model_hypo, "feature_importances_"):
            return self.model_hypo.feature_importances_
        return None
