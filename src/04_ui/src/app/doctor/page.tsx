"use client";

import React, { useState, useEffect } from "react";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import PatientRoster, { Patient } from "@/components/doctor/PatientRoster";
import { PatientEHR, TwinForecast, TelemetryRecord } from "@/types/clinical";
import DashboardTutorial, { TutorialStep } from "@/components/common/DashboardTutorial";

// New Redesigned Clinical Dashboard Sections
import PatientHeaderSection from "@/components/doctor/PatientHeaderSection";
import HeroKPISection from "@/components/doctor/HeroKPISection";
import NowAndNextSection from "@/components/doctor/NowAndNextSection";
import GlycaemicSummarySection from "@/components/doctor/GlycaemicSummarySection";
import TypicalDaySection from "@/components/doctor/TypicalDaySection";
import MealResponseSection from "@/components/doctor/MealResponseSection";
import ForecastAccuracySection from "@/components/doctor/ForecastAccuracySection";


const DOCTOR_TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetId: "tutorial-roster",
    title: "1. Clinical Triage Roster",
    badge: "COHORT TRIAGE",
    description:
      "Monitors the 15-patient cohort (8 Type 1 and 7 Type 2) prioritized by Model 2 adverse crisis risk. Categorized into Critical Triage, Elevated Risk, and Stable In-Range with 15-second real-time telemetry synchronization.",
  },
  {
    targetId: "tutorial-header",
    title: "2. Patient Phenotype & Baseline",
    badge: "EHR BIOMETRICS",
    description:
      "Displays clinical baseline phenotype metrics dynamically tailored by diabetes type: ISF, ICR, Basal rate, and HbA1c for Type 1; HOMA-IR, HOMA-β, fasting glucose, and oral medications for Type 2.",
  },
  {
    targetId: "tutorial-hero",
    title: "3. Real-Time Telemetry Hero Strip",
    badge: "STREAMING BIO-IOT",
    description:
      "Four high-frequency bio-IoT vitals: Current CGM with rate-of-change velocity (mg/dL/min), live cardiac pulse with beat-to-beat RR intervals, physical activity step bouts, and active therapy context (Insulin on Board for T1D or Last Meal for T2D).",
  },
  {
    targetId: "tutorial-now-next",
    title: "4. Measured & Predicted Glucose",
    badge: "MODEL 1 TRAJECTORY",
    description:
      "Synchronized timeline with dynamic scale (lowest - 10 to highest + 10). Displays historical continuous CGM, vertical NOW line, forward-looking 2-hour Model 1 predictive forecast with 80% confidence interval, meal drop lines, and aligned cardiac/step panes.",
  },
  {
    targetId: "tutorial-glycaemic",
    title: "5. Longitudinal Glycaemic Summary",
    badge: "14-DAY CONSENSUS",
    description:
      "International consensus sensor analytics: Mean glucose, Glycaemic Variability (CV% with ≤36% target), Time in Range (TIR 70–180 mg/dL, target >70%), TBR, TAR, and continuous stacked AGP distribution bar.",
  },
  {
    targetId: "tutorial-patterns",
    title: "6. Typical Day (Ambulatory Glucose Profile)",
    badge: "24-H MODAL AGP",
    description:
      "Standard 24-hour Ambulatory Glucose Profile (AGP) modal curves showing 5th–95th percentile spread, 25th–75th interquartile range, 50th median trajectory, and clinical target reference lines highlighting diurnal phenomena like dawn spikes.",
  },
  {
    targetId: "tutorial-meals",
    title: "7. Meal Response Analysis",
    badge: "POST-PRANDIAL DYNAMICS",
    description:
      "Tracks real clustered meal ingestion episodes (Breakfast, Lunch, Dinner, Snack) with carbohydrate intake, insulin bolus (T1D) or walk steps (T2D), pre-meal glucose, true peak, minutes to peak, glucose rise (+mg/dL), and back-in-range recovery.",
  },
  {
    targetId: "tutorial-accuracy",
    title: "8. Forecast Accuracy & Validation",
    badge: "HELD-OUT VALIDATED",
    description:
      "Rigorous Model 1 empirical benchmarks evaluated on 50,000 held-out samples: MAE, RMSE, MARD, and Clarke Error Grid Zone A+B (>93%–98% across +30m, +60m, +120m horizons) against persistence, paired with a 24-hour actual vs predicted comparative curve.",
  },
];

