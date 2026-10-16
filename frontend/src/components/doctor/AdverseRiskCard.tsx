"use client";

import React from "react";

interface AdverseRiskCardProps {
  adverseRiskProb?: number;
  hyperRiskHigh?: boolean;
}

export default function AdverseRiskCard({
  adverseRiskProb = 0.64,
  hyperRiskHigh = false,
}: AdverseRiskCardProps) {
  const hypoPct = Math.round(adverseRiskProb * 100);
  const hyperPct = hyperRiskHigh ? 42 : 3;

  // Arc length for r=68 semicircle: pi * 68 = 213.6
  const arcLength = 213.6;
  const dashOffset = arcLength * (1 - Math.min(1, Math.max(0.02, adverseRiskProb)));

  return (
    <div className="w-full h-full p-6 bg-white flex flex-col justify-between select-none">
      <div>
        {/* Title in Editorial Serif (No 'NEXT 2 HOURS') */}
        <h2 className="font-editorial text-xl font-normal text-slate-900 tracking-tight">
          Adverse Event Risk
        </h2>

        {/* Semicircular Arch Gauge */}
        <div className="flex flex-col items-center justify-center my-3">
          <div className="w-52 h-32 flex items-center justify-center">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 200 120">
              {/* Background Arch Track */}
              <path
                d="M 30 105 A 70 70 0 0 1 170 105"
                fill="none"
                stroke="#F2EBEB"
                strokeWidth="16"
                strokeLinecap="round"
              />
              {/* Active Wine-Red Arch */}
              <path
                d="M 30 105 A 70 70 0 0 1 170 105"
                fill="none"
                stroke="#8F1D21"
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={arcLength}
                strokeDashoffset={dashOffset}
              />
              {/* Centered Percentage */}
              <text
                x="100"
                y="85"
                textAnchor="middle"
                className="font-sans"
                style={{ fontSize: "36px", fontWeight: "900", fill: "#0F172A" }}
              >
                {hypoPct}%
              </text>
              {/* Subtitle */}
              <text
                x="100"
                y="105"
                textAnchor="middle"
                className="font-sans"
                style={{ fontSize: "11px", fontWeight: "500", fill: "#64748B" }}
              >
                chance of low in 2 h
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* 3 Clinical Breakdown Progress Bars */}
      <div className="space-y-3 pt-2">
        {/* 1. Hypoglycaemia (below 70) */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold text-slate-900 mb-1">
            <span>Hypoglycaemia (below 70)</span>
            <span className="font-mono-tech font-bold text-slate-900">{hypoPct}%</span>
          </div>
          <div className="w-full h-2 bg-[#F2EBEB] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#8F1D21] rounded-full"
              style={{ width: `${hypoPct}%` }}
            ></div>
          </div>
        </div>

        {/* 2. Hyperglycaemia (above 250) */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold text-slate-900 mb-1">
            <span>Hyperglycaemia (above 250)</span>
            <span className="font-mono-tech font-bold text-slate-900">{hyperPct}%</span>
          </div>
          <div className="w-full h-2 bg-[#F2EBEB] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#8F1D21] rounded-full"
              style={{ width: `${hyperPct}%` }}
            ></div>
          </div>
        </div>

        {/* 3. DKA risk */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold text-slate-900 mb-1">
            <span>DKA risk</span>
            <span className="font-mono-tech font-bold text-slate-900">&lt;1%</span>
          </div>
          <div className="w-full h-2 bg-[#F2EBEB] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#8F1D21] rounded-full"
              style={{ width: "2%" }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
