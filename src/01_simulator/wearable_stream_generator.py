"""
Realistic Live Wearable & CGM Stream Generator (Continuous Cardiorespiratory + T1DMSIM Physiology)
===================================================================================================
Simulates continuous multi-modal wearable and IoT telemetry for the 15 synthetic patient profiles:
  - 8 Type 1 Diabetes (T1D-IN-001 .. 008)
  - 7 Type 2 Diabetes (T2D-IN-001 .. 007)

Key Modeling Components:
  1. Continuous Cardiorespiratory Engine (1-Second Pulse Stream):
     - Duration-persisted activity bouts (Sleep, Sedentary, Light Walk, Moderate Exercise)
     - Asymmetric cardiorespiratory kinetics (fast vagal withdrawal, slow exponential recovery)
     - Autonomic Micro-Variability (HRV): Respiratory Sinus Arrhythmia (RSA 0.25 Hz) + Mayer waves (0.1 Hz)
     - Autonomic Neuropathy (CAN) dampening for patients with hypo-unawareness or high HbA1c
     - Counter-regulatory adrenergic sinus tachycardia during hypoglycemia (< 70 mg/dL)
  2. T1DMSIM-Inspired CGM Physiology:
     - Hepatic Glucose Output (HGO) with Hill-function insulin suppression
     - Delayed post-prandial hepatic glycogen rebound (3.5 - 5.5h post dinner)
     - Renal excretion threshold (> 180 mg/dL for T1D, lowered for SGLT2i in T2D)
     - Interstitial sensor diffusion lag (8 - 12 min filter between plasma and subcutaneous sensor)
  3. Dedicated Type 2 Kinetics:
     - HOMA-IR resistance dampening, residual beta-cell secretion, GLUT-4 muscle exercise uptake
     - Oral antidiabetic therapy (Metformin, SGLT2i, DPP-4i)
  4. Dual-Rate Telemetry:
     - Synchronized 15-second frames for multi-modal dashboard (CGM, HR, Steps, Calories, Meds)
     - Continuous 1-second pulse stream buffer for real-time live pulse ticker
"""

import json
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
METADATA_PATH = ROOT / "data" / "synthetic_cohort" / "patients_metadata.json"
OUT_STREAM_DIR = ROOT / "data" / "synthetic_cohort" / "wearable_streams"
OUT_STREAM_DIR.mkdir(parents=True, exist_ok=True)