export default function DoctorPortal() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string>("T1D-IN-001");
  const [cohortFilter, setCohortFilter] = useState<"ALL" | "T1D" | "T2D">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [ehr, setEhr] = useState<PatientEHR | null>(null);
  const [stream, setStream] = useState<TelemetryRecord[]>([]);
  const [forecast, setForecast] = useState<TwinForecast | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [liveStreaming, setLiveStreaming] = useState<boolean>(true);
  const [liveBpm, setLiveBpm] = useState<number | undefined>(undefined);
  const [liveRr, setLiveRr] = useState<number | undefined>(undefined);
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(false);

  // Check first-time visit to auto-open tutorial
  useEffect(() => {
    if (typeof window !== "undefined") {
      const seen = localStorage.getItem("kiko_doctor_tutorial_seen");
      if (!seen) {
        const timer = setTimeout(() => setTutorialOpen(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Continuous 1-Second Heart Rate Poller & Sliding 60-Second Waveform Buffer
  useEffect(() => {
    if (!selectedId) return;

    // Load initial 60 seconds of 1s pulse history
    async function loadInitialHr() {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/heart-rate/live?seconds=60`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.length > 0) {
            const latest = json.data[json.data.length - 1];
            setLiveBpm(latest.heart_rate);
            setLiveRr(latest.rr_ms);
          }
        }
      } catch (e) {
        // silent
      }
    }
    loadInitialHr();

    // 1-second continuous pulse ticker
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/heart-rate/live?seconds=1`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.length > 0) {
            const latest = json.data[json.data.length - 1];
            setLiveBpm(latest.heart_rate);
            setLiveRr(latest.rr_ms);

          }
        }
      } catch (err) {
        // silent
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedId]);

  // 1. Initial cohort load
  useEffect(() => {
    async function loadCohort() {
      try {
        const res = await fetch("http://127.0.0.1:8000/api/patients");
        const data = await res.json();
        setPatients(data.patients || []);
        if (data.patients && data.patients.length > 0 && !selectedId) {
          setSelectedId(data.patients[0].patient_id);
        }
      } catch (err) {
        console.error("Failed to load patient roster:", err);
      } finally {
        setLoading(false);
      }
    }
    loadCohort();
  }, [selectedId]);

  // Fetch detail for selected patient
  const fetchPatientDetail = async (id: string) => {
    try {
      const [ehrRes, streamRes, forecastRes, analyticsRes] = await Promise.all([
        fetch(`http://127.0.0.1:8000/api/patient/${id}/ehr`),
        fetch(`http://127.0.0.1:8000/api/patient/${id}/stream?points=144`),
        fetch(`http://127.0.0.1:8000/api/patient/${id}/twin-forecast`),
        fetch(`http://127.0.0.1:8000/api/patient/${id}/cdss`),
        fetch(`http://127.0.0.1:8000/api/patient/${id}/analytics`),
      ]);

      if (ehrRes.ok) setEhr(await ehrRes.json());
      if (streamRes.ok) {
        const streamData = await streamRes.json();
        setStream(streamData.data || []);
      }
      if (forecastRes.ok) setForecast(await forecastRes.json());
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }
    } catch (err) {
      console.error("Failed to fetch patient detail:", err);
    }
  };

  // 2. Selected patient initial detail load
  useEffect(() => {
    if (!selectedId) return;
    fetchPatientDetail(selectedId);
  }, [selectedId]);

  // 3. Live telemetry ticker & polling (15-second high-frequency simulation aligned to wall-clock)
  useEffect(() => {
    if (!selectedId || !liveStreaming) return;

    let tickCount = 0;
    let timer: NodeJS.Timeout | null = null;
    let initialTimeout: NodeJS.Timeout | null = null;

    const doTick = async () => {
      try {
        tickCount++;
        // Advance simulation tick by 15 seconds
        await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/stream/tick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        // Pull latest stream, forecast, and analytics
        const [streamRes, forecastRes, analyticsRes] = await Promise.all([
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/stream?points=144`),
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/twin-forecast`),
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/analytics`),
        ]);

        if (streamRes.ok) {
          const streamData = await streamRes.json();
          setStream(streamData.data || []);
        }
        if (forecastRes.ok) setForecast(await forecastRes.json());
        if (analyticsRes.ok) {
          const analyticsData = await analyticsRes.json();
          setAnalytics(analyticsData);
        }

        // Periodically refresh entire cohort roster every 3rd tick (~45s)
        if (tickCount % 3 === 0) {
          const rosterRes = await fetch("http://127.0.0.1:8000/api/patients");
          if (rosterRes.ok) {
            const rosterData = await rosterRes.json();
            if (rosterData.patients) {
              setPatients(rosterData.patients);
            }
          }
        }
      } catch (err) {
        console.error("Live streaming tick failed:", err);
      }
    };

    // Calculate milliseconds until next 15-second grid boundary (:00, :15, :30, :45)
    const now = new Date();
    const secMod = now.getSeconds() % 15;
    const msUntilNext15s = (15 - secMod) * 1000 - now.getMilliseconds();

    initialTimeout = setTimeout(() => {
      doTick();
      timer = setInterval(doTick, 15000);
    }, Math.max(500, msUntilNext15s));

    return () => {
      if (initialTimeout) clearTimeout(initialTimeout);
      if (timer) clearInterval(timer);
    };
  }, [selectedId, liveStreaming]);

  // 4. Dynamically synchronize active patient's roster card with real-time synthetic telemetry
  useEffect(() => {
    if (!selectedId) return;
    const currentG = forecast?.current_glucose || (stream.length > 0 ? stream[stream.length - 1].glucose : null);
    if (currentG === null || isNaN(currentG)) return;

    const currentTrend =
      forecast?.trend ||
      (stream.length >= 2
        ? stream[stream.length - 1].glucose > stream[stream.length - 2].glucose
          ? "RISING"
          : "FALLING"
        : "STABLE");

    setPatients((prev) =>
      prev.map((p) => {
        if (p.patient_id === selectedId) {
          return {
            ...p,
            latest_glucose: Math.round(currentG),
            trend: currentTrend,
            adverse_risk_prob: forecast?.adverse_risk_prob ?? p.adverse_risk_prob,
            risk_tier:
              currentG < 70 || currentG > 250
                ? "Critical"
                : currentG > 180
                ? "High"
                : "Controlled",
          };
        }
        return p;
      })
    );
  }, [selectedId, forecast, stream]);

  // Manual tick handler
  const handleManualTick = async () => {
    if (!selectedId) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/stream/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      fetchPatientDetail(selectedId);
    } catch (err) {
      console.error("Manual tick failed:", err);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-white text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Header: Logo + 'Kiko' | Unboxed Timestamp | Squared Profile Icon with Initials & Hover Logout */}
      <DoctorHeader
        selectedPatientId={selectedId}
        selectedPatientName={ehr?.name}
        onOpenTutorial={() => setTutorialOpen(true)}
      />

      {/* Main Edge-to-Edge Grid (Zero gaps, continuous 1px dividing borders) */}
      <main className="flex-1 flex flex-col lg:flex-row w-full min-h-0 overflow-hidden">
        {/* Column 1: Patient Roster (20% width) - Dedicated full height with internal scroll */}
        <section
          id="tutorial-roster"
          className="w-full lg:w-[20%] h-full border-r border-slate-200 flex flex-col min-h-0 overflow-hidden"
        >
          <PatientRoster
            patients={patients}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            cohortFilter={cohortFilter}
            setCohortFilter={setCohortFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            loading={loading}
          />
        </section>

        {/* Remaining area - Clean scrollable canvas without trailing void */}
        <section className="w-full lg:w-[80%] h-full flex flex-col min-h-0 overflow-y-auto bg-white divide-y divide-slate-200">
          {/* 1. Patient Header & 6 Clinical Baseline Metrics */}
          <div id="tutorial-header">
            <PatientHeaderSection
              name={analytics?.name || ehr?.name}
              demographicsSummary={analytics?.demographics?.summary_tag}
              deviceText={analytics?.demographics?.device}
              baselineMetrics={analytics?.baseline_metrics}
            />
          </div>

          {/* 2. Real-Time 4-Card Hero Strip */}
          <div id="tutorial-hero">
            <HeroKPISection
              currentGlucose={
                forecast?.current_glucose ??
                (stream.length > 0 ? stream[stream.length - 1].glucose : 140)
              }
              glucoseRoc={analytics?.hero_kpis?.glucose_roc}
              heartRate={
                liveBpm ??
                (stream.length > 0 ? stream[stream.length - 1].heart_rate : 72)
              }
              heartRateState={analytics?.hero_kpis?.heart_rate_state}
              lastHourSteps={analytics?.hero_kpis?.last_hour_steps ?? 0}
              stepsState={analytics?.hero_kpis?.steps_state}
              therapyKpi={analytics?.hero_kpis?.therapy_kpi}
            />
          </div>

          {/* 3. Section 01: Measured and predicted glucose */}
          <div id="tutorial-now-next">
            <NowAndNextSection
              stream={stream}
              forecast={forecast}
              currentGlucose={forecast?.current_glucose}
            />
          </div>

          {/* 4. Section 02: Glycaemic summary */}
          <div id="tutorial-glycaemic">
            <GlycaemicSummarySection
              summary={analytics?.glycaemic_summary}
            />
          </div>

          {/* 5. Section 03: Typical day (Ambulatory Glucose Profile & 4 Diurnal Tabs) */}
          <div id="tutorial-patterns">
            <TypicalDaySection
              agpData={analytics?.agp_profile}
              agpNote={analytics?.agp_note}
              typicalDay={analytics?.typical_day}
            />
          </div>

          {/* 6. Section 04: Meal response table */}
          <div id="tutorial-meals">
            <MealResponseSection
              meals={analytics?.meal_responses}
              averageRise={analytics?.average_rise}
              summaryNote={analytics?.meal_summary_note}
              diabetesType={analytics?.diabetes_type || ehr?.diabetes_type}
            />
          </div>

          {/* 7. Section 05: Forecast accuracy for this patient */}
          <div id="tutorial-accuracy">
            <ForecastAccuracySection
              validationCurve={analytics?.validation_curve}
              accuracyTable={analytics?.validation?.accuracy_table}
              badge={analytics?.validation?.badge || "HELD-OUT VALIDATED"}
              isPlaceholder={analytics?.validation?.is_placeholder ?? false}
            />
          </div>


          
        </section>
      </main>

      {/* ── Interactive 6-Step Guided Doctor Dashboard Tour ── */}
      <DashboardTutorial
        steps={DOCTOR_TUTORIAL_STEPS}
        isOpen={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        tutorialTitle="Doctor Clinical Triage Tour"
        storageKey="kiko_doctor_tutorial_seen"
      />
    </div>
  );
}
