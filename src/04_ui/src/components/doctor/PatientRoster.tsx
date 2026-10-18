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
      label: "Critical Triage",
      badgeColor: "bg-rose-100 text-[#8F1D21] border-rose-300",
      dotColor: "bg-[#DC2626]",
      match: (p: Patient) => p.risk_tier === "Critical",
    },
    {
      key: "High",
      label: "High Priority",
      badgeColor: "bg-amber-100 text-amber-900 border-amber-300",
      dotColor: "bg-[#F59E0B]",
      match: (p: Patient) => p.risk_tier === "High",
    },
    {
      key: "Controlled",
      label: "Ambulatory Stable",
      badgeColor: "bg-slate-100 text-slate-800 border-slate-300",
      dotColor: "bg-[#10B981]",
      match: (p: Patient) => p.risk_tier === "Low" || p.risk_tier === "Controlled" || p.risk_tier === "Moderate",
    },
  ];

  const getTrendIcon = (t: string) => {
    switch (t) {
      case "RISING_FAST":
        return "⇈";
      case "RISING":
        return "↑";
      case "FALLING_FAST":
        return "⇊";
      case "FALLING":
        return "↓";
      default:
        return "→";
    }
  };

  return (
    <div className="w-full h-full p-4 bg-white hover:bg-slate-50/20 transition-colors duration-200 flex flex-col select-none rounded-none">
      {/* 1. Header Title & Quick Cohort Info */}
      <div className="pb-3 border-b border-slate-200 mb-3">
        <div className="flex items-center justify-between">
          <h2 className="font-editorial text-lg font-normal text-slate-900 tracking-tight">
            Patient Roster
          </h2>
          <span className="text-[10px] font-mono-tech uppercase tracking-wider text-slate-500">
            {filtered.length} Monitored
          </span>
        </div>
      </div>

      {/* 2. Search Input Bar */}
      <div className="relative mb-3">
        <svg
          className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
          placeholder="Filter by name, ID, or city..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-none pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-500 font-sans"
        />
      </div>

      {/* 3. Filter Tabs: All | Type 1 | Type 2 */}
      <div className="flex items-center space-x-2 pb-2.5 border-b border-slate-200 text-xs rounded-none">
        <button
          type="button"
          onClick={() => setCohortFilter("ALL")}
          className={`pb-1 transition-colors cursor-pointer rounded-none flex items-center gap-1 ${
            cohortFilter === "ALL"
              ? "font-bold text-slate-900 border-b-2 border-slate-900"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-1"
          }`}
        >
          All <span className="text-[10px] font-mono-tech opacity-70">({countAll})</span>
        </button>
        <button
          type="button"
          onClick={() => setCohortFilter("T1D")}
          className={`pb-1 transition-colors cursor-pointer rounded-none flex items-center gap-1 ${
            cohortFilter === "T1D"
              ? "font-bold text-slate-900 border-b-2 border-slate-900"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-1"
          }`}
        >
          T1D <span className="text-[10px] font-mono-tech opacity-70">({countT1})</span>
        </button>
        <button
          type="button"
          onClick={() => setCohortFilter("T2D")}
          className={`pb-1 transition-colors cursor-pointer rounded-none flex items-center gap-1 ${
            cohortFilter === "T2D"
              ? "font-bold text-slate-900 border-b-2 border-slate-900"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-1"
          }`}
        >
          T2D <span className="text-[10px] font-mono-tech opacity-70">({countT2})</span>
        </button>
      </div>

      {/* 4. Structured Patient Cards Feed by Triage Category */}
      <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-0.5">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400 font-mono-tech">
            Loading triage cohort...
          </div>
        ) : (
          tiersConfig.map((tier) => {
            const tierPatients = filtered.filter(tier.match);
            if (tierPatients.length === 0) return null;

            return (
              <div key={tier.key} className="space-y-1.5">
                {/* Tier Subheader with Dot & Count */}
                <div className="flex items-center justify-between px-1 text-[11px] font-mono-tech text-slate-600">
                  <div className="flex items-center space-x-1.5">
                    <span className={`w-1.5 h-1.5 rounded-none ${tier.dotColor}`} />
                    <span className="font-semibold uppercase tracking-wider">{tier.label}</span>
                  </div>
                  <span className="opacity-70">({tierPatients.length})</span>
                </div>

                {/* Patient Rich Cards */}
                <div className="space-y-1">
                  {tierPatients.map((p) => {
                    const isSelected = p.patient_id === selectedId;
                    const isT1 = isType1(p);
                    const glucoseVal = Math.round(p.latest_glucose || 140);
                    const isHypo = glucoseVal < 70;
                    const isHyper = glucoseVal > 180;

                    return (
                      <div
                        key={p.patient_id}
                        onClick={() => setSelectedId(p.patient_id)}
                        className={`p-2.5 border cursor-pointer transition-all duration-150 rounded-none ${
                          isSelected
                            ? "bg-slate-100/90 text-slate-900 border-slate-400 border-l-[3px] border-l-slate-900 shadow-xs"
                            : "bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {/* Top Line: Name + CGM Reading */}
                        <div className="flex items-baseline justify-between gap-1">
                          <div className="flex items-baseline gap-1.5 truncate">
                            <span className="text-xs font-bold truncate text-slate-950">
                              {p.name}
                            </span>
                            <span className={`text-[10px] font-mono-tech ${isSelected ? "text-slate-600 font-medium" : "text-slate-400"}`}>
                              {p.patient_id}
                            </span>
                          </div>

                          {/* Glucose Reading + Trend */}
                          <div className="flex items-baseline gap-1 shrink-0 font-mono-tech">
                            <span
                              className={`text-xs font-bold ${
                                isHypo
                                  ? "text-rose-600"
                                  : isHyper
                                  ? "text-amber-600"
                                  : "text-blue-700"
                              }`}
                            >
                              {glucoseVal}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              mg/dL
                            </span>
                            <span className={`text-[11px] font-bold ${isSelected ? "text-slate-900" : "text-slate-600"}`}>
                              {getTrendIcon(p.trend)}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Line: Condition Pill + Clinical Details */}
                        <div className="mt-1 flex items-center justify-between text-[10px] font-mono-tech">
                          <span
                            className={`px-1.5 py-0.2 border ${
                              isT1
                                ? "bg-blue-50 border-blue-200 text-blue-800"
                                : "bg-emerald-50 border-emerald-200 text-emerald-800"
                            }`}
                          >
                            {isT1 ? "T1D · AID" : "T2D · OHA"}
                          </span>
                          <span className={isSelected ? "text-slate-700 font-medium" : "text-slate-500"}>
                            HbA1c {p.hba1c}% · {p.city}
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