class WearableStreamSimulator:
    def __init__(self, patient_profile: dict, random_seed: int = 42):
        self.profile = patient_profile
        self.patient_id = patient_profile["patient_id"]
        self.rng = np.random.RandomState(random_seed)

        self.diabetes_type = self.profile.get("diabetes_type", "Type 1")
        self.is_t2d = (self.diabetes_type == "Type 2")
        self.hba1c = float(self.profile.get("hba1c_pct", 7.5))
        self.age = float(self.profile.get("age", 38))
        self.risk_tier = self.profile.get("clinical_risk_tier", "Moderate")
        self.hypo_unaware = self.profile.get("hypo_unawareness", False)

        if self.is_t2d:
            self.homa_ir = float(self.profile.get("homa_ir", 3.5))
            self.homa_beta = float(self.profile.get("homa_beta", 50.0))
            self.oral_medications = self.profile.get("oral_medications", "Metformin")
            self.isf = 45.0
            self.icr = 10.0
            self.basal_rate = float(self.profile.get("basal_rate_u_hr", 0.0))
        else:
            self.isf = float(self.profile.get("isf_mg_dl_per_unit", 45))
            self.icr = float(self.profile.get("icr_grams_per_unit", 10))
            self.basal_rate = float(self.profile.get("basal_rate_u_hr", 0.8))

        # Baseline starting glucose conditioned on HbA1c
        # eAG = 28.7 * A1c - 46.7
        self.eag = 28.7 * self.hba1c - 46.7
        self.plasma_glucose = float(np.clip(self.eag + self.rng.normal(0, 8), 85, 250))
        self.sensor_glucose = self.plasma_glucose  # lagged interstitial CGM

        # Active physiological pools
        self.active_carbs = 0.0
        self.active_insulin = 0.0
        self.ema_insulin = 0.5  # for Hill suppression of hepatic glucose output
        self.post_dinner_rebound_ticks = 0
        self.last_timestamp: Optional[datetime] = None

        # ── Cardiorespiratory & Autonomic State ──
        # Diabetic cardiac autonomic neuropathy (CAN) elevates resting HR and dampens HRV
        can_offset = 6.0 if (self.hypo_unaware or self.hba1c > 8.5) else 0.0
        self.resting_hr = float(np.clip(62.0 + (self.age - 30) * 0.12 + can_offset + self.rng.normal(0, 2.0), 55.0, 84.0))
        self.current_hr = self.resting_hr

        self.activity_state = "SEDENTARY"  # 'SLEEP', 'SEDENTARY', 'LIGHT_WALK', 'MODERATE_EXERCISE'
        self.activity_remaining_seconds = 0
        self.digestion_remaining_seconds = 0
        self.second_counter = int(self.rng.uniform(0, 1000))

        # Rolling circular buffer of last 600 continuous 1-second pulse readings
        self.hr_1s_buffer = deque(maxlen=600)

    def _get_circadian_factor(self, dt: datetime) -> float:
        """Models Dawn Phenomenon (cortisol surge 4 AM - 8 AM)."""
        hour = dt.hour + dt.minute / 60.0
        dawn_spike = np.exp(-((hour - 6.5) ** 2) / (2 * 1.5 ** 2)) * 18.0
        afternoon_dip = -np.exp(-((hour - 15.0) ** 2) / (2 * 2.0 ** 2)) * 8.0
        return dawn_spike + afternoon_dip

    def _update_activity_state(self, dt: datetime, extra_walk_min: float = 0.0):
        """
        Manages duration-persisted activity bouts (Semi-Markov State Machine).
        Eliminates erratic per-tick dice rolls.
        """
        hour = dt.hour + dt.minute / 60.0

        if extra_walk_min > 0:
            self.activity_state = "MODERATE_EXERCISE"
            self.activity_remaining_seconds = int(extra_walk_min * 60)
            return

        if self.activity_remaining_seconds > 0:
            self.activity_remaining_seconds -= 15
            return

        # Schedule or transition state based on diurnal pattern
        if hour >= 23.0 or hour < 6.5:
            self.activity_state = "SLEEP"
            mins_left = (6.5 - hour if hour < 6.5 else 24.0 - hour + 6.5) * 60
            self.activity_remaining_seconds = max(60, int(mins_left * 60))
        elif 6.5 <= hour < 8.5:
            # Morning wake & commute: 40% chance of 15-30 min walk
            if self.rng.rand() < 0.40:
                self.activity_state = "LIGHT_WALK"
                self.activity_remaining_seconds = int(self.rng.uniform(15, 30) * 60)
            else:
                self.activity_state = "SEDENTARY"
                self.activity_remaining_seconds = int(self.rng.uniform(20, 45) * 60)
        elif 8.5 <= hour < 18.0:
            # Daytime work: mostly sedentary with occasional 5-12 min strolls
            if self.rng.rand() < 0.15:
                self.activity_state = "LIGHT_WALK"
                self.activity_remaining_seconds = int(self.rng.uniform(5, 12) * 60)
            else:
                self.activity_state = "SEDENTARY"
                self.activity_remaining_seconds = int(self.rng.uniform(30, 75) * 60)
        elif 18.0 <= hour < 20.5:
            # Evening workout / sports window
            roll = self.rng.rand()
            if roll < 0.35:
                self.activity_state = "MODERATE_EXERCISE"
                self.activity_remaining_seconds = int(self.rng.uniform(25, 45) * 60)
            elif roll < 0.65:
                self.activity_state = "LIGHT_WALK"
                self.activity_remaining_seconds = int(self.rng.uniform(15, 30) * 60)
            else:
                self.activity_state = "SEDENTARY"
                self.activity_remaining_seconds = int(self.rng.uniform(30, 60) * 60)
        else:
            # 20.5 to 23.0: Evening winding down
            if self.rng.rand() < 0.15:
                self.activity_state = "LIGHT_WALK"
                self.activity_remaining_seconds = int(self.rng.uniform(5, 15) * 60)
            else:
                self.activity_state = "SEDENTARY"
                self.activity_remaining_seconds = int(self.rng.uniform(30, 60) * 60)

    def _step_1second(self, dt_sec: datetime) -> dict:
        """
        Advances the cardiorespiratory model by 1 second.
        Implements asymmetric cardiorespiratory lag, autonomic RSA & Mayer waves,
        and counter-regulatory hypoglycemia surges.
        """
        self.second_counter += 1
        t = self.second_counter

        # 1. Base Target HR for current activity state
        if self.activity_state == "SLEEP":
            base_target = self.resting_hr - 8.0
            step_rate = 0.0
        elif self.activity_state == "SEDENTARY":
            base_target = self.resting_hr
            step_rate = 0.05 if self.rng.rand() < 0.02 else 0.0
        elif self.activity_state == "LIGHT_WALK":
            base_target = self.resting_hr + 28.0
            step_rate = self.rng.uniform(1.0, 1.4)  # ~60-84 steps/min
        elif self.activity_state == "MODERATE_EXERCISE":
            base_target = self.resting_hr + 60.0
            step_rate = self.rng.uniform(2.0, 2.7)  # ~120-160 steps/min
        else:
            base_target = self.resting_hr
            step_rate = 0.0

        # 2. Metabolic / Splanchnic Circulation (Post-Prandial digestion)
        if self.digestion_remaining_seconds > 0:
            self.digestion_remaining_seconds -= 1
            base_target += 5.0

        # 3. Adrenergic surge in hypoglycemia (Counter-regulatory sympathetic excitation)
        if self.plasma_glucose < 70.0:
            hypo_deficit = 70.0 - self.plasma_glucose
            if self.hypo_unaware:
                # Impaired autonomic response in hypoglycemia unawareness
                hypo_tachycardia = min(6.0, hypo_deficit * 0.18)
            else:
                # Robust epinephrine discharge
                hypo_tachycardia = min(28.0, hypo_deficit * 0.75)
            base_target += hypo_tachycardia

        # 4. Asymmetric cardiorespiratory kinetics (fast onset, slow recovery)
        if base_target > self.current_hr:
            # Parasympathetic withdrawal: tau ~ 12 seconds
            alpha = 1.0 / 12.0
        else:
            # Vagal reactivation: tau ~ 90-120 seconds
            alpha = 1.0 / 100.0

        self.current_hr += alpha * (base_target - self.current_hr)

        # 5. Autonomic Micro-Variability (HRV)
        # Respiratory Sinus Arrhythmia (RSA, high-frequency vagal oscillation ~ 0.25 Hz / period 4s)
        if self.hypo_unaware or self.hba1c > 8.5:
            rsa_amp = 1.2  # dampened by diabetic autonomic neuropathy
        elif self.activity_state == "MODERATE_EXERCISE":
            rsa_amp = 1.0
        else:
            rsa_amp = 3.6

        delta_rsa = rsa_amp * np.cos(2.0 * np.pi * 0.25 * t)

        # Mayer waves (Low-frequency sympathetic oscillation ~ 0.1 Hz / period 10s)
        mayer_amp = 1.8 if self.activity_state != "SLEEP" else 0.8
        delta_mayer = mayer_amp * np.sin(2.0 * np.pi * 0.10 * t)

        # Filtered physiological pink noise
        pink_noise = float(self.rng.normal(0, 0.35))

        inst_hr = float(np.clip(self.current_hr + delta_rsa + delta_mayer + pink_noise, 42.0, 185.0))
        rr_interval_ms = float(np.round(60000.0 / inst_hr, 1))

        sec_record = {
            "timestamp": dt_sec.strftime("%Y-%m-%d %H:%M:%S"),
            "heart_rate": int(np.round(inst_hr)),
            "rr_ms": rr_interval_ms,
            "activity_state": self.activity_state,
            "steps": int(np.round(step_rate))
        }

        self.hr_1s_buffer.append(sec_record)
        return sec_record

    def _sample_meals_and_insulin(self, dt: datetime, manual_carbs: float = 0.0, manual_bolus: float = 0.0):
        """Schedules realistic meals or manual interventions."""
        if manual_carbs > 0 or manual_bolus > 0:
            return float(manual_carbs), float(manual_bolus)

        if dt.second != 0:
            return 0.0, 0.0

        hour = dt.hour
        minute = dt.minute
        carb_input = 0.0
        bolus_dose = 0.0

        pid_num = int(self.patient_id.split("-")[-1]) if "-" in self.patient_id else 1
        b_min = 15 + ((pid_num * 5) % 30)
        l_min = 10 + ((pid_num * 5) % 35)
        s_min = 30
        d_min = 15 + ((pid_num * 5) % 35)

        if hour == 8 and minute == b_min:
            carb_input = float(self.rng.normal(48, 8))
        elif hour == 13 and minute == l_min:
            carb_input = float(self.rng.normal(68, 12))
        elif hour == 17 and minute == s_min and self.rng.rand() < 0.65:
            carb_input = float(self.rng.normal(25, 6))
        elif hour == 20 and minute == d_min:
            carb_input = float(self.rng.normal(62, 10))

        if carb_input > 0:
            carb_input = max(8.0, np.round(carb_input, 1))

            if self.is_t2d:
                bolus_dose = 0.0
            else:
                ideal_bolus = carb_input / self.icr
                if self.risk_tier == "Low":
                    bolus_dose = np.round(ideal_bolus + self.rng.normal(0, 0.15), 1)
                elif self.risk_tier == "Moderate":
                    factor = self.rng.choice([0.85, 0.95, 1.0, 1.05], p=[0.25, 0.35, 0.30, 0.10])
                    bolus_dose = np.round(ideal_bolus * factor, 1)
                elif self.risk_tier == "High":
                    factor = self.rng.choice([0.65, 0.8, 1.0, 1.25], p=[0.35, 0.35, 0.20, 0.10])
                    bolus_dose = np.round(ideal_bolus * factor, 1)
                elif self.risk_tier == "Critical":
                    factor = self.rng.choice([0.0, 0.6, 0.75, 1.0, 1.35], p=[0.20, 0.30, 0.25, 0.15, 0.10])
                    bolus_dose = np.round(ideal_bolus * factor, 1)

                bolus_dose = max(0.0, float(bolus_dose))

        return carb_input, bolus_dose

    def step(self, dt: datetime, carbs_g: float = 0.0, bolus_u: float = 0.0, walk_min: float = 0.0) -> dict:
        """
        Advances the patient's multi-modal state by one 15-second tick.
        Simulates 15 continuous 1-second cardiorespiratory sub-steps,
        applies T1DMSIM HGO Hill-suppression, renal threshold, and sensor lag.
        """
        self.last_timestamp = dt
        self._update_activity_state(dt, extra_walk_min=walk_min)

        # 1. Execute 15 continuous 1-second cardiorespiratory sub-steps
        total_15s_steps = 0
        last_sec_record = None
        for s in range(14, -1, -1):
            dt_s = dt - timedelta(seconds=s)
            sec_rec = self._step_1second(dt_s)
            total_15s_steps += sec_rec["steps"]
            last_sec_record = sec_rec

        inst_hr = last_sec_record["heart_rate"] if last_sec_record else int(round(self.current_hr))
        calories = float(np.round(max(0.02, (inst_hr * 0.0035 + total_15s_steps * 0.01)), 3))

        # 2. Meal and insulin scheduling
        carbs, bolus = self._sample_meals_and_insulin(dt, manual_carbs=carbs_g, manual_bolus=bolus_u)
        if carbs > 0:
            self.active_carbs += carbs
            # Trigger 60 min of post-prandial splanchnic circulatory elevation
            self.digestion_remaining_seconds = 3600
            # If dinner (evening meal > 45g), schedule delayed hepatic glycogen rebound 4h later
            if dt.hour >= 19 and carbs >= 45.0:
                self.post_dinner_rebound_ticks = 4 * 240  # 4 hours = 960 ticks

        if bolus > 0:
            self.active_insulin += bolus

        # 3. Update EMA of active plasma insulin (for T1DMSIM Hill suppression)
        self.ema_insulin += 0.015 * (self.active_insulin - self.ema_insulin)

        if self.is_t2d:
            # ── TYPE 2 DIABETES KINETICS ───────────────────────────────────────
            carb_absorption_rate = 0.0028
            absorbed_carbs = self.active_carbs * carb_absorption_rate
            self.active_carbs -= absorbed_carbs

            insulin_resistance_mult = max(1.0, self.homa_ir / 2.5)
            beta_function_ratio = max(0.2, self.homa_beta / 50.0)

            delta_glucose_from_carbs = absorbed_carbs * (0.36 * insulin_resistance_mult)
            endogenous_clearance = max(0.0, (self.plasma_glucose - self.eag)) * (0.0016 * beta_function_ratio / insulin_resistance_mult)
            exercise_factor = (total_15s_steps / 15.0) * 0.055

            # Renal clearance: SGLT2i lowers renal glycosuria threshold to 130 mg/dL
            renal_threshold = 130.0 if "SGLT2" in self.oral_medications else 180.0
            renal_clearance = max(0.0, (self.plasma_glucose - renal_threshold)) * 0.0015

            drift_towards_baseline = (self.eag - self.plasma_glucose) * 0.0006
            circadian_effect = self._get_circadian_factor(dt) * 0.0025

            delta_plasma = (
                delta_glucose_from_carbs
                - endogenous_clearance
                - exercise_factor
                - renal_clearance
                + drift_towards_baseline
                + circadian_effect
            )
        else:
            # ── TYPE 1 DIABETES KINETICS (T1DMSIM HGO & Renal Clearance) ──────
            carb_absorption_rate = 0.0039
            insulin_absorption_rate = 0.0023

            absorbed_carbs = self.active_carbs * carb_absorption_rate
            self.active_carbs -= absorbed_carbs

            absorbed_insulin = self.active_insulin * insulin_absorption_rate
            self.active_insulin -= absorbed_insulin

            delta_glucose_from_carbs = (absorbed_carbs / self.icr) * self.isf * 0.90
            delta_glucose_from_insulin = absorbed_insulin * self.isf
            exercise_factor = (total_15s_steps / 20.0) * (self.isf * 0.002)

            # T1DMSIM Hepatic Glucose Output (HGO) with Hill-function insulin suppression
            # Base HGO ~ 0.40 mg/dL per 15s; throttled down as plasma insulin rises
            hgo_baseline = 0.40
            hgo_suppression = 1.0 / (1.0 + (max(0.0, self.ema_insulin) / 1.1) ** 2)
            hgo_flux = hgo_baseline * hgo_suppression

            # T1DMSIM Post-Dinner Delayed Hepatic Glycogen Rebound
            rebound_flux = 0.0
            if self.post_dinner_rebound_ticks > 0:
                self.post_dinner_rebound_ticks -= 1
                if self.post_dinner_rebound_ticks < 120:  # active during 30-min window
                    rebound_flux = 0.16

            # T1DMSIM Renal Excretion Threshold (> 180 mg/dL)
            renal_clearance = max(0.0, (self.plasma_glucose - 180.0)) * 0.0022

            # Counter-regulatory Glucagon response in hypoglycemia (< 70 mg/dL)
            glucagon_defense = max(0.0, (70.0 - self.plasma_glucose)) * 0.0016

            drift_towards_baseline = (self.eag - self.plasma_glucose) * 0.0006
            circadian_effect = self._get_circadian_factor(dt) * 0.0025

            delta_plasma = (
                delta_glucose_from_carbs
                - delta_glucose_from_insulin
                - exercise_factor
                + hgo_flux
                + rebound_flux
                - renal_clearance
                + glucagon_defense
                + drift_towards_baseline
                + circadian_effect
            )

        self.plasma_glucose = float(np.clip(self.plasma_glucose + delta_plasma, 40.0, 395.0))

        # 4. Interstitial CGM Sensor Lag (8 - 12 min first-order diffusion filter)
        # alpha_sensor = 1 / 40 ticks (~10 minutes)
        alpha_sensor = 0.025
        sensor_noise = self.rng.normal(0, 0.20)
        self.sensor_glucose += alpha_sensor * (self.plasma_glucose - self.sensor_glucose) + sensor_noise
        self.sensor_glucose = float(np.clip(self.sensor_glucose, 40.0, 400.0))

        basal_15sec = np.round(self.basal_rate / 240.0, 5) if self.basal_rate > 0 else 0.0

        return {
            "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "patient_id": self.profile["patient_id"],
            "glucose": np.round(self.sensor_glucose, 1),
            "calories": calories,
            "heart_rate": inst_hr,
            "steps": total_15s_steps,
            "basal_rate": basal_15sec,
            "bolus_volume_delivered": bolus,
            "carb_input": carbs
        }

    def generate_trajectory(self, start_time: datetime, duration_hours: int = 24) -> pd.DataFrame:
        """Generates continuous historical 15-second time series for the patient."""
        total_steps = int((duration_hours * 3600) / 15)  # 24h = 5,760 steps
        records = []
        current_dt = start_time

        for _ in range(total_steps):
            record = self.step(current_dt)
            records.append(record)
            current_dt += timedelta(seconds=15)

        return pd.DataFrame(records)


