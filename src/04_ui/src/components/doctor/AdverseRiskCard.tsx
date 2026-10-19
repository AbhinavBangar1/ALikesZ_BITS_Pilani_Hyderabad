"use client";

import React from "react";

interface AdverseRiskCardProps {
  adverseRiskProb?: number;
  hyperRiskHigh?: boolean;
  currentGlucose?: number;
  riskTier?: string;
}

export default function AdverseRiskCard({
  adverseRiskProb = 0.64,
  hyperRiskHigh = false,
  currentGlucose,
  riskTier,
}: AdverseRiskCardProps) {
  /* OLD CODE (Hardcoded to hypoglycemia & separate risk label):
  const hypoPct = Math.round(adverseRiskProb * 100);
  const hyperPct = hyperRiskHigh ? 42 : 4;

  const arcLength = 219.9;
  const clampedProb = Math.min(1, Math.max(0, adverseRiskProb));
  const dashOffset = arcLength * (1 - clampedProb);

  let statusBadge = "Controlled Risk";
  let statusBadgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-300";
  if (hypoPct >= 60) {
    statusBadge = "Critical Low Risk";
    statusBadgeStyle = "bg-rose-50 text-[#8F1D21] border-rose-300";
  } else if (hypoPct >= 35 || hyperPct >= 30) {
    statusBadge = "Elevated Risk";
    statusBadgeStyle = "bg-amber-50 text-amber-900 border-amber-300";
  }
  */

  // NEW LOGIC: Dynamic dominant risk + Unified Roster Triage Scale
  const hypoPct = Math.round((adverseRiskProb || 0) * 100);
  const hyperPct = hyperRiskHigh
    ? 42
    : currentGlucose && currentGlucose > 250
    ? 42
    : currentGlucose && currentGlucose > 180
    ? 24
    : 4;

  // Determine highest/dominant risk to display on main gauge
  const isHyperDominant =
    (currentGlucose && currentGlucose > 180) || hyperPct >= hypoPct;
  const gaugePct = isHyperDominant ? hyperPct : hypoPct;
  const gaugeLabel = isHyperDominant
    ? "chance of high in 2 h"
    : "chance of low in 2 h";
  const gaugeStrokeColor = isHyperDominant ? "#D97706" : "#8F1D21";

  // Arc length for r=70 semicircle: pi * 70 = 219.9
  const arcLength = 219.9;
  const clampedProb = Math.min(1, Math.max(0, gaugePct / 100));
  const dashOffset = arcLength * (1 - clampedProb);

  // Synchronized clinical triage scale matching Patient Roster exactly
  let statusBadge = "Controlled";
  let statusBadgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-300";
  const effectiveTier =
    riskTier ||
    (currentGlucose && (currentGlucose < 70 || currentGlucose > 250)
      ? "Critical"
      : currentGlucose && currentGlucose > 180
      ? "High"
      : "Controlled");

  if (effectiveTier === "Critical") {
    statusBadge = "Critical Triage";
    statusBadgeStyle = "bg-rose-50 text-[#8F1D21] border-rose-300";
  } else if (effectiveTier === "High") {
    statusBadge = "High Priority";
    statusBadgeStyle = "bg-amber-50 text-amber-900 border-amber-300";
  } else if (effectiveTier === "Moderate") {
    statusBadge = "Moderate Priority";
    statusBadgeStyle = "bg-blue-50 text-blue-900 border-blue-300";
  } else {
    statusBadge = "Controlled";
    statusBadgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-300";
  }

  return (
    <div className="w-full h-full bg-white hover:bg-slate-50/30 transition-colors duration-200 flex flex-col justify-between select-none rounded-none">
      {/* Title Header with Model 2 Validation Badge */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between">
          {/* OLD: <h2 className="font-editorial text-xl font-normal text-slate-900 tracking-tight">Adverse Event Risk</h2> */}
          <h2 className="font-sans text-lg font-bold text-slate-900 tracking-tight">
            Adverse Event Risk
          </h2>
          {/* OLD: <span className={`text-[11px] font-mono-tech px-2 py-0.5 border ${statusBadgeStyle}`}> */}
          <span className={`text-[11px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 border ${statusBadgeStyle}`}>
            {statusBadge}
          </span>
        </div>

        {/* Clean Semicircular Arch Gauge */}
        <div className="flex flex-col items-center justify-center my-2">
          <div className="w-52 h-28 flex items-center justify-center">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 200 120">
              {/* Neutral Warm Background Track */}
              <path
                d="M 30 105 A 70 70 0 0 1 170 105"
                fill="none"
                stroke="#EEEAE8"
                strokeWidth="14"
              />

              {/* Active Dominant Risk Arch */}
              {gaugePct > 0 && (
                <path
                  d="M 30 105 A 70 70 0 0 1 170 105"
                  fill="none"
                  stroke={gaugeStrokeColor}
                  strokeWidth="14"
                  strokeDasharray={arcLength}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
                />
              )}

              {/* Centered Percentage */}
              <text
                x="100"
                y="85"
                textAnchor="middle"
                className="font-sans"
                style={{ fontSize: "36px", fontWeight: "700", fill: "#0F172A" }}
              >
                {gaugePct}%
              </text>

              {/* Subtitle Label (e.g. chance of high in 2 h vs chance of low in 2 h) */}
              {/* OLD: chance of low in 2 h */}
              <text
                x="100"
                y="105"
                textAnchor="middle"
                className="font-sans font-medium"
                style={{ fontSize: "11px", fill: "#64748B" }}
              >
                {gaugeLabel}
              </text>
            </svg>
          </div>
        </div>

      </div>

      {/* 3 Clinical Breakdown Rows: Edge-to-Edge Full Width, Squared Corners, Invisible Divider Lines */}
      <div className="w-full pb-3 rounded-none">
        {/* 1. Hypoglycaemia (below 70) in Wine Crimson #8F1D21 */}
        <div className="w-full px-6 py-2 hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-900 mb-1">
            <span>Hypoglycaemia (below 70)</span>
            {/* OLD: <span className="font-mono-tech font-bold text-slate-900">{hypoPct}%</span> */}
            <span className="font-sans font-semibold text-slate-900">{hypoPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#EEEAE8] overflow-hidden rounded-none">
            <div
              className="h-full bg-[#8F1D21] transition-all duration-300 rounded-none"
              style={{ width: `${Math.max(hypoPct > 0 ? 3 : 0, hypoPct)}%` }}
            />
          </div>
        </div>

        {/* 2. Hyperglycaemia (above 250) in Amber #D97706 */}
        <div className="w-full px-6 py-2 hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-900 mb-1">
            <span>Hyperglycaemia (above 250)</span>
            {/* OLD: <span className="font-mono-tech font-bold text-slate-900">{hyperPct}%</span> */}
            <span className="font-sans font-semibold text-slate-900">{hyperPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#EEEAE8] overflow-hidden rounded-none">
            <div
              className="h-full bg-[#D97706] transition-all duration-300 rounded-none"
              style={{ width: `${Math.max(hyperPct > 0 ? 3 : 0, hyperPct)}%` }}
            />
          </div>
        </div>

        {/* 3. DKA / Ketone Risk in Coral Orange #C0452F */}
        <div className="w-full px-6 py-2 hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-900 mb-1">
            <span>DKA / Ketone risk</span>
            {/* OLD: <span className="font-mono-tech font-bold text-slate-900">&lt;1%</span> */}
            <span className="font-sans font-semibold text-slate-900">&lt;1%</span>
          </div>
          <div className="w-full h-1.5 bg-[#EEEAE8] overflow-hidden rounded-none">
            <div
              className="h-full bg-[#C0452F] transition-all duration-300 rounded-none"
              style={{ width: "2%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
