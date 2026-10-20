"""
FastAPI Server for Digital Twin
===============================
Provides RESTful APIs for the Doctor and Patient Dashboards:
  - GET  /api/health
  - GET  /api/patients
  - GET  /api/patient/{patient_id}/ehr
  - GET  /api/patient/{patient_id}/stream?window_size=24
  - GET  /api/patient/{patient_id}/twin-forecast
  - POST /api/patient/{patient_id}/simulate-what-if
"""

import sys
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / "src" / "02_twin_engine"))
sys.path.append(str(ROOT / "src" / "01_simulator"))
sys.path.append(str(ROOT / "src" / "03_api"))
from twin_core import DigitalTwinEngine
from wearable_stream_generator import CohortLiveStreamManager
from analytics import compute_patient_analytics

app = FastAPI(
    title="Type 1 Diabetes Digital Twin Platform API",
    description="Multimodal predictive physiological twin fusing static EHR and dynamic IoT wearable streams.",
    version="1.0.0"
)

# Enable CORS for frontend dashboard access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Twin Engine and Live Stream instances
twin_engine: Optional[DigitalTwinEngine] = None
live_manager: Optional[CohortLiveStreamManager] = None
STREAM_DIR = ROOT / "data" / "synthetic_cohort" / "wearable_streams"


@app.on_event("startup")
def load_engine():
    global twin_engine, live_manager
    print("[API Startup] Loading Digital Twin Engine and trained weights...")
    twin_engine = DigitalTwinEngine()
    print("[API Startup] Digital Twin Engine ready.")
    print("[API Startup] Initializing Cohort Live Stream Manager...")
    live_manager = CohortLiveStreamManager()
    print(f"[API Startup] Live Stream Manager initialized for {len(live_manager.simulators)} patients.")


# ── Schemas ───────────────────────────────────────────────────────────────────
class WhatIfRequest(BaseModel):
    carbs_g: float = Field(0.0, description="Carbohydrates in grams to simulate consuming.")
    bolus_u: float = Field(0.0, description="Rapid-acting insulin bolus units to administer.")
    walk_min: float = Field(0.0, description="Walking / exercise duration in minutes.")
    oral_med_taken: bool = Field(True, description="Whether oral medication was taken (Type 2).")


class CDSSActionRequest(BaseModel):
    pattern_id: str = Field(..., description="The unique pattern ID to acknowledge or dismiss.")


class TickRequest(BaseModel):
    carbs_g: Optional[float] = Field(0.0, description="Carbohydrates in grams to simulate consuming.")
    bolus_u: Optional[float] = Field(0.0, description="Rapid-acting insulin bolus units to administer.")
    walk_min: Optional[float] = Field(0.0, description="Walking / exercise duration in minutes.")


# ── Helpers ───────────────────────────────────────────────────────────────────
def get_patient_stream(patient_id: str, limit: int = 60) -> pd.DataFrame:
    if live_manager:
        live_manager.ensure_patient_aligned(patient_id)
    stream_path = STREAM_DIR / f"{patient_id}_stream.csv"
    if not stream_path.exists():
        raise HTTPException(status_code=404, detail=f"No wearable stream found for patient {patient_id}")
    df = pd.read_csv(stream_path)
    return df.tail(limit)


def get_resampled_patient_stream(patient_id: str, num_5min_steps: int = 72) -> pd.DataFrame:
    """
    Downsamples the 15-second high-frequency stream to 5-minute ticks (20 rows per chunk)
    so the clinical horizon chart matches multi-hour physiological patterns, meal pins, and steps.
    """
    if live_manager:
        live_manager.ensure_patient_aligned(patient_id)
    stream_path = STREAM_DIR / f"{patient_id}_stream.csv"
    if not stream_path.exists():
        raise HTTPException(status_code=404, detail=f"No wearable stream found for patient {patient_id}")
    needed_rows = num_5min_steps * 20 + 40
    df = pd.read_csv(stream_path).tail(needed_rows)
    if len(df) < num_5min_steps:
        return df

    # Aggregate in 20-row (5-minute) chunks
    records = []
    chunk_size = 20
    for i in range(0, len(df), chunk_size):
        chunk = df.iloc[i : i + chunk_size]
        if len(chunk) == 0:
            continue
        last_row = chunk.iloc[-1].to_dict()
        last_row["steps"] = int(chunk["steps"].sum())
        last_row["carb_input"] = round(float(chunk["carb_input"].sum()), 1)
        last_row["bolus_volume_delivered"] = round(float(chunk["bolus_volume_delivered"].sum()), 1)
        last_row["glucose"] = round(float(chunk["glucose"].iloc[-1]), 1)
        last_row["heart_rate"] = int(round(chunk["heart_rate"].mean()))
        records.append(last_row)

    df_5m = pd.DataFrame(records).tail(num_5min_steps).reset_index(drop=True)
    return df_5m


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "engine_loaded": twin_engine is not None,
        "patients_count": len(twin_engine.patients) if twin_engine else 0
    }


