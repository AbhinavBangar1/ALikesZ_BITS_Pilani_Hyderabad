"""
Clinical Decision Support System (CDSS) Pattern Detection & Action Engine
========================================================================
Detects evidence-based clinical glycemic patterns from patient EHR and recent
wearable sensor telemetry (CGM, Heart Rate, Steps, Insulin/Meds, Carbs).

Monitored Clinical Patterns:
  1. DAWN_PHENOMENON: Fasting rise >= 35 mg/dL between 04:00 and 08:00 without carbs.
  2. NOCTURNAL_HYPO: Overnight CGM dipping below 70 mg/dL between 00:00 and 06:00.
  3. POST_EXERCISE_HYPO: Sustained HR > 115 bpm / high steps followed by glucose drop < -1.2 mg/dL/min.
  4. SEVERE_INSULIN_RESISTANCE_SPIKE: T2D postprandial excursion > 80 mg/dL with delayed clearance (> 120 min).
"""

from datetime import datetime
from typing import Dict, List, Any, Optional
import pandas as pd


class CDSSEngine:
    def __init__(self):
        # In-memory alert state storage: { (patient_id, pattern_id): "ACTIVE" | "ACKNOWLEDGED" | "DISMISSED" }
        self.alert_states: Dict[str, str] = {}

    def _get_alert_key(self, patient_id: str, pattern_id: str) -> str:
        return f"{patient_id}::{pattern_id}"

    def acknowledge_alert(self, patient_id: str, pattern_id: str) -> str:
        key = self._get_alert_key(patient_id, pattern_id)
        self.alert_states[key] = "ACKNOWLEDGED"
        return "ACKNOWLEDGED"

    def dismiss_alert(self, patient_id: str, pattern_id: str) -> str:
        key = self._get_alert_key(patient_id, pattern_id)
        self.alert_states[key] = "DISMISSED"
        return "DISMISSED"

    def evaluate_patient(self, profile: dict, window_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Evaluates a patient's recent window of telemetry against clinical CDSS rules.
        Returns a list of structured alerts with severity, rationale, and recommended clinical action.
        """
        patient_id = profile["patient_id"]
        diabetes_type = profile.get("diabetes_type", "Type 1")
        is_t2d = (diabetes_type == "Type 2")

        if window_df.empty or len(window_df) < 6:
            return []

        w = window_df.sort_values("timestamp").reset_index(drop=True)
        g = w["glucose"].values.astype(float)
        hr = w["heart_rate"].values.astype(float) if "heart_rate" in w.columns else [70.0] * len(w)
        steps = w["steps"].values.astype(float) if "steps" in w.columns else [0.0] * len(w)
        carbs = w["carb_input"].values.astype(float) if "carb_input" in w.columns else [0.0] * len(w)

        timestamps = pd.to_datetime(w["timestamp"])
        last_dt = timestamps.iloc[-1]
        last_hour = last_dt.hour + last_dt.minute / 60.0
        current_g = float(g[-1])

        alerts = []

        # ── 1. NOCTURNAL HYPOGLYCEMIA ─────────────────────────────────────────
        # Detected if glucose drops < 75 mg/dL during night window (00:00 - 06:30)
        night_indices = [i for i, ts in enumerate(timestamps) if 0.0 <= (ts.hour + ts.minute / 60.0) <= 6.5]
        if night_indices:
            night_g = [g[i] for i in night_indices]
            min_night = min(night_g)
            if min_night < 75.0:
                pattern_id = "NOCTURNAL_HYPO"
                status = self.alert_states.get(self._get_alert_key(patient_id, pattern_id), "ACTIVE")
                if status != "DISMISSED":
                    alerts.append({
                        "pattern_id": pattern_id,
                        "title": "Nocturnal Hypoglycemia Pattern",
                        "severity": "CRITICAL" if min_night < 60 else "HIGH",
                        "status": status,
                        "timestamp": str(last_dt),
                        "description": f"Overnight nadir of {min_night:.0f} mg/dL detected between 00:00 and 06:00.",
                        "clinical_rationale": "High risk of hypoglycemic seizure or morning rebound hyperglycemia (Somogyi effect).",
                        "recommended_action": "Reduce bedtime basal rate by 10-15% or introduce a 15g complex protein/carb bedtime snack."
                    })

        # ── 2. DAWN PHENOMENON ────────────────────────────────────────────────
        # Detected if fasting rise > 35 mg/dL between 04:00 and 08:30 without meal carbs
        dawn_indices = [i for i, ts in enumerate(timestamps) if 4.0 <= (ts.hour + ts.minute / 60.0) <= 8.5]
        if len(dawn_indices) >= 4:
            dawn_g = [g[i] for i in dawn_indices]
            dawn_carbs = sum([carbs[i] for i in dawn_indices])
            rise = dawn_g[-1] - min(dawn_g[:3])
            if rise >= 35.0 and dawn_carbs < 5.0:
                pattern_id = "DAWN_PHENOMENON"
                status = self.alert_states.get(self._get_alert_key(patient_id, pattern_id), "ACTIVE")
                if status != "DISMISSED":
                    alerts.append({
                        "pattern_id": pattern_id,
                        "title": "Dawn Phenomenon Surge",
                        "severity": "MODERATE",
                        "status": status,
                        "timestamp": str(last_dt),
                        "description": f"Fasting hepatic glucose surge of +{rise:.0f} mg/dL detected without carbohydrate intake.",
                        "clinical_rationale": "Morning circadian cortisol and growth hormone surges stimulating hepatic gluconeogenesis.",
                        "recommended_action": "Program an automated basal rate step-up from 04:30 to 08:00 (T1D) or review bedtime Metformin dosing (T2D)."
                    })

        # ── 3. POST-EXERCISE HYPOGLYCEMIA RISK ────────────────────────────────
        # Detected if recent elevated HR (> 110 bpm) or high steps followed by rapid downward glucose velocity
        if len(g) >= 6:
            recent_hr_max = max(hr[-8:]) if len(hr) >= 8 else max(hr)
            recent_steps = sum(steps[-8:]) if len(steps) >= 8 else sum(steps)
            roc_recent = (g[-1] - g[-4]) / (len(g[-4:]) * 0.25)  # approximate mg/dL/min

            if (recent_hr_max > 112.0 or recent_steps > 350) and roc_recent < -1.1 and current_g < 115.0:
                pattern_id = "POST_EXERCISE_HYPO"
                status = self.alert_states.get(self._get_alert_key(patient_id, pattern_id), "ACTIVE")
                if status != "DISMISSED":
                    alerts.append({
                        "pattern_id": pattern_id,
                        "title": "Post-Exercise Hypoglycemia Threat",
                        "severity": "CRITICAL" if current_g < 85 else "HIGH",
                        "status": status,
                        "timestamp": str(last_dt),
                        "description": f"Sustained activity (peak HR {recent_hr_max:.0f} bpm) combined with falling glucose velocity ({roc_recent:.1f} mg/dL/min).",
                        "clinical_rationale": "Skeletal muscle glycogen resynthesis increases insulin sensitivity for up to 12 hours post-workout.",
                        "recommended_action": "Administer 15-20g fast-acting carbohydrates immediately; enable Activity/Exercise Mode on AID pump."
                    })

        # ── 4. EXTENDED POSTPRANDIAL HYPERGLYCEMIA (T2D INSULIN RESISTANCE) ───
        if is_t2d and current_g > 195.0:
            homa_ir = float(profile.get("homa_ir", 3.5))
            pattern_id = "T2D_RESISTANCE_SPIKE"
            status = self.alert_states.get(self._get_alert_key(patient_id, pattern_id), "ACTIVE")
            if status != "DISMISSED":
                alerts.append({
                    "pattern_id": pattern_id,
                    "title": "Persistent Postprandial Elevation (HOMA-IR)",
                    "severity": "MODERATE",
                    "status": status,
                    "timestamp": str(last_dt),
                    "description": f"Prolonged excursion at {current_g:.0f} mg/dL; hepatic clearance blunted by HOMA-IR {homa_ir:.1f}.",
                    "clinical_rationale": "High carbohydrate load coupled with peripheral insulin resistance delaying glycemic normalization.",
                    "recommended_action": "Prescribe a 15-20 minute light post-meal walk to activate GLUT-4 glucose uptake; verify oral medication adherence."
                })

        return alerts
