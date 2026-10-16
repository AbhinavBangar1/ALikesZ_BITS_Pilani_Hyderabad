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
    const lastNum = parseInt(p.patient_id.split("-").pop() || "0", 10);
    return lastNum <= 8;
  };

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
      label: "Critical",
      dotColor: "bg-[#DC2626]",
      match: (p: Patient) => p.risk_tier === "Critical",
    },
    {
      key: "High",
      label: "High",
      dotColor: "bg-[#F59E0B]",
      match: (p: Patient) => p.risk_tier === "High",
    },
    {
      key: "Controlled",
      label: "Controlled",
      dotColor: "bg-[#10B981]",
      match: (p: Patient) => p.risk_tier === "Low" || p.risk_tier === "Controlled" || p.risk_tier === "Moderate",
    },
  ];

  return (
    <div className="w-full h-full p-5 bg-white flex flex-col select-none">
      {/* 1. Search Input Bar */}
      <div className="relative mb-4">
        <svg
          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400"
        />
      </div>

      {/* 2. Tabs: All | Type 1 | Type 2 (No 'Cohort' text) */}
      <div className="flex items-center space-x-6 pb-2 border-b border-slate-200 text-xs">
        <button
          type="button"
          onClick={() => setCohortFilter("ALL")}
          className={`pb-1.5 transition-colors cursor-pointer ${
            cohortFilter === "ALL"
              ? "font-bold text-slate-900 border-b-2 border-slate-900"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setCohortFilter("T1D")}
          className={`pb-1.5 transition-colors cursor-pointer ${
            cohortFilter === "T1D"
              ? "font-bold text-slate-900 border-b-2 border-slate-900"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Type 1
        </button>
        <button
          type="button"
          onClick={() => setCohortFilter("T2D")}
          className={`pb-1.5 transition-colors cursor-pointer ${
            cohortFilter === "T2D"
              ? "font-bold text-slate-900 border-b-2 border-slate-900"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Type 2
        </button>
      </div>

      {/* 3. Tiers & Plain Patient Names List (No dots before names, no cards, no metadata) */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-4">
        {loading ? (
          <div className="py-6 text-xs text-slate-400 font-mono-tech">Loading...</div>
        ) : (
          tiersConfig.map((tier) => {
            const tierPatients = filtered.filter(tier.match);
            if (tierPatients.length === 0) return null;

            return (
              <div key={tier.key} className="space-y-2">
                {/* Tier Category with Colored Dot */}
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${tier.dotColor}`}></span>
                  <span className="text-xs font-bold text-slate-900">{tier.label}</span>
                </div>

                {/* Patient Names List (Plain text, clickable) */}
                <div className="pl-4 space-y-1.5">
                  {tierPatients.map((p) => {
                    const isSelected = p.patient_id === selectedId;
                    return (
                      <div
                        key={p.patient_id}
                        onClick={() => setSelectedId(p.patient_id)}
                        className={`text-xs cursor-pointer transition-colors py-0.5 truncate ${
                          isSelected
                            ? "font-bold text-slate-900"
                            : "text-slate-600 hover:text-slate-900 font-normal"
                        }`}
                      >
                        {p.name}
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
