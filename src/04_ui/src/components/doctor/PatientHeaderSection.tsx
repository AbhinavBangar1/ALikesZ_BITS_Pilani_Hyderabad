"use client";

import React from "react";

export interface BaselineMetric {
  label: string;
  value: string;
  unit: string;
}

interface PatientHeaderSectionProps {
  name?: string;
  demographicsSummary?: string;
  deviceText?: string;
  baselineMetrics?: BaselineMetric[];
  onOpenEHR?: () => void;
}

export default function PatientHeaderSection({
  name = "Patient",
  demographicsSummary,
  deviceText,
  baselineMetrics = [],
  onOpenEHR,
}: PatientHeaderSectionProps) {
  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 pt-5 pb-4">
      {/* Top Row: Patient Name & Header Actions */}
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl lg:text-3xl font-serif text-slate-900 tracking-tight font-normal">
          {name}
        </h1>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={onOpenEHR}
            type="button"
            className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2 cursor-pointer transition-colors"
          >
            EHR Profile
          </button>
          {deviceText && (
            <span className="text-slate-400 font-sans">
              {deviceText}
            </span>
          )}
        </div>
      </div>

      {/* Subline: Demographics & Clinical Profile */}
      {demographicsSummary && (
        <p className="text-xs text-slate-500 font-sans mb-4">
          {demographicsSummary}
        </p>
      )}

      {/* 6-Metric Horizontal Clinical Baseline Strip */}
      {baselineMetrics && baselineMetrics.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 border border-slate-200 divide-x divide-slate-200 bg-white">
          {baselineMetrics.map((m, idx) => (
            <div key={idx} className="p-2.5 flex flex-col justify-center">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400 mb-0.5">
                {m.label}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-base lg:text-lg font-bold text-slate-900 font-sans tracking-tight">
                  {m.value}
                </span>
                {m.unit && (
                  <span className="text-[10px] text-slate-500 font-sans">
                    {m.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
