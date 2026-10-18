"use client";

import React, { useState, useEffect } from "react";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import PatientRoster, { Patient } from "@/components/doctor/PatientRoster";
import PatientProfileCard, { PatientEHR } from "@/components/doctor/PatientProfileCard";
import AdverseRiskCard from "@/components/doctor/AdverseRiskCard";
import ForecastCard, { TwinForecast } from "@/components/doctor/ForecastCard";
import TelemetryChart, { TelemetryRecord, LiveHrPoint } from "@/components/telemetry/TelemetryChart";
import CDSSActionCard, { CDSSAlert } from "@/components/doctor/CDSSActionCard";
import DashboardTutorial, { TutorialStep } from "@/components/common/DashboardTutorial";

const DOCTOR_TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetId: "tutorial-roster",
    title: "1. Clinical Triage Roster",
    badge: "PATIENT COHORT",
    description:
      "Displays all 15 cohort patients ranked dynamically by risk severity (Critical → High → Moderate → Low). Glucose readings and alert badges synchronize every 15 seconds. Selecting any patient loads their active physiological digital twin.",
    tip: "Patients with acute hypoglycemia (<70 mg/dL) or ketoacidosis danger (>250 mg/dL) automatically rise to the top.",
  },
  {
    targetId: "tutorial-profile",
    title: "2. Patient Clinical Phenotype",
    badge: "EHR & BIOMETRICS",
    description:
      "Combines longitudinal Synthea EHR medical history with real-time biometric metrics: HbA1c, HOMA-IR / HOMA-β resistance indices, sensor lag, delivery system (AID closed-loop vs MDI), and target Time-in-Range (TIR).",
    tip: "Demographics are culturally calibrated to Indian phenotypes with custom insulin sensitivity parameters.",
  },
  {
    targetId: "tutorial-telemetry",
    title: "3. Multi-Modal Telemetry & Ingestion",
    badge: "STREAMING BIO-IOT",
    description:
      "A synchronized dual-plot streaming canvas: the upper curve charts continuous 15-second CGM glucose with amber meal ingestion pins (🍽 Carbs · 💉 Bolus); the lower curve renders 1-second cardiovascular telemetry with step cadence.",
    tip: "Hover anywhere on the curve to inspect synchronized glucose, instantaneous HR, and exact meal consumption grams.",
  },
  {
    targetId: "tutorial-risk",
    title: "4. Adverse Event Risk Gauge",
    badge: "MODEL 2 ENSEMBLE",
    description:
      "NIH DCLP3-validated XGBoost/Bi-LSTM adverse classifier (AUROC 0.944). Calculates the acute probability of severe hypoglycemia (<54 mg/dL) or acute hyperglycemia (>250 mg/dL) within the upcoming 2-hour window.",
    tip: "When adverse risk exceeds 65%, automated CDSS alert patterns are triggered immediately.",
  },
  {
    targetId: "tutorial-trajectory",
    title: "5. 2-Hour Predictive Trajectory",
    badge: "MODEL 1 FORECAST",
    description:
      "A physiological multi-horizon forecast engine projecting expected plasma glucose curves at +30m, +60m, and +120m horizons mapped directly against the target safe zone (70–140 mg/dL).",
    tip: "Provides clinical early warnings up to two hours before physical symptoms or rebound spikes manifest.",
  },
  {
    targetId: "tutorial-cdss",
    title: "6. CDSS Action Center",
    badge: "DECISION SUPPORT",
    description:
      "Clinical Decision Support System continuously evaluates sensor telemetry for dangerous patterns (nocturnal dips, postprandial runaway, missed boluses). Clinicians can Acknowledge or Dismiss interventions directly.",
    tip: "Acknowledging an alert updates the patient's care record and logs the clinical decision in the audit trail.",
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
  const [cdssAlerts, setCdssAlerts] = useState<CDSSAlert[]>([]);
  const [liveStreaming, setLiveStreaming] = useState<boolean>(true);
  const [liveBpm, setLiveBpm] = useState<number | undefined>(undefined);
  const [liveRr, setLiveRr] = useState<number | undefined>(undefined);
  const [liveHrHistory, setLiveHrHistory] = useState<LiveHrPoint[]>([]);
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
            setLiveHrHistory(json.data);
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
            setLiveHrHistory((prev) => {
              const next = [...prev, latest];
              return next.slice(-60);
            });
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
      const [ehrRes, streamRes, forecastRes, cdssRes] = await Promise.all([
        fetch(`http://127.0.0.1:8000/api/patient/${id}/ehr`),
        fetch(`http://127.0.0.1:8000/api/patient/${id}/stream?points=80`),
        fetch(`http://127.0.0.1:8000/api/patient/${id}/twin-forecast`),
        fetch(`http://127.0.0.1:8000/api/patient/${id}/cdss`),
      ]);

      if (ehrRes.ok) setEhr(await ehrRes.json());
      if (streamRes.ok) {
        const streamData = await streamRes.json();
        setStream(streamData.data || []);
      }
      if (forecastRes.ok) setForecast(await forecastRes.json());
      if (cdssRes.ok) {
        const cdssData = await cdssRes.json();
        setCdssAlerts(cdssData.alerts || []);
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

  // 3. Live telemetry ticker & polling (15-second high-frequency simulation)
  useEffect(() => {
    if (!selectedId || !liveStreaming) return;

    let tickCount = 0;
    const timer = setInterval(async () => {
      try {
        tickCount++;
        // Advance simulation tick by 15 seconds
        await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/stream/tick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        // Pull latest stream, forecast, and CDSS alerts
        const [streamRes, forecastRes, cdssRes] = await Promise.all([
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/stream?points=80`),
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/twin-forecast`),
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/cdss`),
        ]);

        if (streamRes.ok) {
          const streamData = await streamRes.json();
          setStream(streamData.data || []);
        }
        if (forecastRes.ok) setForecast(await forecastRes.json());
        if (cdssRes.ok) {
          const cdssData = await cdssRes.json();
          setCdssAlerts(cdssData.alerts || []);
        }

        // Periodically refresh entire cohort roster every 3rd tick (~9s)
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
    }, 3000);

    return () => clearInterval(timer);
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

  // CDSS Action Handlers
  const handleAcknowledgeAlert = async (patternId: string) => {
    try {
      await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/cdss/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern_id: patternId }),
      });
      const res = await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/cdss`);
      if (res.ok) {
        const cdssData = await res.json();
        setCdssAlerts(cdssData.alerts || []);
      }
    } catch (err) {
      console.error("Failed to acknowledge CDSS alert:", err);
    }
  };

  const handleDismissAlert = async (patternId: string) => {
    try {
      await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/cdss/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern_id: patternId }),
      });
      const res = await fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/cdss`);
      if (res.ok) {
        const cdssData = await res.json();
        setCdssAlerts(cdssData.alerts || []);
      }
    } catch (err) {
      console.error("Failed to dismiss CDSS alert:", err);
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

        {/* Remaining 80% area - Clean scrollable canvas without trailing void */}
        <section className="w-full lg:w-[80%] h-full flex flex-col min-h-0 overflow-y-auto">
          {/* Deck 1: Patient Profile (62.5%) | Adverse Event Risk (37.5%) */}
          <div className="flex flex-col lg:flex-row border-b border-slate-200 shrink-0">
            <div
              id="tutorial-profile"
              className="w-full lg:w-[62.5%] border-r border-slate-200 flex flex-col"
            >
              <PatientProfileCard
                ehr={ehr}
                currentGlucose={forecast?.current_glucose}
                stream={stream}
                liveBpm={liveBpm}
              />
            </div>
            <div
              id="tutorial-risk"
              className="w-full lg:w-[37.5%] flex flex-col"
            >
              <AdverseRiskCard
                adverseRiskProb={forecast?.adverse_risk_prob}
                hyperRiskHigh={(forecast?.forecast?.t_plus_60min || 0) > 220}
              />
            </div>
          </div>

          {/* Deck 2: Live Telemetry Chart (62.5%) | 2-Hour Predictive Trajectory (37.5%) */}
          <div className="flex flex-col lg:flex-row border-b border-slate-200 shrink-0">
            <div
              id="tutorial-telemetry"
              className="w-full lg:w-[62.5%] border-r border-slate-200 flex flex-col"
            >
              <TelemetryChart
                stream={stream}
                liveHrHistory={liveHrHistory}
                currentGlucose={forecast?.current_glucose}
                liveBpm={liveBpm}
                liveRr={liveRr}
              />
            </div>
            <div
              id="tutorial-trajectory"
              className="w-full lg:w-[37.5%] flex flex-col"
            >
              <ForecastCard
                forecast={forecast}
                stream={stream}
              />
            </div>
          </div>

          {/* Deck 3: Clinical Decision Support System (CDSS) Action Center */}
          <div
            id="tutorial-cdss"
            className="w-full flex flex-col shrink-0"
          >
            <CDSSActionCard
              patientId={selectedId}
              alerts={cdssAlerts}
              onAcknowledge={handleAcknowledgeAlert}
              onDismiss={handleDismissAlert}
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