# ── Live Cohort Stream Manager ───────────────────────────────────────────────
class CohortLiveStreamManager:
    """Manages active live in-memory simulators for all 15 patients at 15-second ticks."""
    def __init__(self):
        self.simulators: Dict[str, WearableStreamSimulator] = {}
        self._load_cohort()

    def _load_cohort(self):
        if not METADATA_PATH.exists():
            return
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            cohort = json.load(f)

        for i, profile in enumerate(cohort, start=1):
            pid = profile["patient_id"]
            sim = WearableStreamSimulator(profile, random_seed=200 + i)

            # Check if an existing stream file exists to seed state
            stream_file = OUT_STREAM_DIR / f"{pid}_stream.csv"
            if stream_file.exists():
                try:
                    df = pd.read_csv(stream_file)
                    if len(df) > 0:
                        last_row = df.iloc[-1]
                        sim.sensor_glucose = float(last_row["glucose"])
                        sim.plasma_glucose = sim.sensor_glucose
                        sim.current_hr = float(last_row.get("heart_rate", 70.0))
                        sim.last_timestamp = datetime.strptime(str(last_row["timestamp"]), "%Y-%m-%d %H:%M:%S")

                        # Populate initial 1-second pulse buffer
                        recent_hr = sim.current_hr
                        now = sim.last_timestamp or datetime.now()
                        for s in range(60, 0, -1):
                            t_sec = now - timedelta(seconds=s)
                            sim.hr_1s_buffer.append({
                                "timestamp": t_sec.strftime("%Y-%m-%d %H:%M:%S"),
                                "heart_rate": int(round(recent_hr)),
                                "rr_ms": round(60000.0 / max(40, recent_hr), 1),
                                "activity_state": "SEDENTARY",
                                "steps": 0
                            })
                except Exception:
                    pass

            self.simulators[pid] = sim

    def get_patient_live_hr(self, patient_id: str, seconds: int = 60) -> List[dict]:
        """Returns the continuous 1-second pulse stream for live telemetry view."""
        if patient_id not in self.simulators:
            raise KeyError(f"Patient {patient_id} not found in simulator cohort.")
        sim = self.simulators[patient_id]
        buf = list(sim.hr_1s_buffer)
        if len(buf) == 0:
            now = datetime.now()
            res = []
            for s in range(seconds, 0, -1):
                ts = (now - timedelta(seconds=s)).strftime("%Y-%m-%d %H:%M:%S")
                res.append({
                    "timestamp": ts,
                    "heart_rate": int(round(sim.current_hr)),
                    "rr_ms": round(60000.0 / max(40, sim.current_hr), 1),
                    "activity_state": sim.activity_state,
                    "steps": 0
                })
            return res
        return buf[-seconds:]

    def tick_patient(self, patient_id: str, carbs_g: float = 0.0, bolus_u: float = 0.0, walk_min: float = 0.0) -> dict:
        """Advances a specific patient by 15 seconds and appends the tick to the CSV stream."""
        if patient_id not in self.simulators:
            raise KeyError(f"Patient {patient_id} not found in simulator cohort.")

        sim = self.simulators[patient_id]
        if sim.last_timestamp:
            next_dt = sim.last_timestamp + timedelta(seconds=15)
        else:
            next_dt = datetime.now()

        record = sim.step(next_dt, carbs_g=carbs_g, bolus_u=bolus_u, walk_min=walk_min)

        # Append to patient's stream file
        stream_file = OUT_STREAM_DIR / f"{patient_id}_stream.csv"
        df_new = pd.DataFrame([record])
        if stream_file.exists():
            df_new.to_csv(stream_file, mode="a", header=False, index=False)
        else:
            df_new.to_csv(stream_file, index=False)

        return record

    def tick_all(self) -> Dict[str, dict]:
        """Advances all 15 patients by one 15-second tick simultaneously."""
        results = {}
        for pid in self.simulators:
            results[pid] = self.tick_patient(pid)
        return results


