"use client";

import React from "react";

export interface HeroKPIProps {
  currentGlucose: number;
  glucoseRoc?: string;
  heartRate: number;
  heartRateState?: string;
  lastHourSteps: number;
  stepsState?: string;
  therapyKpi?: {
    type: string;
    label: string;
    value: string;
    unit: string;
    detail: string;
  };
}

export default function HeroKPISection({
  currentGlucose,
  glucoseRoc = "+0.0 mg/dL/min",
  heartRate = 72,
  heartRateState = "Resting",
  lastHourSteps = 0,
  stepsState = "Sedentary since 12:00",
  therapyKpi,
}: HeroKPIProps) {
  const isHypo = currentGlucose < 70;
  const isHyper = currentGlucose > 180;
  const cgmColorClass = isHypo ? "text-rose-600" : isHyper ? "text-amber-600" : "text-slate-900";

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Current CGM */}
        <div className="border border-slate-200 p-3.5 flex flex-col justify-between bg-white">
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className={`text-3xl lg:text-4xl font-bold font-sans tracking-tight ${cgmColorClass}`}>
              {Math.round(currentGlucose)}
            </span>
            <span className="text-xs text-slate-500 font-sans">mg/dL</span>
            {/* <span className="text-amber-500 font-bold text-lg leading-none ml-1">↗</span> */}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-slate-600 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" />
              CURRENT CGM
            </div>
            <div className="text-[11px] text-slate-500 font-sans truncate">
              Range & rate: {glucoseRoc}
            </div>
          </div>
        </div>

        {/* Card 2: Heart Rate */}
        <div className="border border-slate-200 p-3.5 flex flex-col justify-between bg-white">
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-3xl lg:text-4xl font-bold text-slate-900 font-sans tracking-tight">
              {heartRate}
            </span>
            <span className="text-xs text-slate-500 font-sans">bpm</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-slate-600 mb-0.5">
              <span className="w-1.5 h-1.5 bg-rose-600 inline-block" />
              HEART RATE
            </div>
            <div className="text-[11px] text-slate-500 font-sans truncate">
              {heartRateState}
            </div>
          </div>
        </div>

        {/* Card 3: Steps (Last Hour) */}
        <div className="border border-slate-200 p-3.5 flex flex-col justify-between bg-white">
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-3xl lg:text-4xl font-bold text-slate-900 font-sans tracking-tight">
              {lastHourSteps.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-sans">steps</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-slate-600 mb-0.5">
              <span className="w-1.5 h-1.5 bg-purple-600 inline-block" />
              STEPS (LAST HOUR)
            </div>
            <div className="text-[11px] text-slate-500 font-sans truncate">
              {stepsState}
            </div>
          </div>
        </div>

        {/* Card 4: Therapy Ingestion Context (IOB for T1D or Last Meal for T2D) */}
        <div className="border border-slate-200 p-3.5 flex flex-col justify-between bg-white">
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-3xl lg:text-4xl font-bold text-slate-900 font-sans tracking-tight">
              {therapyKpi?.value || "3.9"}
            </span>
            <span className="text-xs text-slate-500 font-sans">
              {therapyKpi?.unit || "U"}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-slate-600 mb-0.5">
              <span className="w-1.5 h-1.5 bg-slate-700 inline-block" />
              {therapyKpi?.label || "INSULIN ON BOARD"}
            </div>
            <div className="text-[11px] text-slate-500 font-sans truncate">
              {therapyKpi?.detail || "Lunch bolus recorded recently"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
