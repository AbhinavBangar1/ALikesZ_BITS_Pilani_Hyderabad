"use client";

import React, { useState, useEffect } from "react";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import PatientRoster, { Patient } from "@/components/doctor/PatientRoster";
import PatientProfileCard, { PatientEHR } from "@/components/doctor/PatientProfileCard";
import AdverseRiskCard from "@/components/doctor/AdverseRiskCard";
import ForecastCard, { TwinForecast } from "@/components/doctor/ForecastCard";
import TelemetryChart, { TelemetryRecord } from "@/components/telemetry/TelemetryChart";

export default function DoctorPortal() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string>("T1D-IN-001");
  const [cohortFilter, setCohortFilter] = useState<"ALL" | "T1D" | "T2D">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [ehr, setEhr] = useState<PatientEHR | null>(null);
  const [stream, setStream] = useState<TelemetryRecord[]>([]);
  const [forecast, setForecast] = useState<TwinForecast | null>(null);

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

  // 2. Selected patient detail load
  useEffect(() => {
    if (!selectedId) return;

    async function fetchPatientDetail() {
      try {
        const [ehrRes, streamRes, forecastRes] = await Promise.all([
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/ehr`),
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/stream?points=72`),
          fetch(`http://127.0.0.1:8000/api/patient/${selectedId}/twin-forecast`),
        ]);

        if (ehrRes.ok) setEhr(await ehrRes.json());
        if (streamRes.ok) {
          const streamData = await streamRes.json();
          setStream(streamData.data || []);
        }
        if (forecastRes.ok) setForecast(await forecastRes.json());
      } catch (err) {
        console.error("Failed to fetch patient detail:", err);
      }
    }

    fetchPatientDetail();
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans antialiased">
      {/* Top Header: Logo + 'Kiko infinity' | Monospace Timestamp */}
      <DoctorHeader />

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

        {/* Remaining 80% area: Structured into 2 synchronized rows so the horizontal divider is 100% equal */}
        <section className="w-full lg:w-[80%] flex flex-col">
          {/* Top Row: Patient Profile (50% of screen = 62.5% of 80%) | Adverse Event Risk (30% of screen = 37.5% of 80%) */}
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

          {/* Bottom Row: Live Telemetry Chart (62.5%) | 2-Hour Predictive Trajectory (37.5%) */}
          <div className="flex-1 flex flex-col lg:flex-row">
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
        </section>
      </main>
    </div>
  );
}