def run_batch_simulation(align_to_now: bool = True):
    print("=" * 70)
    print("Multi-Modal Wearable Stream Generator (Cardiorespiratory + T1DMSIM)")
    print("=" * 70)

    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        cohort = json.load(f)

    if align_to_now:
        now = datetime.now()
        aligned_sec = (now.second // 15) * 15
        end_time = now.replace(second=aligned_sec, microsecond=0)
        start_time = end_time - timedelta(hours=24)
    else:
        start_time = datetime(2026, 10, 16, 0, 0, 0)

    print(f"Generating 24-hour continuous sensor telemetry (5,760 ticks @ 15s) for {len(cohort)} patients...")
    print(f"Time range: {start_time} to {start_time + timedelta(hours=24)}\n")

    summary_list = []
    for i, profile in enumerate(cohort, start=1):
        pid = profile["patient_id"]
        sim = WearableStreamSimulator(profile, random_seed=100 + i)
        df = sim.generate_trajectory(start_time=start_time, duration_hours=24)

        out_path = OUT_STREAM_DIR / f"{pid}_stream.csv"
        df.to_csv(out_path, index=False)

        mean_g = df["glucose"].mean()
        mean_hr = df["heart_rate"].mean()
        tir_pct = ((df["glucose"] >= 70) & (df["glucose"] <= 180)).mean() * 100
        hypo_pct = (df["glucose"] < 70).mean() * 100
        hyper_pct = (df["glucose"] > 180).mean() * 100

        print(f"[{i:02d}/15] {pid} ({profile['name']} - {profile.get('diabetes_type', 'T1D')}): "
              f"Mean BG {mean_g:.1f} mg/dL | Mean HR: {mean_hr:.1f} bpm | TIR: {tir_pct:.1f}% | "
              f"Hypo: {hypo_pct:.1f}% | Hyper: {hyper_pct:.1f}% -> {out_path.name}")

        summary_list.append({
            "patient_id": pid,
            "name": profile["name"],
            "tier": profile["clinical_risk_tier"],
            "diabetes_type": profile.get("diabetes_type", "Type 1"),
            "mean_glucose": round(mean_g, 1),
            "mean_heart_rate": round(mean_hr, 1),
            "time_in_range_pct": round(tir_pct, 1),
            "time_below_70_pct": round(hypo_pct, 1),
            "time_above_180_pct": round(hyper_pct, 1),
            "total_records": len(df)
        })

    summary_df = pd.DataFrame(summary_list)
    summary_df.to_csv(OUT_STREAM_DIR / "_cohort_wearable_summary.csv", index=False)
    print(f"\nCohort stream simulation complete. Saved to {OUT_STREAM_DIR}")


if __name__ == "__main__":
    run_batch_simulation(align_to_now=True)