@app.get("/api/patients")
def list_patients():
    """
    Returns the triage roster for the Doctor Dashboard:
    List of all 15 patients with their baseline EHR, latest glucose reading,
    risk tier, and current alert status.
    """
    if not twin_engine:
        raise HTTPException(status_code=500, detail="Twin engine not loaded.")

    roster = []
    for pid, profile in twin_engine.patients.items():
        try:
            stream_df = get_resampled_patient_stream(pid, num_5min_steps=24)
            state = twin_engine.predict_state(pid, stream_df)
            curr_g = state["current_glucose"]
            trend = state["trend"]
            alert_lvl = state["alert_level"]
            adverse_risk = state["adverse_risk_prob"]
        except Exception:
            curr_g = 140.0
            trend = "STABLE"
            alert_lvl = "NORMAL"
            adverse_risk = 0.0

        roster.append({
            "patient_id": pid,
            "name": profile["name"],
            "age": profile["age"],
            "gender": profile["gender"],
            "city": profile["city"],
            "hba1c": profile["hba1c_pct"],
            "diabetes_type": profile.get("diabetes_type", "Type 2" if "T2D" in pid else "Type 1"),
            "risk_tier": profile["clinical_risk_tier"],
            "hypo_unawareness": profile["hypo_unawareness"],
            "cgm_device": profile["cgm_device"],
            "delivery_system": profile["delivery_system"],
            "homa_ir": profile.get("homa_ir"),
            "oral_medications": profile.get("oral_medications"),
            "target_tir_pct": profile.get("target_tir_pct"),
            "latest_glucose": curr_g,
            "trend": trend,
            "alert_level": alert_lvl,
            "adverse_risk_prob": adverse_risk
        })

    # Sort triage: CRITICAL > HIGH > MODERATE > LOW
    tier_order = {"Critical": 0, "High": 1, "Moderate": 2, "Low": 3}
    roster = sorted(roster, key=lambda x: tier_order.get(x["risk_tier"], 4))
    return {"total": len(roster), "patients": roster}


@app.get("/api/patient/{patient_id}/ehr")
def get_patient_ehr(patient_id: str):
    """Returns the full Synthea-style EHR record for a specific patient."""
    if not twin_engine or patient_id not in twin_engine.patients:
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    return twin_engine.patients[patient_id]


@app.get("/api/patient/{patient_id}/cdss")
def get_patient_cdss(patient_id: str):
    """Returns active clinical decision support alerts for the patient."""
    if not twin_engine or patient_id not in twin_engine.patients:
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    stream_df = get_resampled_patient_stream(patient_id, num_5min_steps=24)
    profile = twin_engine.patients[patient_id]
    alerts = twin_engine.cdss.evaluate_patient(profile, stream_df)
    return {
        "patient_id": patient_id,
        "count": len(alerts),
        "alerts": alerts
    }


@app.post("/api/patient/{patient_id}/cdss/acknowledge")
def acknowledge_cdss_alert(patient_id: str, request: CDSSActionRequest):
    """Clinician acknowledges a CDSS alert pattern."""
    if not twin_engine:
        raise HTTPException(status_code=500, detail="Twin engine not loaded.")
    status = twin_engine.cdss.acknowledge_alert(patient_id, request.pattern_id)
    return {
        "status": "ok",
        "patient_id": patient_id,
        "pattern_id": request.pattern_id,
        "alert_status": status
    }


@app.post("/api/patient/{patient_id}/cdss/dismiss")
def dismiss_cdss_alert(patient_id: str, request: CDSSActionRequest):
    """Clinician dismisses a CDSS alert pattern."""
    if not twin_engine:
        raise HTTPException(status_code=500, detail="Twin engine not loaded.")
    status = twin_engine.cdss.dismiss_alert(patient_id, request.pattern_id)
    return {
        "status": "ok",
        "patient_id": patient_id,
        "pattern_id": request.pattern_id,
        "alert_status": status
    }


