"""
Realistic Live Wearable & CGM Stream Generator
==============================================
Simulates continuous multi-modal wearable and IoT telemetry for the 15
synthetic patient profiles at 5-minute ticks:

Data streams generated:
  1. CGM glucose (mg/dL) with circadian drift, postprandial curves, and sensor noise
  2. Heart Rate (bpm) with sleep/resting/active zones
  3. Step count & active calories (sedentary vs. walking vs. exercise)
  4. Basal insulin infusion (units/hr matching patient profile)
  5. Meals (carb_input in grams) and bolus injections (units)

Can run in two modes:
  - Batch generation: Pre-generates rolling 24-hour/48-hour continuous histories per patient.
  - Live tick generator: Yields the latest 5-minute tick in real time for websocket / API polling.

Outputs:
  - data/synthetic_cohort/wearable_streams/{patient_id}_stream.csv
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
METADATA_PATH = ROOT / "data" / "synthetic_cohort" / "patients_metadata.json"
OUT_STREAM_DIR = ROOT / "data" / "synthetic_cohort" / "wearable_streams"
OUT_STREAM_DIR.mkdir(parents=True, exist_ok=True)


class WearableStreamSimulator:
    def __init__(self, patient_profile: dict, random_seed: int = 42):
        self.profile = patient_profile
        self.rng = np.random.RandomState(random_seed)

        self.isf = self.profile.get("isf_mg_dl_per_unit", 45)
        self.icr = self.profile.get("icr_grams_per_unit", 10)
        self.basal_rate = self.profile.get("basal_rate_u_hr", 0.8)
        self.risk_tier = self.profile.get("clinical_risk_tier", "Moderate")
        self.hypo_unaware = self.profile.get("hypo_unawareness", False)

        # Baseline starting glucose conditioned on HbA1c
        # Estimated Average Glucose (eAG) formula: 28.7 * A1c - 46.7
        self.eag = 28.7 * self.profile.get("hba1c_pct", 7.5) - 46.7
        self.current_glucose = float(np.clip(self.eag + self.rng.normal(0, 10), 80, 260))

        # Internal active pools for digestion and insulin absorption
        self.active_carbs = 0.0     # remaining grams of carbs digesting
        self.active_insulin = 0.0   # remaining units of rapid insulin active

    def _get_circadian_factor(self, dt: datetime) -> float:
        """Models Dawn Phenomenon (cortisol surge 4 AM - 8 AM)."""
        hour = dt.hour + dt.minute / 60.0
        # Peak around 6:30 AM
        dawn_spike = np.exp(-((hour - 6.5) ** 2) / (2 * 1.5 ** 2)) * 18.0
        # Gentle afternoon dip
        afternoon_dip = -np.exp(-((hour - 15.0) ** 2) / (2 * 2.0 ** 2)) * 8.0
        return dawn_spike + afternoon_dip

    def _sample_activity(self, dt: datetime):
        """Generates realistic steps, heart rate, and calories based on time of day."""
        hour = dt.hour
        # Sleep window (11 PM - 6:30 AM)
        if hour >= 23 or hour < 6.5:
            hr = int(self.rng.normal(56, 3))
            steps = 0
            calories = float(np.round(self.rng.uniform(0.9, 1.2), 2))
        elif 6.5 <= hour < 8.0:
            # Morning commute / routine / workout
            is_active = self.rng.rand() < 0.4
            hr = int(self.rng.normal(110, 12)) if is_active else int(self.rng.normal(78, 5))
            steps = int(self.rng.uniform(180, 450)) if is_active else int(self.rng.uniform(10, 80))
            calories = float(np.round(hr * 0.08, 2))
        elif 8.0 <= hour < 18.0:
            # Work hours (mostly desk with intermittent walking)
            is_walking = self.rng.rand() < 0.25
            hr = int(self.rng.normal(92, 8)) if is_walking else int(self.rng.normal(72, 4))
            steps = int(self.rng.uniform(80, 220)) if is_walking else int(self.rng.uniform(0, 15))
            calories = float(np.round(hr * 0.06, 2))
        elif 18.0 <= hour < 20.5:
            # Evening sports / commute
            is_sports = self.rng.rand() < 0.35
            hr = int(self.rng.normal(125, 14)) if is_sports else int(self.rng.normal(80, 6))
            steps = int(self.rng.uniform(300, 600)) if is_sports else int(self.rng.uniform(30, 120))
            calories = float(np.round(hr * 0.09, 2))
        else:
            # Relaxing night
            hr = int(self.rng.normal(68, 4))
            steps = int(self.rng.uniform(0, 25))
            calories = float(np.round(1.3, 2))

        return max(45, hr), max(0, steps), max(0.5, calories)

    def _sample_meals_and_insulin(self, dt: datetime):
        """Schedules realistic meal carb intakes and corresponding boluses."""
        hour = dt.hour
        minute = dt.minute

        carb_input = 0.0
        bolus_dose = 0.0

        # Breakfast around 08:30 (±15 min)
        if hour == 8 and minute == 30:
            carb_input = float(self.rng.normal(45, 8))
        # Lunch around 13:15 (±15 min)
        elif hour == 13 and minute == 15:
            carb_input = float(self.rng.normal(65, 12))
        # Evening snack around 17:30
        elif hour == 17 and minute == 30 and self.rng.rand() < 0.6:
            carb_input = float(self.rng.normal(20, 5))
        # Dinner around 20:30 (±15 min)
        elif hour == 20 and minute == 30:
            carb_input = float(self.rng.normal(55, 10))

        if carb_input > 0:
            carb_input = max(5.0, np.round(carb_input, 1))
            # Theoretical required bolus = carbs / ICR
            ideal_bolus = carb_input / self.icr

            # Adherence logic: well-controlled boluses accurately; high-risk misses or under-boluses
            if self.risk_tier == "Low":
                bolus_dose = np.round(ideal_bolus + self.rng.normal(0, 0.2), 1)
            elif self.risk_tier in ["Moderate", "High"]:
                # Sometimes under-boluses or delays
                under = self.rng.choice([0.7, 0.85, 1.0], p=[0.25, 0.35, 0.40])
                bolus_dose = np.round(ideal_bolus * under, 1)
            elif self.risk_tier == "Critical":
                # Critical profiles: e.g. Vikram Reddy endurance drop, or adolescent missed bolus
                missed = self.rng.rand() < 0.25
                bolus_dose = 0.0 if missed else np.round(ideal_bolus * 0.8, 1)

            bolus_dose = max(0.0, float(bolus_dose))

        return carb_input, bolus_dose

    def step(self, dt: datetime) -> dict:
        """Advances the patient's physiological state by one 5-minute tick."""
        hr, steps, calories = self._sample_activity(dt)
        carbs, bolus = self._sample_meals_and_insulin(dt)

        # Add newly ingested carbs and bolus to active pools
        self.active_carbs += carbs
        self.active_insulin += bolus

        # Fractional decay per 5-min step (absorption half-life ~45 min carbs, ~90 min insulin)
        carb_absorption_rate = 0.075    # fraction absorbed per 5-min
        insulin_absorption_rate = 0.045 # fraction absorbed per 5-min

        absorbed_carbs = self.active_carbs * carb_absorption_rate
        self.active_carbs -= absorbed_carbs

        absorbed_insulin = self.active_insulin * insulin_absorption_rate
        self.active_insulin -= absorbed_insulin

        # Glycemic excursion calculation:
        # Carbs raise glucose: roughly (absorbed_carbs / ICR) * ISF
        delta_glucose_from_carbs = (absorbed_carbs / self.icr) * self.isf * 0.85
        # Insulin lowers glucose: absorbed_insulin * ISF
        delta_glucose_from_insulin = absorbed_insulin * self.isf
        # Exercise accelerates glucose clearance
        exercise_factor = (steps / 250.0) * (self.isf * 0.04)

        # Basal mismatch drift: small random walk back towards patient's eAG
        drift_towards_baseline = (self.eag - self.current_glucose) * 0.015
        circadian_effect = self._get_circadian_factor(dt) * 0.05
        sensor_noise = self.rng.normal(0, 1.2)

        # Total glucose delta for this 5-min interval
        delta = (
            delta_glucose_from_carbs
            - delta_glucose_from_insulin
            - exercise_factor
            + drift_towards_baseline
            + circadian_effect
            + sensor_noise
        )

        self.current_glucose = float(np.clip(self.current_glucose + delta, 42.0, 395.0))

        # Basal delivery: 5-minute slice of hourly basal
        basal_5min = np.round(self.basal_rate / 12.0, 4)

        return {
            "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "patient_id": self.profile["patient_id"],
            "glucose": np.round(self.current_glucose, 1),
            "calories": calories,
            "heart_rate": hr,
            "steps": steps,
            "basal_rate": basal_5min,
            "bolus_volume_delivered": bolus,
            "carb_input": carbs
        }

    def generate_trajectory(self, start_time: datetime, duration_hours: int = 48) -> pd.DataFrame:
        """Generates continuous historical time series for the patient."""
        total_steps = int((duration_hours * 60) / 5)
        records = []
        current_dt = start_time

        for _ in range(total_steps):
            record = self.step(current_dt)
            records.append(record)
            current_dt += timedelta(minutes=5)

        return pd.DataFrame(records)


