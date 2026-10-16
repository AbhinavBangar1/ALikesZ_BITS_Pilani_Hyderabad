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
from twin_core import DigitalTwinEngine

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

# Global Twin Engine instance
twin_engine: Optional[DigitalTwinEngine] = None
STREAM_DIR = ROOT / "data" / "synthetic_cohort" / "wearable_streams"


@app.on_event("startup")
def load_engine():
    global twin_engine
    print("[API Startup] Loading Digital Twin Engine and trained weights...")
    twin_engine = DigitalTwinEngine()
    print("[API Startup] Digital Twin Engine ready.")


# ── Schemas ───────────────────────────────────────────────────────────────────
class WhatIfRequest(BaseModel):
    carbs_g: float = Field(0.0, description="Carbohydrates in grams to simulate consuming.")
    bolus_u: float = Field(0.0, description="Rapid-acting insulin bolus units to administer.")
    walk_min: float = Field(0.0, description="Walking / exercise duration in minutes.")


# ── Helpers ───────────────────────────────────────────────────────────────────
def get_patient_stream(patient_id: str, limit: int = 48) -> pd.DataFrame:
    stream_path = STREAM_DIR / f"{patient_id}_stream.csv"
    if not stream_path.exists():
        raise HTTPException(status_code=404, detail=f"No wearable stream found for patient {patient_id}")
    df = pd.read_csv(stream_path)
    return df.tail(limit)


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
            stream_df = get_patient_stream(pid, limit=24)
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
            "diabetes_type": profile.get("diabetes_type", "Type 1" if int(pid.split("-")[-1]) <= 8 else "Type 2"),
            "risk_tier": profile["clinical_risk_tier"],
            "hypo_unawareness": profile["hypo_unawareness"],
            "cgm_device": profile["cgm_device"],
            "delivery_system": profile["delivery_system"],
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


@app.get("/api/patient/{patient_id}/stream")
def get_stream(patient_id: str, points: int = 36):
    """
    Returns recent 5-minute ticks (CGM, HR, Steps, Insulin, Carbs)
    for rendering the live multi-modal chart on the dashboard.
    """
    df = get_patient_stream(patient_id, limit=points)
    return {
        "patient_id": patient_id,
        "count": len(df),
        "data": df.to_dict(orient="records")
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

    stream_df = get_patient_stream(patient_id, limit=24)
    state = twin_engine.predict_state(patient_id, stream_df)
    return state


@app.post("/api/patient/{patient_id}/simulate-what-if")
def simulate_action(patient_id: str, request: WhatIfRequest):
    """
    Counterfactual "What-If" simulator:
    Compares baseline trajectory with the intervention trajectory
    (carbs, bolus, exercise) using the patient's individual ISF/ICR.
    """
    if not twin_engine or patient_id not in twin_engine.patients:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    stream_df = get_patient_stream(patient_id, limit=24)
    result = twin_engine.simulate_what_if(
        patient_id=patient_id,
        window_df=stream_df,
        carbs_g=request.carbs_g,
        bolus_u=request.bolus_u,
        walk_min=request.walk_min
    )
    return result


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
