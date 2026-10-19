"use client";

import React from "react";

export interface Patient {
  patient_id: string;
  name: string;
  age: number;
  gender: string;
  city: string;
  hba1c: number;
  diabetes_type?: string;
  risk_tier: string;
  hypo_unawareness: boolean;
  cgm_device: string;
  delivery_system: string;
  latest_glucose: number;
  trend: string;
  alert_level: string;
  adverse_risk_prob: number;
}

interface PatientRosterProps {
  patients: Patient[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  cohortFilter: "ALL" | "T1D" | "T2D";
  setCohortFilter: (filter: "ALL" | "T1D" | "T2D") => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loading: boolean;
}

export default function PatientRoster({
  patients,
  selectedId,
  setSelectedId,
  cohortFilter,
  setCohortFilter,
  searchQuery,
  setSearchQuery,
  loading,
}: PatientRosterProps) {
  // Helper to distinguish Type 1 vs Type 2
  const isType1 = (p: Patient) => {
    if (p.diabetes_type) return p.diabetes_type === "Type 1";
    return p.patient_id.startsWith("T1D");
  };

  const countAll = patients.length;
  const countT1 = patients.filter(isType1).length;
  const countT2 = patients.filter((p) => !isType1(p)).length;

  const filtered = patients.filter((p) => {
    const isT1 = isType1(p);
    if (cohortFilter === "T1D" && !isT1) return false;
    if (cohortFilter === "T2D" && isT1) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.patient_id.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const tiersConfig = [
    {
      key: "Critical",
      label: "CRITICAL TRIAGE",
      badgeColor: "bg-rose-100 text-[#8F1D21] border-rose-300",
      dotColor: "bg-[#DC2626]",
      match: (p: Patient) => p.risk_tier === "Critical",
    },
    {
      key: "High",
      label: "HIGH PRIORITY",
      badgeColor: "bg-amber-100 text-amber-900 border-amber-300",
      dotColor: "bg-[#F59E0B]",
      match: (p: Patient) => p.risk_tier === "High",
    },
    {
      key: "Moderate",
      label: "MODERATE / STABLE",
      badgeColor: "bg-slate-100 text-slate-800 border-slate-300",
      dotColor: "bg-[#10B981]",
      match: (p: Patient) =>
        p.risk_tier === "Low" ||
        p.risk_tier === "Controlled" ||
        p.risk_tier === "Moderate",
    },
  ];

  const getTrendIcon = (t: string) => {
    switch (t) {
      case "RISING_FAST":
      case "RISING":
        return "↗";
      case "FALLING_FAST":
      case "FALLING":
        return "↘";
      default:
        return "→";
    }
  };

  return (
    <div className="w-full h-full p-4 bg-white flex flex-col select-none rounded-none min-h-0 overflow-hidden">
      {/* 1. Header Title & Count Info */}
      <div className="pb-2.5 mb-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-normal text-slate-900 tracking-tight">
            Patient roster
          </h2>
          <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-400">
            {filtered.length} OF {patients.length} SHOWN
          </span>
        </div>
      </div>

      {/* 2. Search Input Bar */}
      <div className="relative mb-2.5">
        <svg
          className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Filter by name, ID, or tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-none pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-500 font-sans"
        />
      </div>

      {/* 3. Filter Tabs: ALL (15) | T1D (8) | T2D (7) */}
      <div className="grid grid-cols-3 gap-1.5 pb-2.5 border-b border-slate-200 text-xs">
        <button
          type="button"
          onClick={() => setCohortFilter("ALL")}
          className={`py-1 px-1.5 text-center text-[11px] font-medium border cursor-pointer transition-colors ${
            cohortFilter === "ALL"
              ? "bg-slate-900 text-white font-bold border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          ALL ({countAll})
        </button>
        <button
          type="button"
          onClick={() => setCohortFilter("T1D")}
          className={`py-1 px-1.5 text-center text-[11px] font-medium border cursor-pointer transition-colors ${
            cohortFilter === "T1D"
              ? "bg-slate-900 text-white font-bold border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          T1D ({countT1})
        </button>
        <button
          type="button"
          onClick={() => setCohortFilter("T2D")}
          className={`py-1 px-1.5 text-center text-[11px] font-medium border cursor-pointer transition-colors ${
            cohortFilter === "T2D"
              ? "bg-slate-900 text-white font-bold border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          T2D ({countT2})
        </button>
      </div>

      {/* 4. Structured Patient Cards Feed by Triage Category */}
      <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-1 min-h-0">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400 font-sans">
            Loading triage cohort...
          </div>
        ) : (
          tiersConfig.map((tier) => {
            const tierPatients = filtered.filter(tier.match);
            if (tierPatients.length === 0) return null;

            return (
              <div key={tier.key} className="space-y-1.5">
                {/* Tier Subheader with Dot & Count */}
                <div className="flex items-center justify-between px-1 text-[10px] font-sans text-slate-600">
                  <div className="flex items-center space-x-1.5">
                    <span className={`w-1.5 h-1.5 rounded-none ${tier.dotColor}`} />
                    <span className="font-bold uppercase tracking-wider">{tier.label}</span>
                  </div>
                  <span className="font-semibold text-slate-400">({tierPatients.length})</span>
                </div>

                {/* Patient Rich Cards */}
                <div className="space-y-1.5">
                  {tierPatients.map((p) => {
                    const isSelected = p.patient_id === selectedId;
                    const glucoseVal = Math.round(p.latest_glucose || 140);
                    const isHypo = glucoseVal < 70;
                    const isHyper = glucoseVal > 180;

                    return (
                      <div
                        key={p.patient_id}
                        onClick={() => setSelectedId(p.patient_id)}
                        className={`p-2.5 border cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? "bg-slate-50 border-slate-400 border-l-[3px] border-l-slate-900 shadow-xs"
                            : "bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        {/* Top Line: Name + Patient ID + CGM Reading */}
                        <div className="flex items-baseline justify-between gap-1">
                          <div className="flex items-baseline gap-1.5 truncate">
                            <span className="text-xs font-bold truncate text-slate-950 font-sans">
                              {p.name}
                            </span>
                            <span className={`text-[10px] font-mono ${isSelected ? "text-slate-600 font-medium" : "text-slate-400"}`}>
                              {p.patient_id}
                            </span>
                          </div>

                          {/* Glucose Reading + Trend */}
                          <div className="flex items-baseline gap-0.5 shrink-0 font-sans">
                            <span
                              className={`text-xs font-bold ${
                                isHypo
                                  ? "text-rose-600"
                                  : isHyper
                                  ? "text-amber-600"
                                  : "text-slate-900"
                              }`}
                            >
                              {glucoseVal}
                            </span>
                            <span className={`text-[11px] font-bold ${
                              isHypo
                                ? "text-rose-600"
                                : isHyper
                                ? "text-amber-600"
                                : "text-slate-700"
                            }`}>
                              {getTrendIcon(p.trend)}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Line: Tags e.g. EHR · CGM | HbA1c */}
                        <div className="mt-1 flex items-center justify-between text-[10px] font-sans">
                          <span className="px-1.5 py-0.5 border bg-white border-slate-200 text-slate-600 font-medium">
                            EHR · CGM
                          </span>
                          <span className={`text-[10px] ${isSelected ? "text-slate-700 font-medium" : "text-slate-500"}`}>
                            HbA1c {p.hba1c}% · {p.risk_tier === "Critical" ? "Critical" : p.risk_tier === "High" ? "Elev. High" : "Controlled"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