def run_batch_simulation():
    print("=" * 60)
    print("Realistic Wearable & CGM Stream Generator")
    print("=" * 60)

    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        cohort = json.load(f)

    start_time = datetime(2026, 10, 12, 0, 0, 0)
    print(f"Generating 48-hour continuous sensor telemetry for {len(cohort)} patients...\n")

    summary_list = []
    for i, profile in enumerate(cohort, start=1):
        pid = profile["patient_id"]
        sim = WearableStreamSimulator(profile, random_seed=100 + i)
        df = sim.generate_trajectory(start_time=start_time, duration_hours=48)

        out_path = OUT_STREAM_DIR / f"{pid}_stream.csv"
        df.to_csv(out_path, index=False)

        mean_g = df["glucose"].mean()
        tir_pct = ((df["glucose"] >= 70) & (df["glucose"] <= 180)).mean() * 100
        hypo_pct = (df["glucose"] < 70).mean() * 100
        hyper_pct = (df["glucose"] > 180).mean() * 100

        print(f"[{i:02d}/15] {pid} ({profile['name']}): "
              f"Mean {mean_g:.1f} mg/dL | TIR: {tir_pct:.1f}% | "
              f"Hypo: {hypo_pct:.1f}% | Hyper: {hyper_pct:.1f}% -> {out_path.name}")

        summary_list.append({
            "patient_id": pid,
            "name": profile["name"],
            "tier": profile["clinical_risk_tier"],
            "mean_glucose": round(mean_g, 1),
            "time_in_range_pct": round(tir_pct, 1),
            "time_below_70_pct": round(hypo_pct, 1),
            "time_above_180_pct": round(hyper_pct, 1),
            "total_records": len(df)
        })

    summary_df = pd.DataFrame(summary_list)
    summary_df.to_csv(OUT_STREAM_DIR / "_cohort_wearable_summary.csv", index=False)
    print(f"\nCohort stream simulation complete. Summary saved to {OUT_STREAM_DIR / '_cohort_wearable_summary.csv'}")


if __name__ == "__main__":
    run_batch_simulation()
