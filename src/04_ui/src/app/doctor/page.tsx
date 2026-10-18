"use client";

import React, { useState, useEffect } from "react";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import PatientRoster, { Patient } from "@/components/doctor/PatientRoster";
import PatientProfileCard, { PatientEHR } from "@/components/doctor/PatientProfileCard";
import AdverseRiskCard from "@/components/doctor/AdverseRiskCard";
import ForecastCard, { TwinForecast } from "@/components/doctor/ForecastCard";
import TelemetryChart, { TelemetryRecord } from "@/components/telemetry/TelemetryChart";
import CDSSActionCard, { CDSSAlert } from "@/components/doctor/CDSSActionCard";

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
  const [liveStreaming, setLiveStreaming] = useState<boolean>(false);

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

    const timer = setInterval(async () => {
      try {
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
      } catch (err) {
        console.error("Live streaming tick failed:", err);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [selectedId, liveStreaming]);

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
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Header: Logo + 'Kiko' in Editorial Serif | Monospace Timestamp & Live Controller */}
      <DoctorHeader
        selectedPatientId={selectedId}
        selectedPatientName={ehr?.name}
        liveStreaming={liveStreaming}
        onToggleLive={() => setLiveStreaming((prev) => !prev)}
        onTick={handleManualTick}
      />

      {/* Main Edge-to-Edge Grid (Zero gaps, continuous 1px dividing borders) */}
      <main className="flex-1 flex flex-col lg:flex-row w-full">
        {/* Column 1: Patient Roster (20% width) */}
        <section className="w-full lg:w-[20%] border-r border-slate-200 flex flex-col">
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

        {/* Remaining 80% area */}
        <section className="w-full lg:w-[80%] flex flex-col">
          {/* Deck 1: Patient Profile (62.5%) | Adverse Event Risk (37.5%) */}
          <div className="flex flex-col lg:flex-row border-b border-slate-200">
            <div className="w-full lg:w-[62.5%] border-r border-slate-200 flex flex-col">
              <PatientProfileCard
                ehr={ehr}
                currentGlucose={forecast?.current_glucose}
                stream={stream}
              />
            </div>
            <div className="w-full lg:w-[37.5%] flex flex-col">
              <AdverseRiskCard
                adverseRiskProb={forecast?.adverse_risk_prob}
                hyperRiskHigh={(forecast?.forecast?.t_plus_60min || 0) > 220}
              />
            </div>
          </div>

          {/* Deck 2: Live Telemetry Chart (62.5%) | 2-Hour Predictive Trajectory (37.5%) */}
          <div className="flex flex-col lg:flex-row border-b border-slate-200">
            <div className="w-full lg:w-[62.5%] border-r border-slate-200 flex flex-col">
              <TelemetryChart
                stream={stream}
                currentGlucose={forecast?.current_glucose}
              />
            </div>
            <div className="w-full lg:w-[37.5%] flex flex-col">
              <ForecastCard
                forecast={forecast}
                stream={stream}
              />
            </div>
          </div>

          {/* Deck 3: Clinical Decision Support System (CDSS) Action Center */}
          <div className="w-full flex flex-col">
            <CDSSActionCard
              patientId={selectedId}
              alerts={cdssAlerts}
              onAcknowledge={handleAcknowledgeAlert}
              onDismiss={handleDismissAlert}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