@app.get("/api/patient/{patient_id}/stream")
def get_stream(patient_id: str, points: int = 72, resample: bool = True):
    """
    Returns recent 5-minute ticks (CGM, HR, Steps, Insulin, Carbs)
    for rendering the live multi-modal chart on the dashboard.
    """
    if resample:
        df = get_resampled_patient_stream(patient_id, num_5min_steps=points)
    else:
        df = get_patient_stream(patient_id, limit=points)
    return {
        "patient_id": patient_id,
        "count": len(df),
        "data": df.to_dict(orient="records")
    }


@app.get("/api/patient/{patient_id}/heart-rate/live")
def get_live_heart_rate(patient_id: str, seconds: int = 60):
    """
    Returns continuous 1-second cardiovascular telemetry (instantaneous HR, RR intervals,
    autonomic state) for live high-frequency cardiac monitoring.
    """
    if not live_manager or patient_id not in live_manager.simulators:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found in live stream manager.")
    data = live_manager.get_patient_live_hr(patient_id, seconds=min(300, max(10, seconds)))
    return {
        "patient_id": patient_id,
        "count": len(data),
        "data": data
    }


@app.get("/api/patient/{patient_id}/twin-forecast")
def get_twin_forecast(patient_id: str):
    """
    Executes real-time inference on the patient's latest wearable window:
    Returns current glucose, 30m / 60m / 120m forecast trajectory,
    and adverse event risk probability.
    """
    if not twin_engine or patient_id not in twin_engine.patients:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    stream_df = get_resampled_patient_stream(patient_id, num_5min_steps=24)
    state = twin_engine.predict_state(patient_id, stream_df)
    return state


@app.get("/api/patient/{patient_id}/analytics")
def get_patient_analytics(patient_id: str):
    """
    Computes comprehensive clinical metrics for the Doctor Dashboard redesign:
    1. 14-day / stream Glycaemic summary (TIR, TBR, TAR, CV, Std)
    2. Ambulatory Glucose Profile (AGP) 24h modal percentiles (p05, p25, p50, p75, p95)
    3. Post-prandial meal responses (pre-meal, peak, rise, time to peak, recovery)
    4. Real-time Hero KPIs (ROC, HR state, Steps last hour, IOB / Last meal)
    5. Digital Twin model validation metrics
    """
    if not twin_engine or patient_id not in twin_engine.patients:
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    try:
        data = compute_patient_analytics(patient_id, engine=twin_engine)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute analytics: {str(e)}")


@app.post("/api/patient/{patient_id}/simulate-what-if")
def simulate_action(patient_id: str, request: WhatIfRequest):
    """
    Counterfactual "What-If" simulator:
    Compares baseline trajectory with the intervention trajectory
    (carbs, bolus, exercise, oral meds) using physiological twin kinetics.
    """
    if not twin_engine or patient_id not in twin_engine.patients:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    stream_df = get_resampled_patient_stream(patient_id, num_5min_steps=24)
    result = twin_engine.simulate_what_if(
        patient_id=patient_id,
        window_df=stream_df,
        carbs_g=request.carbs_g,
        bolus_u=request.bolus_u,
        walk_min=request.walk_min,
        oral_med_taken=request.oral_med_taken
    )
    return result


@app.post("/api/patient/{patient_id}/stream/tick")
def tick_patient_stream(patient_id: str, request: Optional[TickRequest] = None):
    """
    Advances telemetry simulation for patient by 5 minutes.
    Can optionally accept manual carbs, bolus, or exercise intervention.
    """
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live stream manager not initialized.")
    carbs = request.carbs_g if request and request.carbs_g is not None else 0.0
    bolus = request.bolus_u if request and request.bolus_u is not None else 0.0
    walk = request.walk_min if request and request.walk_min is not None else 0.0

    try:
        record = live_manager.tick_patient(patient_id, carbs_g=carbs, bolus_u=bolus, walk_min=walk)
        return {
            "status": "ok",
            "patient_id": patient_id,
            "record": record
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to tick patient stream: {str(e)}")


@app.post("/api/stream/tick-all")
def tick_all_cohort():
    """
    Advances telemetry simulation for all 15 cohort patients simultaneously by 5 minutes.
    """
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live stream manager not initialized.")
    try:
        records = live_manager.tick_all()
        return {
            "status": "ok",
            "total_updated": len(records),
            "records": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to tick cohort streams: {str(e)}")


# ── UI Page Routes ────────────────────────────────────────────────────────────
from fastapi.responses import RedirectResponse

@app.get("/")
@app.get("/doctor")
def serve_doctor_dashboard():
    return RedirectResponse(url="http://localhost:3000/doctor")

@app.get("/patient")
def serve_patient_dashboard():
    return RedirectResponse(url="http://localhost:3000/patient")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
