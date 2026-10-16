"""
Synthea-Style Synthetic Clinical EHR Generator (FHIR / JSON)
=============================================================
Generates 15 rich, diverse Indian T1D patient clinical profiles following
FHIR / Synthea schema standards:
  - Demographics (Name, Age, Gender, City, Occupation)
  - Biometrics (BMI, Height, Weight)
  - Glycemic Markers (Recent HbA1c, Target Range, Years with T1D)
  - Metabolic Twin Constants (Insulin Sensitivity Factor ISF, Carb Ratio ICR, Basal Profile)
  - Comorbidities & Risk Profile (Hypoglycemia Unawareness, Microalbuminuria, Retinopathy)
  - Active Prescriptions & Sensor Hardware (CGM model, Insulin Pump / MDI regimen)

Outputs:
  - data/synthetic_cohort/patients_metadata.json
  - data/synthetic_cohort/patients_summary.csv
"""

import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "synthetic_cohort"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PATIENT_PROFILES = [
    {
        "patient_id": "T1D-IN-001",
        "name": "Aarav Sharma",
        "age": 22,
        "gender": "Male",
        "city": "Bengaluru",
        "occupation": "Software Engineer",
        "weight_kg": 64.5,
        "height_cm": 175,
        "bmi": 21.1,
        "years_with_t1d": 3,
        "hba1c_pct": 8.9,
        "target_range_mg_dl": [70, 180],
        "isf_mg_dl_per_unit": 45,       # 1U insulin drops glucose by 45 mg/dL
        "icr_grams_per_unit": 10,       # 1U covers 10g carbs
        "basal_rate_u_hr": 0.85,
        "cgm_device": "Abbott FreeStyle Libre 2",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "High",
        "risk_rationale": "High postprandial volatility due to irregular tech work hours and high-carb cafeteria diet."
    },
    {
        "patient_id": "T1D-IN-002",
        "name": "Priya Patel",
        "age": 29,
        "gender": "Female",
        "city": "Ahmedabad",
        "occupation": "Architect",
        "weight_kg": 58.0,
        "height_cm": 162,
        "bmi": 22.1,
        "years_with_t1d": 11,
        "hba1c_pct": 6.8,
        "target_range_mg_dl": [70, 160],
        "isf_mg_dl_per_unit": 55,
        "icr_grams_per_unit": 14,
        "basal_rate_u_hr": 0.70,
        "cgm_device": "Dexcom G6",
        "delivery_system": "Tandem t:slim X2 (Closed Loop)",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Low",
        "risk_rationale": "Tight glycemic control with closed-loop pump; high adherence to carb counting."
    },
    {
        "patient_id": "T1D-IN-003",
        "name": "Vikram Reddy",
        "age": 36,
        "gender": "Male",
        "city": "Hyderabad",
        "occupation": "Marathon Runner / Fitness Trainer",
        "weight_kg": 72.0,
        "height_cm": 178,
        "bmi": 22.7,
        "years_with_t1d": 14,
        "hba1c_pct": 7.3,
        "target_range_mg_dl": [80, 180],
        "isf_mg_dl_per_unit": 60,
        "icr_grams_per_unit": 15,
        "basal_rate_u_hr": 0.65,
        "cgm_device": "Dexcom G7",
        "delivery_system": "Omnipod 5 Patch Pump",
        "comorbidities": ["Hypoglycemia Associated Autonomic Failure (HAAF)"],
        "hypo_unawareness": True,
        "clinical_risk_tier": "Critical",
        "risk_rationale": "Severe risk of nocturnal hypoglycemia post-endurance workouts; lost warning adrenergic tremors."
    },
    {
        "patient_id": "T1D-IN-004",
        "name": "Ananya Sen",
        "age": 19,
        "gender": "Female",
        "city": "Kolkata",
        "occupation": "University Undergraduate",
        "weight_kg": 52.0,
        "height_cm": 158,
        "bmi": 20.8,
        "years_with_t1d": 1,
        "hba1c_pct": 9.4,
        "target_range_mg_dl": [70, 180],
        "isf_mg_dl_per_unit": 50,
        "icr_grams_per_unit": 12,
        "basal_rate_u_hr": 0.80,
        "cgm_device": "Abbott FreeStyle Libre 3",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["Celiac Disease"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "High",
        "risk_rationale": "Recent onset; honeymoon phase ending. Unstable carbohydrate absorption due to gluten sensitivities."
    },
    {
        "patient_id": "T1D-IN-005",
        "name": "Rohan Deshmukh",
        "age": 44,
        "gender": "Male",
        "city": "Pune",
        "occupation": "Automotive Engineering Manager",
        "weight_kg": 83.0,
        "height_cm": 172,
        "bmi": 28.1,
        "years_with_t1d": 21,
        "hba1c_pct": 8.4,
        "target_range_mg_dl": [70, 190],
        "isf_mg_dl_per_unit": 32,
        "icr_grams_per_unit": 7,
        "basal_rate_u_hr": 1.20,
        "cgm_device": "Medtronic Guardian Connect",
        "delivery_system": "Medtronic MiniMed 780G",
        "comorbidities": ["Hypertension", "Mild Background Retinopathy"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Moderate",
        "risk_rationale": "Double diabetes phenotype: T1D with secondary insulin resistance (high BMI, low ISF)."
    },
    {
        "patient_id": "T1D-IN-006",
        "name": "Meera Nambiar",
        "age": 33,
        "gender": "Female",
        "city": "Kochi",
        "occupation": "Marine Biologist",
        "weight_kg": 60.5,
        "height_cm": 165,
        "bmi": 22.2,
        "years_with_t1d": 8,
        "hba1c_pct": 7.1,
        "target_range_mg_dl": [70, 170],
        "isf_mg_dl_per_unit": 48,
        "icr_grams_per_unit": 12,
        "basal_rate_u_hr": 0.75,
        "cgm_device": "Dexcom G6",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["Hashimoto Thyroiditis"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Low",
        "risk_rationale": "Consistent lifestyle and well-managed thyroid replacement therapy."
    },
    {
        "patient_id": "T1D-IN-007",
        "name": "Kabir Mehta",
        "age": 16,
        "gender": "Male",
        "city": "Delhi NCR",
        "occupation": "High School Student",
        "weight_kg": 59.0,
        "height_cm": 170,
        "bmi": 20.4,
        "years_with_t1d": 5,
        "hba1c_pct": 9.8,
        "target_range_mg_dl": [70, 180],
        "isf_mg_dl_per_unit": 38,
        "icr_grams_per_unit": 9,
        "basal_rate_u_hr": 1.05,
        "cgm_device": "Abbott FreeStyle Libre 2",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Critical",
        "risk_rationale": "Adolescent growth hormone surges causing profound dawn phenomenon spikes and missed school boluses."
    },
    {
        "patient_id": "T1D-IN-008",
        "name": "Sunita Joshi",
        "age": 52,
        "gender": "Female",
        "city": "Mumbai",
        "occupation": "Primary School Principal",
        "weight_kg": 67.0,
        "height_cm": 156,
        "bmi": 27.5,
        "years_with_t1d": 26,
        "hba1c_pct": 7.9,
        "target_range_mg_dl": [80, 180],
        "isf_mg_dl_per_unit": 35,
        "icr_grams_per_unit": 8,
        "basal_rate_u_hr": 1.10,
        "cgm_device": "Dexcom G6",
        "delivery_system": "Tandem t:slim X2",
        "comorbidities": ["Microalbuminuria", "Dyslipidemia"],
        "hypo_unawareness": True,
        "clinical_risk_tier": "High",
        "risk_rationale": "Longstanding diabetes duration with early nephropathy and blunted epinephrine response to lows."
    },
    {
        "patient_id": "T1D-IN-009",
        "name": "Devendra Rao",
        "age": 27,
        "gender": "Male",
        "city": "Chennai",
        "occupation": "Freelance Cinematographer",
        "weight_kg": 69.0,
        "height_cm": 174,
        "bmi": 22.8,
        "years_with_t1d": 6,
        "hba1c_pct": 8.1,
        "target_range_mg_dl": [70, 180],
        "isf_mg_dl_per_unit": 42,
        "icr_grams_per_unit": 11,
        "basal_rate_u_hr": 0.90,
        "cgm_device": "Abbott FreeStyle Libre 2",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Moderate",
        "risk_rationale": "Erratic filming schedules causing unpredictable nocturnal meal timings and variable sleep windows."
    },
    {
        "patient_id": "T1D-IN-010",
        "name": "Fatima Sheikh",
        "age": 38,
        "gender": "Female",
        "city": "Lucknow",
        "occupation": "Civil Hospital Laboratory Technologist",
        "weight_kg": 63.0,
        "height_cm": 160,
        "bmi": 24.6,
        "years_with_t1d": 16,
        "hba1c_pct": 7.0,
        "target_range_mg_dl": [70, 160],
        "isf_mg_dl_per_unit": 50,
        "icr_grams_per_unit": 13,
        "basal_rate_u_hr": 0.72,
        "cgm_device": "Dexcom G7",
        "delivery_system": "Omnipod DASH",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Low",
        "risk_rationale": "High health literacy; consistent pre-bolusing 15 minutes before traditional Indian meals."
    },
    {
        "patient_id": "T1D-IN-011",
        "name": "Gurpreet Singh",
        "age": 48,
        "gender": "Male",
        "city": "Chandigarh",
        "occupation": "Agricultural Exporter",
        "weight_kg": 86.0,
        "height_cm": 182,
        "bmi": 26.0,
        "years_with_t1d": 19,
        "hba1c_pct": 8.7,
        "target_range_mg_dl": [70, 190],
        "isf_mg_dl_per_unit": 34,
        "icr_grams_per_unit": 8,
        "basal_rate_u_hr": 1.15,
        "cgm_device": "Medtronic Guardian 4",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["Stage 1 Hypertension"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Moderate",
        "risk_rationale": "High glycemic load diet (heavy parathas and dairy); delayed postprandial spikes 3 hours post-meal."
    },
    {
        "patient_id": "T1D-IN-012",
        "name": "Kavita Swaminathan",
        "age": 25,
        "gender": "Female",
        "city": "Coimbatore",
        "occupation": "Textile Designer",
        "weight_kg": 54.0,
        "height_cm": 161,
        "bmi": 20.8,
        "years_with_t1d": 4,
        "hba1c_pct": 7.6,
        "target_range_mg_dl": [70, 170],
        "isf_mg_dl_per_unit": 52,
        "icr_grams_per_unit": 13,
        "basal_rate_u_hr": 0.78,
        "cgm_device": "Abbott FreeStyle Libre 3",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Moderate",
        "risk_rationale": "Moderate control, but prone to exercise-induced lows during morning badminton sessions."
    },
    {
        "patient_id": "T1D-IN-013",
        "name": "Aditya Verma",
        "age": 31,
        "gender": "Male",
        "city": "Jaipur",
        "occupation": "Hotelier",
        "weight_kg": 75.0,
        "height_cm": 176,
        "bmi": 24.2,
        "years_with_t1d": 9,
        "hba1c_pct": 8.0,
        "target_range_mg_dl": [70, 180],
        "isf_mg_dl_per_unit": 44,
        "icr_grams_per_unit": 11,
        "basal_rate_u_hr": 0.88,
        "cgm_device": "Dexcom G6",
        "delivery_system": "Tandem Control-IQ",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "Moderate",
        "risk_rationale": "Irregular meal tastings throughout work shifts requiring continuous micro-bolusing."
    },
    {
        "patient_id": "T1D-IN-014",
        "name": "Zoya Akhtar",
        "age": 21,
        "gender": "Female",
        "city": "Bhopal",
        "occupation": "Medical Student",
        "weight_kg": 51.0,
        "height_cm": 164,
        "bmi": 19.0,
        "years_with_t1d": 7,
        "hba1c_pct": 8.5,
        "target_range_mg_dl": [70, 180],
        "isf_mg_dl_per_unit": 54,
        "icr_grams_per_unit": 13,
        "basal_rate_u_hr": 0.76,
        "cgm_device": "Dexcom G7",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["None"],
        "hypo_unawareness": False,
        "clinical_risk_tier": "High",
        "risk_rationale": "Exam stress and overnight hospital duties triggering cortisol-induced acute insulin resistance spikes."
    },
    {
        "patient_id": "T1D-IN-015",
        "name": "Rajesh Banerjee",
        "age": 61,
        "gender": "Male",
        "city": "Kolkata",
        "occupation": "Retired High Court Advocate",
        "weight_kg": 70.0,
        "height_cm": 169,
        "bmi": 24.5,
        "years_with_t1d": 34,
        "hba1c_pct": 7.5,
        "target_range_mg_dl": [80, 180],
        "isf_mg_dl_per_unit": 36,
        "icr_grams_per_unit": 9,
        "basal_rate_u_hr": 0.95,
        "cgm_device": "Abbott FreeStyle Libre 2",
        "delivery_system": "Multiple Daily Injections (MDI)",
        "comorbidities": ["Peripheral Neuropathy", "Stage 2 Chronic Kidney Disease"],
        "hypo_unawareness": True,
        "clinical_risk_tier": "Critical",
        "risk_rationale": "34-year T1D duration with severe hypoglycemia unawareness and delayed insulin clearance due to reduced renal GFR."
    }
]

def generate_cohort():
    # Save full JSON (Synthea/FHIR compatible)
    json_path = OUT_DIR / "patients_metadata.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(PATIENT_PROFILES, f, indent=2)
    print(f"Generated {len(PATIENT_PROFILES)} Synthea EHR patient profiles -> {json_path}")

    # Save summary CSV
    df = pd.DataFrame(PATIENT_PROFILES)
    csv_path = OUT_DIR / "patients_summary.csv"
    df.to_csv(csv_path, index=False)
    print(f"Summary table exported -> {csv_path}")
    return df

if __name__ == "__main__":
    generate_cohort()
