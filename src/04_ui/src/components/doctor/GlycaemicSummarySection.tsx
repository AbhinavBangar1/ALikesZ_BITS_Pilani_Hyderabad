"use client";

import React from "react";

export interface GlycaemicSummaryData {
  average_glucose: number;
  std_glucose: number;
  time_in_range_pct: number;
  time_below_70_pct: number;
  time_above_180_pct: number;
  time_very_high_pct: number;
  time_high_pct: number;
  cv_pct: number;
  readings_count?: number;
  sensor_active_pct?: number;
}

interface GlycaemicSummarySectionProps {
  summary?: GlycaemicSummaryData;
}

export default function GlycaemicSummarySection({ summary }: GlycaemicSummarySectionProps) {
  const avgG = summary?.average_glucose ?? 168;
  const stdG = summary?.std_glucose ?? 31;
  const tir = summary?.time_in_range_pct ?? 62;
  const tbr = summary?.time_below_70_pct ?? 0;
  const tar = summary?.time_above_180_pct ?? 38;
  const cv = summary?.cv_pct ?? 27.4;
  const veryHigh = summary?.time_very_high_pct ?? 10;
  const high = summary?.time_high_pct ?? Math.max(0, tar - veryHigh);
  const sensorActive = summary?.sensor_active_pct ?? 100;
  const readingsCount = summary?.readings_count ?? 1344;

  const tirOk = tir >= 70;
  const tbrOk = tbr <= 4;
  const tarOk = tar <= 25;
  const cvOk = cv <= 36;

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-5">
      {/* Header (NO 02 LAST 14 DAYS) */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-serif text-slate-900 font-normal">
            Glycaemic summary
          </h2>
        </div>
        <div className="text-[11px] font-sans text-slate-400 tracking-wider uppercase">
          MOCK DATA · 14 D · 100% SENSOR USE
        </div>
      </div>

      {/* 6 Key Clinical Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border border-slate-200 divide-x divide-y sm:divide-y-0 divide-slate-200 mb-4 bg-white">
        {/* 1. Average Glucose */}
        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400 mb-1">
            AVERAGE GLUCOSE
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-sans text-slate-900">
              {Math.round(avgG)}
            </span>
            <span className="text-[10px] text-slate-500 font-sans">mg/dL</span>
          </div>
          <span className="text-[10px] text-slate-500 font-sans mt-0.5">
            GMI 8.8%
          </span>
        </div>

        {/* 2. Time in Range */}
        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400 mb-1">
            TIME IN RANGE
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold font-sans ${tirOk ? "text-emerald-700" : "text-amber-600"}`}>
              {Math.round(tir)}
            </span>
            <span className="text-[10px] text-slate-500 font-sans">%</span>
          </div>
          <span className={`text-[10px] font-medium font-sans mt-0.5 ${tirOk ? "text-emerald-600" : "text-amber-600"}`}>
            Target: above 70%
          </span>
        </div>

        {/* 3. Time Below 70 */}
        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400 mb-1">
            TIME BELOW 70
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold font-sans ${tbrOk ? "text-emerald-700" : "text-rose-600"}`}>
              {Math.round(tbr)}
            </span>
            <span className="text-[10px] text-slate-500 font-sans">%</span>
          </div>
          <span className={`text-[10px] font-medium font-sans mt-0.5 ${tbrOk ? "text-emerald-600" : "text-rose-600"}`}>
            Target: below 4%
          </span>
        </div>

        {/* 4. Time Above 180 */}
        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400 mb-1">
            TIME ABOVE 180
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold font-sans ${tarOk ? "text-emerald-700" : "text-amber-600"}`}>
              {Math.round(tar)}
            </span>
            <span className="text-[10px] text-slate-500 font-sans">%</span>
          </div>
          <span className={`text-[10px] font-medium font-sans mt-0.5 ${tarOk ? "text-emerald-600" : "text-amber-600"}`}>
            Target: below 25%
          </span>
        </div>

        {/* 5. Variability (CV) */}
        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400 mb-1">
            VARIABILITY (CV)
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold font-sans ${cvOk ? "text-emerald-700" : "text-amber-600"}`}>
              {cv.toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-500 font-sans">%</span>
          </div>
          <span className={`text-[10px] font-medium font-sans mt-0.5 ${cvOk ? "text-emerald-600" : "text-amber-600"}`}>
            SD {Math.round(stdG || 88)} mg/dL · target &le;36%
          </span>
        </div>

        {/* 6. Sensor Active */}
        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-slate-400 mb-1">
            SENSOR ACTIVE
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-sans text-slate-900">
              {Math.round(sensorActive)}
            </span>
            <span className="text-[10px] text-slate-500 font-sans">%</span>
          </div>
          <span className="text-[10px] text-slate-500 font-sans mt-0.5">
            {readingsCount.toLocaleString()} readings
          </span>
        </div>
      </div>

      {/* Continuous Horizontal Stacked Bar (AGP Standard TIR Bar) */}
      <div className="w-full flex h-7 text-[11px] font-semibold font-sans overflow-hidden">
        {/* Very High (>250) */}
        <div
          style={{ width: `${Math.max(12, veryHigh || 44)}%` }}
          className="bg-[#D97706] text-white flex items-center px-2.5 truncate"
        >
          {Math.round(veryHigh || 44)}% Very high
        </div>

        {/* High (181-250) */}
        <div
          style={{ width: `${Math.max(12, high || 24)}%` }}
          className="bg-[#F59E0B] text-white flex items-center px-2.5 truncate"
        >
          {Math.round(high || 24)}% High
        </div>

        {/* In Target (70-180) */}
        <div
          style={{ width: `${Math.max(15, tir || 32)}%` }}
          className="bg-[#10B981] text-white flex items-center px-2.5 truncate"
        >
          {Math.round(tir || 32)}% In target
        </div>
      </div>
    </div>
  );
}
