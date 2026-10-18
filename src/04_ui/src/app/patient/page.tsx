"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import DashboardTutorial, { TutorialStep } from "@/components/common/DashboardTutorial";

interface WhatIfResponse {
  patient_id: string;
  patient_name: string;
  diabetes_type?: string;
  action_evaluated: {
    carbs_added_g: number;
    bolus_added_u: number;
    walk_duration_min: number;
    oral_med_taken?: boolean;
  };
  horizons_min: number[];
  baseline_trajectory: number[];
  simulated_trajectory: number[];
  net_difference_mg_dl: number[];
  safety_flag: string;
  clinical_recommendation: string;
}

interface PatientSummary {
  patient_id: string;
  name: string;
  diabetes_type: string;
  clinical_risk_tier: string;
}

const PATIENT_TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetId: "tutorial-patient-cgm",
    title: "1. Real-Time Glucose & Trend",
    badge: "LIVE SENSOR",
    description:
      "Displays your active continuous glucose reading in mg/dL, directional trend velocity (e.g., STABLE, RISING), and recent 3-hour trajectory sparkline color-coded by clinical target zones (70–140 mg/dL).",
    tip: "A blue bar indicates in-range; amber indicates hyperglycemia (>180); red indicates hypoglycemia danger (<70).",
  },
  {
    targetId: "tutorial-patient-forecast",
    title: "2. Predictive Forecast Horizons",
    badge: "AI HORIZON",
    description:
      "Proactively projects where your blood sugar will be in +30 minutes and +60 minutes using physiological twin kinetics, giving you actionable foresight before symptoms or extreme excursions occur.",
    tip: "If the 60m projection exceeds 140 mg/dL, the twin flags an upcoming excursion risk.",
  },
  {
    targetId: "tutorial-patient-simulator",
    title: "3. Counterfactual 'What-If' Sliders",
    badge: "TWIN SIMULATION",
    description:
      "Simulate real-life choices before you make them: adjust Food Carbs (0–120g), Rapid Insulin Bolus (0–10U), and Post-Meal Walking (0–60 min). For Type 2 patients, test the impact of taking or missing oral medications.",
    tip: "Notice how a 15-minute post-meal walk stimulates GLUT-4 muscle uptake and flattens glycemic spikes.",
  },
  {
    targetId: "tutorial-patient-chart",
    title: "4. 2-Hour Dual-Trajectory Canvas",
    badge: "PHYSIOLOGICAL TWIN",
    description:
      "Directly compares your Baseline trajectory (dashed gray line: if you make no changes) against your Simulated trajectory (solid blue line: incorporating your food, insulin, or exercise), forecasting your peak glucose level.",
    tip: "The green background band highlights the 70–140 mg/dL safe clinical zone.",
  },
  {
    targetId: "tutorial-patient-diet",
    title: "5. Indian Meal Calculator",
    badge: "NUTRITION PLANNER",
    description:
      "Easily plan authentic South Asian meals (Roti, Dal, Paneer, Rice, Dosa, Idli, Poha). Computes total carbs, protein, and fat, and provides one-click 'Apply to What-If' simulation to sync directly with your metabolic twin.",
    tip: "Click '+ Roti' or '+ Dal' to watch your simulated postprandial curve update in real-time.",
  },
];

export default function PatientDashboard() {
  const [patientId, setPatientId] = useState<string>("T1D-IN-001");
  const [patientList, setPatientList] = useState<PatientSummary[]>([]);
  const [patientEHR, setPatientEHR] = useState<any>(null);

  const [currentGlucose, setCurrentGlucose] = useState<number>(112);
  const [cgmTime, setCgmTime] = useState<string>("19:45");
  const [trend, setTrend] = useState<string>("STABLE");
  const [forecast30, setForecast30] = useState<number>(119);
  const [forecast60, setForecast60] = useState<number>(124);
  const [forecast120, setForecast120] = useState<number>(115);
  const [sparklineData, setSparklineData] = useState<number[]>([]);
  const [lastRecordedMeal, setLastRecordedMeal] = useState<{ carbs: number; bolus: number; time: string } | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(false);

  // Auto-open tutorial on first visit
  useEffect(() => {
    if (typeof window !== "undefined") {
      const seen = localStorage.getItem("kiko_patient_tutorial_seen");
      if (!seen) {
        const timer = setTimeout(() => setTutorialOpen(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Simulation Sliders
  const [carbs, setCarbs] = useState<number>(45);
  const [bolus, setBolus] = useState<number>(2.5);
  const [walk, setWalk] = useState<number>(15);
  const [oralMedTaken, setOralMedTaken] = useState<boolean>(true);

  // Simulation Output
  const [whatIf, setWhatIf] = useState<WhatIfResponse | null>(null);

  // Indian Food Macros & Multipliers
  const [multipliers, setMultipliers] = useState<Record<string, number>>({
    roti: 2.0,
    dal: 1.0,
    paneer: 1.0,
    rice: 0,
    dosa: 0,
    idli: 0,
    poha: 0,
  });

  const baseMacros: Record<string, { carbs: number; protein: number; fat: number }> = {
    roti: { carbs: 18, protein: 3, fat: 1 },
    dal: { carbs: 20, protein: 9, fat: 5 },
    paneer: { carbs: 4, protein: 14, fat: 18 },
    rice: { carbs: 35, protein: 3, fat: 1 },
    dosa: { carbs: 45, protein: 6, fat: 10 },
    idli: { carbs: 30, protein: 5, fat: 2 },
    poha: { carbs: 32, protein: 5, fat: 7 },
  };

  // Determine Type 2 vs Type 1
  const isT2D = useMemo(() => {
    return patientEHR?.diabetes_type === "Type 2" || patientId.startsWith("T2D");
  }, [patientEHR, patientId]);

  // Read URL query parameter ?id= on initial mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get("id");
      if (urlId) {
        setPatientId(urlId);
      }
    }
  }, []);

  // Fetch Cohort Patients for switcher dropdown
  useEffect(() => {
    async function fetchCohort() {
      try {
        const res = await fetch("http://127.0.0.1:8000/api/patients");
        if (res.ok) {
          const data = await res.json();
          setPatientList(
            (data.patients || []).map((p: any) => ({
              patient_id: p.patient_id,
              name: p.name,
              diabetes_type: p.diabetes_type,
              clinical_risk_tier: p.risk_tier,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to fetch patient list:", err);
      }
    }
    fetchCohort();
  }, []);

  // Load Patient Detail whenever patientId changes
  useEffect(() => {
    async function loadPatient() {
      try {
        const [ehrRes, streamRes, forecastRes] = await Promise.all([
          fetch(`http://127.0.0.1:8000/api/patient/${patientId}/ehr`),
          fetch(`http://127.0.0.1:8000/api/patient/${patientId}/stream?points=36`),
          fetch(`http://127.0.0.1:8000/api/patient/${patientId}/twin-forecast`),
        ]);

        if (ehrRes.ok) {
          const ehrData = await ehrRes.json();
          setPatientEHR(ehrData);
        }

        if (streamRes.ok) {
          const streamData = await streamRes.json();
          const pts = (streamData.data || []).map((pt: any) => pt.glucose);
          setSparklineData(pts);

          // Detect recent meal ingestion events in stream
          const mealList = (streamData.data || []).filter(
            (d: any) => (d.carb_input || 0) > 0 || (d.bolus_volume_delivered || 0) > 0
          );
          if (mealList.length > 0) {
            const lm = mealList[mealList.length - 1];
            const time = lm.timestamp?.includes(" ")
              ? lm.timestamp.split(" ")[1].slice(0, 5)
              : lm.timestamp?.slice(0, 5) || "";
            setLastRecordedMeal({
              carbs: Math.round(lm.carb_input || 0),
              bolus: Number((lm.bolus_volume_delivered || 0).toFixed(1)),
              time,
            });
          } else {
            setLastRecordedMeal(null);
          }
        }

        if (forecastRes.ok) {
          const fc = await forecastRes.json();
          setCurrentGlucose(Math.round(fc.current_glucose));
          if (fc.timestamp && fc.timestamp.includes(" ")) {
            setCgmTime(fc.timestamp.split(" ")[1].slice(0, 5));
          }
          setTrend(fc.trend || "STABLE");
          setForecast30(Math.round(fc.forecast.t_plus_30min));
          setForecast60(Math.round(fc.forecast.t_plus_60min));
          setForecast120(Math.round(fc.forecast.t_plus_120min));
        }
      } catch (err) {
        console.error("Failed to load patient companion data:", err);
      }
    }

    loadPatient();
  }, [patientId]);

  // Run Simulation whenever inputs change
  useEffect(() => {
    async function runSimulation() {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/patient/${patientId}/simulate-what-if`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carbs_g: carbs,
            bolus_u: isT2D ? 0.0 : bolus,
            walk_min: walk,
            oral_med_taken: oralMedTaken,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          setWhatIf(result);
        }
      } catch (err) {
        console.error("What-if simulation failed:", err);
      }
    }

    runSimulation();
  }, [patientId, carbs, bolus, walk, oralMedTaken, isT2D]);

  // Calculate Meal Totals
  const mealTotals = useMemo(() => {
    return Object.entries(multipliers).reduce(
      (acc, [food, mult]) => {
        if (mult > 0 && baseMacros[food]) {
          acc.carbs += baseMacros[food].carbs * mult;
          acc.protein += baseMacros[food].protein * mult;
          acc.fat += baseMacros[food].fat * mult;
        }
        return acc;
      },
      { carbs: 0, protein: 0, fat: 0 }
    );
  }, [multipliers]);

  const applyMeal = () => {
    setCarbs(Math.round(mealTotals.carbs));
  };

  const resetSliders = () => {
    setCarbs(45);
    setBolus(2.5);
    setWalk(15);
    setOralMedTaken(true);
  };

  const peakSimVal = whatIf ? Math.max(...whatIf.simulated_trajectory) : 190;
  const minSimVal = whatIf ? Math.min(...whatIf.simulated_trajectory) : 110;
  const isHypoDanger = whatIf?.safety_flag === "DANGER_HYPO" || minSimVal < 70;
  const isHyperSpike = whatIf?.safety_flag === "WARN_HYPER" || peakSimVal > 220;
  const isSafe = !isHypoDanger && !isHyperSpike;

  // Chart Rendering Coordinates for Middle Simulator
  const chartW = 540;
  const chartH = 220;
  const pLeft = 45;
  const pRight = 30;
  const pTop = 25;
  const pBottom = 35;
  const plotW = chartW - pLeft - pRight;
  const plotH = chartH - pTop - pBottom;

  const baseCurve = whatIf?.baseline_trajectory || [currentGlucose, forecast30, forecast60, forecast120];
  const simCurve = whatIf?.simulated_trajectory || [currentGlucose, forecast30 + 10, forecast60 + 20, forecast120 + 5];

  const highestSim = Math.max(...baseCurve, ...simCurve, 240);
  const minY = 40;
  const maxY = highestSim > 330 ? Math.ceil((highestSim + 20) / 50) * 50 : 350;

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return pTop + plotH - ((clamped - minY) / (maxY - minY)) * plotH;
  };

  const xPts = [pLeft, pLeft + plotW * 0.33, pLeft + plotW * 0.66, pLeft + plotW];
  const baseYPts = baseCurve.map(getY);
  const simYPts = simCurve.map(getY);

  const baseD = `M ${xPts[0]} ${baseYPts[0]} C ${xPts[0] + 35} ${baseYPts[0]}, ${xPts[1] - 35} ${baseYPts[1]}, ${xPts[1]} ${baseYPts[1]} C ${xPts[1] + 35} ${baseYPts[1]}, ${xPts[2] - 35} ${baseYPts[2]}, ${xPts[2]} ${baseYPts[2]} C ${xPts[2] + 35} ${baseYPts[2]}, ${xPts[3] - 35} ${baseYPts[3]}, ${xPts[3]} ${baseYPts[3]}`;
  const simD = `M ${xPts[0]} ${simYPts[0]} C ${xPts[0] + 35} ${simYPts[0]}, ${xPts[1] - 35} ${simYPts[1]}, ${xPts[1]} ${simYPts[1]} C ${xPts[1] + 35} ${simYPts[1]}, ${xPts[2] - 35} ${simYPts[2]}, ${xPts[2]} ${simYPts[2]} C ${xPts[2] + 35} ${simYPts[2]}, ${xPts[3] - 35} ${simYPts[3]}, ${xPts[3]} ${simYPts[3]}`;

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans antialiased">
      {/* ── Top Header: Editorial Serif, Monospace Live Time & Patient Switcher ── */}
      <header className="border-b border-slate-200 px-6 py-3 flex items-center justify-between select-none">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-bold text-lg font-editorial">
            ∞
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-editorial text-2xl font-normal tracking-tight text-slate-900">
                Kiko
              </span>
              <span className="text-[11px] font-mono-tech uppercase tracking-wider text-slate-500">
                Patient Physiological Twin
              </span>
            </div>
          </div>
        </div>

        {/* Center: Patient Cohort Switcher */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono-tech uppercase tracking-wider text-slate-500">
            Active Patient:
          </label>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="text-xs font-semibold font-sans bg-slate-50 border border-slate-300 px-3 py-1.5 focus:outline-none focus:border-slate-500 cursor-pointer rounded-none"
          >
            {patientList.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.patient_id} · {p.name} ({p.diabetes_type})
              </option>
            ))}
          </select>
          <span className="text-[11px] font-mono-tech px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-800 uppercase">
            {isT2D ? "Type 2 Mode" : "Type 1 AID Mode"}
          </span>
        </div>

        {/* Right: Tour Button, Clinician Portal Link & Status */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-tech text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-900 bg-white hover:bg-slate-50 transition-colors rounded-none cursor-pointer"
            title="Take a 5-step guided tour of the Patient Dashboard"
          >
            <span className="w-3.5 h-3.5 rounded-full border border-slate-400 text-[10px] flex items-center justify-center font-bold">
              ?
            </span>
            <span>Tour (5 Steps)</span>
          </button>
          <div className="flex items-center gap-2 text-xs font-mono-tech text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>SYNCED 15s</span>
          </div>
          <Link
            href="/doctor"
            className="px-3.5 py-1.5 text-xs font-sans font-medium text-slate-900 border border-slate-300 hover:bg-slate-100 transition-colors rounded-none"
          >
            Clinician Portal →
          </Link>
        </div>
      </header>

      {/* ── Main 3-Column Edge-to-Edge Grid (Zero Gaps, Continuous 1px Borders) ── */}
      <main className="flex-1 flex flex-col lg:flex-row w-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        {/* ── Column 1: Live Status & Explainability Feed (25% width) ── */}
        <section className="w-full lg:w-[25%] p-6 flex flex-col justify-between bg-white">
          <div>
            <div id="tutorial-patient-cgm" className="border border-slate-200 p-4 bg-white mb-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-mono-tech uppercase tracking-wider text-slate-500">
                  CURRENT CGM
                </span>
                <span className="text-xs font-mono-tech text-slate-400">{cgmTime}</span>
              </div>

              {/* Glucose Hero Value */}
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[52px] font-semibold text-slate-900 leading-none tracking-tight font-sans">
                  {currentGlucose}
                </span>
                <span className="text-base font-semibold text-slate-900 font-sans">
                  mg/dL
                </span>
                <span className="ml-auto text-xs font-mono-tech px-2 py-0.5 border border-slate-300 text-slate-800 bg-slate-50">
                  {trend.replace("_", " ")}
                </span>
              </div>

              {/* 3-Hour Sparkline Box */}
              <div className="mt-4 border border-slate-200 p-3 bg-slate-50/50">
                <div className="flex items-center justify-between text-[11px] font-mono-tech text-slate-500 mb-2">
                  <span>Recent 3-Hour Trajectory</span>
                  <span>Target: 70–140</span>
                </div>
                <div className="h-14 flex items-end gap-1">
                  {sparklineData.slice(-24).map((val, idx) => {
                    const h = Math.max(10, Math.min(52, ((val - 60) / 180) * 52));
                    const isHigh = val > 180;
                    const isLow = val < 70;
                    return (
                      <div
                        key={idx}
                        className={`flex-1 transition-all ${
                          isLow
                            ? "bg-rose-500"
                            : isHigh
                            ? "bg-amber-500"
                            : "bg-blue-600"
                        }`}
                        style={{ height: `${h}px` }}
                        title={`${val} mg/dL`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Meal Ingestion Banner if recent meal exists in stream */}
              {lastRecordedMeal && (
                <div className="mt-3 p-2.5 border border-amber-300 bg-amber-50/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-amber-900">
                    <span>🍽 Last Ingestion:</span>
                    <span className="font-bold">{lastRecordedMeal.carbs}g carbs</span>
                    {lastRecordedMeal.bolus > 0 && (
                      <span className="text-blue-700">· {lastRecordedMeal.bolus}U</span>
                    )}
                  </div>
                  <span className="font-mono-tech text-[10px] text-amber-800 font-semibold">
                    @{lastRecordedMeal.time}
                  </span>
                </div>
              )}
            </div>

            {/* Predictive Horizons Grid */}
            <div
              id="tutorial-patient-forecast"
              className="mt-4 grid grid-cols-2 gap-0 border border-slate-200 divide-x divide-slate-200"
            >
              <div className="p-3 text-center">
                <span className="text-[11px] font-mono-tech text-slate-500 block uppercase">
                  In +30 min
                </span>
                <span className="text-xl font-semibold font-mono-tech text-slate-900 mt-1 block">
                  {forecast30} <span className="text-xs font-normal">mg/dL</span>
                </span>
                <span className="text-[10px] font-sans text-slate-500">
                  {forecast30 >= 70 && forecast30 <= 140 ? "Safe Target" : "Excursion Risk"}
                </span>
              </div>
              <div className="p-3 text-center">
                <span className="text-[11px] font-mono-tech text-slate-500 block uppercase">
                  In +60 min
                </span>
                <span className="text-xl font-semibold font-mono-tech text-slate-900 mt-1 block">
                  {forecast60} <span className="text-xs font-normal">mg/dL</span>
                </span>
                <span className="text-[10px] font-sans text-slate-500">
                  {forecast60 >= 70 && forecast60 <= 140 ? "Safe Target" : "Excursion Risk"}
                </span>
              </div>
            </div>

            {/* Twin Insights Explainability Feed */}
            <div className="mt-6 border-t border-slate-200 pt-4">
              <h3 className="font-editorial text-lg font-normal text-slate-900 tracking-tight">
                Twin Physiological Insights
              </h3>
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                {isT2D ? (
                  <>
                    <div className="p-2.5 border border-slate-200 bg-slate-50">
                      <span className="font-semibold block text-slate-900">
                        Insulin Resistance Clearance
                      </span>
                      HOMA-IR index ({patientEHR?.homa_ir || 3.8}) slows postprandial glucose uptake. Post-meal walking directly triggers GLUT-4 translocation in muscle.
                    </div>
                    <div className="p-2.5 border border-slate-200 bg-slate-50">
                      <span className="font-semibold block text-slate-900">
                        Oral Therapy Regimen
                      </span>
                      Covered by {patientEHR?.oral_medications || "Metformin + SGLT2i"}. Ensures steady hepatic gluconeogenesis suppression.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-2.5 border border-slate-200 bg-slate-50">
                      <span className="font-semibold block text-slate-900">
                        Insulin Sensitivity Factor (ISF)
                      </span>
                      Current sensitivity: 1U lowers glucose by {patientEHR?.isf_mg_dl_per_unit || 45} mg/dL. Basal infusion nominal.
                    </div>
                    <div className="p-2.5 border border-slate-200 bg-slate-50">
                      <span className="font-semibold block text-slate-900">
                        Insulin-to-Carb Ratio (ICR)
                      </span>
                      Dosing at 1:{patientEHR?.icr_grams_per_unit || 10}g. Pre-bolusing 15 min prior to meals avoids postprandial spikes.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Lower Card: Clinical Risk Profile */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] font-mono-tech text-slate-500">
            <span>Clinical Tier: {patientEHR?.clinical_risk_tier || "Moderate"}</span>
            <span className="block mt-1 truncate">
              Condition: {patientEHR?.risk_rationale || "Stable ambulatory cohort."}
            </span>
          </div>
        </section>

        {/* ── Column 2: Counterfactual What-If Simulator (48% width) ── */}
        <section className="w-full lg:w-[48%] p-6 flex flex-col justify-between bg-white">
          <div>
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="font-editorial text-2xl font-normal text-slate-900 tracking-tight">
                  Counterfactual "What-If" Simulation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate dynamic interventions and project next 2-hour physiological response.
                </p>
              </div>
              <button
                onClick={resetSliders}
                className="text-xs font-mono-tech text-slate-600 hover:text-slate-900 px-2.5 py-1 border border-slate-200 hover:bg-slate-100 transition-colors rounded-none"
              >
                Reset
              </button>
            </div>

            {/* Interactive Sliders Deck */}
            <div
              id="tutorial-patient-simulator"
              className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              {/* Slider 1: Food Carbs */}
              <div className="p-3 border border-slate-200 bg-white">
                <div className="flex justify-between text-xs font-medium text-slate-800">
                  <span>Food Carbs</span>
                  <span className="font-mono-tech font-bold text-blue-700">{carbs} g</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="120"
                  step="5"
                  value={carbs}
                  onChange={(e) => setCarbs(Number(e.target.value))}
                  className="w-full mt-2 accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono-tech text-slate-400 mt-1">
                  <span>0g</span>
                  <span>120g</span>
                </div>
              </div>

              {/* Slider 2: If T1D Bolus / If T2D Oral Med */}
              {isT2D ? (
                <div className="p-3 border border-slate-200 bg-white flex flex-col justify-between">
                  <div className="flex justify-between text-xs font-medium text-slate-800">
                    <span>Oral Meds</span>
                    <span className="font-mono-tech font-bold text-emerald-700">
                      {oralMedTaken ? "Taken" : "Missed"}
                    </span>
                  </div>
                  <button
                    onClick={() => setOralMedTaken((prev) => !prev)}
                    className={`mt-2 py-1 text-xs font-mono-tech uppercase tracking-wider border transition-colors ${
                      oralMedTaken
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                        : "bg-rose-50 border-rose-300 text-rose-900"
                    }`}
                  >
                    {oralMedTaken ? "✓ Dose Taken" : "✗ Dose Missed"}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono-tech mt-1">
                    Suppresses hepatic output
                  </span>
                </div>
              ) : (
                <div className="p-3 border border-slate-200 bg-white">
                  <div className="flex justify-between text-xs font-medium text-slate-800">
                    <span>Insulin Bolus</span>
                    <span className="font-mono-tech font-bold text-blue-700">{bolus.toFixed(1)} U</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={bolus}
                    onChange={(e) => setBolus(Number(e.target.value))}
                    className="w-full mt-2 accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono-tech text-slate-400 mt-1">
                    <span>0 U</span>
                    <span>10 U</span>
                  </div>
                </div>
              )}

              {/* Slider 3: Walking / Activity */}
              <div className="p-3 border border-slate-200 bg-white">
                <div className="flex justify-between text-xs font-medium text-slate-800">
                  <span>Post-Meal Walk</span>
                  <span className="font-mono-tech font-bold text-emerald-700">{walk} min</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="5"
                  value={walk}
                  onChange={(e) => setWalk(Number(e.target.value))}
                  className="w-full mt-2 accent-emerald-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono-tech text-slate-400 mt-1">
                  <span>0m</span>
                  <span>60m (GLUT-4)</span>
                </div>
              </div>
            </div>

            {/* Dual-Curve Trajectory Simulation Canvas */}
            <div
              id="tutorial-patient-chart"
              className="mt-4 border border-slate-200 p-3 bg-white"
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-medium text-slate-900">
                  Dual-Trajectory 2-Hour Physiological Projection
                </span>
                <div className="flex items-center gap-3 text-[11px] font-mono-tech">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-3 h-0.5 bg-slate-400 inline-block stroke-dasharray" />
                    Baseline (Do Nothing)
                  </span>
                  <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                    <span className="w-3 h-0.5 bg-blue-600 inline-block" />
                    Simulated Intervention
                  </span>
                </div>
              </div>

              <svg className="w-full h-auto overflow-visible" viewBox={`0 0 ${chartW} ${chartH}`}>
                {/* Green Safe Target Zone Band (70 - 140 mg/dL) */}
                <rect
                  x={pLeft}
                  y={getY(140)}
                  width={plotW}
                  height={Math.max(0, getY(70) - getY(140))}
                  fill="#10B981"
                  fillOpacity="0.08"
                />

                {/* Y Axis Guide Lines */}
                {(maxY > 350 ? [maxY, 300, 250, 180, 140, 70] : [300, 250, 180, 140, 70]).map((val) => {
                  const y = getY(val);
                  return (
                    <g key={val}>
                      <line x1={pLeft} y1={y} x2={pLeft + plotW} y2={y} stroke="#F1F5F9" strokeWidth="1" />
                      <text x={pLeft - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono-tech fill-slate-400">
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Baseline Trajectory (Dashed Gray) */}
                <path d={baseD} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="4 3" />

                {/* Simulated Trajectory (Solid Blue) */}
                <path d={simD} fill="none" stroke="#2563EB" strokeWidth="2.6" />

                {/* Horizon Nodes */}
                {xPts.map((x, i) => (
                  <g key={i}>
                    {/* Simulated Dot */}
                    <circle cx={x} cy={simYPts[i]} r="4.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
                    <text x={x} y={simYPts[i] - 8} textAnchor="middle" className="text-[11px] font-mono-tech font-bold fill-blue-700">
                      {Math.round(simCurve[i])}
                    </text>

                    {/* Baseline Dot */}
                    <circle cx={x} cy={baseYPts[i]} r="3" fill="#94A3B8" />
                  </g>
                ))}

                {/* Peak Marker Annotation */}
                <text
                  x={xPts[2]}
                  y={simYPts[2] - 22}
                  textAnchor="middle"
                  className="text-[10px] font-mono-tech font-bold fill-amber-700 bg-white"
                >
                  Peak {Math.round(peakSimVal)} mg/dL @ +60m
                </text>

                {/* X Axis Labels */}
                <g transform={`translate(0, ${pTop + plotH + 18})`}>
                  <text x={xPts[0]} textAnchor="middle" className="text-[11px] font-sans font-medium fill-slate-800">Now</text>
                  <text x={xPts[1]} textAnchor="middle" className="text-[11px] font-sans fill-slate-500">+30 min</text>
                  <text x={xPts[2]} textAnchor="middle" className="text-[11px] font-sans fill-slate-500">+60 min</text>
                  <text x={xPts[3]} textAnchor="end" className="text-[11px] font-sans fill-slate-500">+120 min</text>
                </g>
              </svg>
            </div>

            {/* Safety Check & Clinical Guidance Panel */}
            <div className="mt-4 border border-slate-200 p-3.5 bg-slate-50/60">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-[11px] font-mono-tech uppercase font-bold px-2 py-0.5 border ${
                    isSafe
                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                      : isHypoDanger
                      ? "bg-rose-100 text-[#8F1D21] border-rose-300"
                      : "bg-amber-100 text-amber-900 border-amber-300"
                  }`}
                >
                  {isSafe ? "✓ Safe Target" : isHypoDanger ? "⚠ Hypo Danger (<70)" : "⚡ Hyper Spike (>220)"}
                </span>
                <span className="text-xs font-semibold text-slate-900">
                  Simulation Outcome Analysis
                </span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed font-normal">
                {whatIf?.clinical_recommendation ||
                  "Adjust sliders to project glycemic response."}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] font-mono-tech text-slate-500 flex justify-between">
            <span>ISF/ICR Fitted Kinetics</span>
            <span>Net Delta: {whatIf ? (whatIf.simulated_trajectory[2] - whatIf.baseline_trajectory[2]).toFixed(1) : "0"} mg/dL</span>
          </div>
        </section>

        {/* ── Column 3: Indian Nutrition & Meal Calculator (27% width) ── */}
        <section
          id="tutorial-patient-diet"
          className="w-full lg:w-[27%] p-6 flex flex-col justify-between bg-white"
        >
          <div>
            <div className="border-b border-slate-200 pb-3">
              <h2 className="font-editorial text-xl font-normal text-slate-900 tracking-tight">
                Today's Meal Calculator
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculate carbohydrate impact of common Indian dietary staples.
              </p>
            </div>

            {/* Food Items Multiplier List */}
            <div className="mt-4 space-y-2.5">
              {Object.entries(baseMacros).map(([food, macro]) => {
                const currentMult = multipliers[food] || 0;
                const capitalized = food.charAt(0).toUpperCase() + food.slice(1);
                return (
                  <div
                    key={food}
                    className="p-2.5 border border-slate-200 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-900 block">
                        {capitalized}
                      </span>
                      <span className="text-[10px] font-mono-tech text-slate-500">
                        {macro.carbs}g C · {macro.protein}g P · {macro.fat}g F
                      </span>
                    </div>

                    {/* Step Multipliers */}
                    <div className="flex items-center gap-1 font-mono-tech text-xs">
                      {[0, 0.5, 1, 1.5, 2].map((m) => (
                        <button
                          key={m}
                          onClick={() => setMultipliers((prev) => ({ ...prev, [food]: m }))}
                          className={`px-1.5 py-0.5 border text-[10px] ${
                            currentMult === m
                              ? "bg-slate-900 text-white border-slate-900 font-bold"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {m === 0 ? "0" : m === 0.5 ? "½" : `${m}x`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Macro Summary Strip */}
            <div className="mt-5 border border-slate-200 p-3 bg-slate-50">
              <span className="text-xs font-semibold text-slate-900 block mb-2">
                Cumulative Meal Macros
              </span>
              <div className="grid grid-cols-3 gap-2 text-center font-mono-tech">
                <div className="p-1.5 bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Carbs</span>
                  <span className="text-base font-bold text-blue-700">{Math.round(mealTotals.carbs)}g</span>
                </div>
                <div className="p-1.5 bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Protein</span>
                  <span className="text-base font-bold text-emerald-700">{Math.round(mealTotals.protein)}g</span>
                </div>
                <div className="p-1.5 bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Fat</span>
                  <span className="text-base font-bold text-amber-700">{Math.round(mealTotals.fat)}g</span>
                </div>
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={applyMeal}
              className="w-full mt-3 py-2 text-xs font-mono-tech font-bold uppercase tracking-wider bg-slate-900 text-white hover:bg-slate-800 transition-colors border border-slate-900 rounded-none cursor-pointer"
            >
              Apply {Math.round(mealTotals.carbs)}g Carbs to Simulator →
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] font-mono-tech text-slate-400">
            Nutrition Database: ICMR-NIN Food Composition Tables
          </div>
        </section>
      </main>

      {/* ── Interactive 5-Step Guided Patient Dashboard Tour ── */}
      <DashboardTutorial
        steps={PATIENT_TUTORIAL_STEPS}
        isOpen={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        tutorialTitle="Patient Companion Tour"
        storageKey="kiko_patient_tutorial_seen"
      />
    </div>
  );
}
