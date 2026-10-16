"use client";

import React from "react";
import { TelemetryRecord } from "../telemetry/TelemetryChart";

export interface PatientEHR {
  patient_id: string;
  name: string;
  age: number;
  gender: string;
  city: string;
  hba1c_pct: number;
  bmi: number;
  clinical_risk_tier: string;
  diabetes_type?: string;
  delivery_system: string;
  isf_mg_dl_per_unit: number;
  icr_grams_per_unit: number;
  basal_rate_u_hr: number;
  years_with_t1d?: number;
}

interface PatientProfileCardProps {
  ehr: PatientEHR | null;
  currentGlucose?: number;
  stream: TelemetryRecord[];
}

export default function PatientProfileCard({
  ehr,
  currentGlucose,
  stream,
}: PatientProfileCardProps) {
  const latestTelemetry = stream && stream.length > 0 ? stream[stream.length - 1] : null;
  const cgmVal = Math.round(currentGlucose || latestTelemetry?.glucose || 250);
  const hrVal = Math.round(latestTelemetry?.heart_rate || 60);
  const stepsVal =
    stream && stream.length > 0
      ? stream.slice(-12).reduce((sum, pt) => sum + (pt.steps || 0), 0).toLocaleString()
      : "4,821";

  return (
    <div className="w-full h-full p-6 bg-white flex flex-col justify-start select-none">
      {/* 1. Patient Name Headline in Editorial Serif */}
      <h1 className="font-editorial text-3xl font-normal text-slate-900 tracking-tight">
        {ehr?.name || "Madhumitha Ramanathan"}
      </h1>

      {/* 2. 2x3 Hairline Table Grid: Exact Replica of Image */}
      <div className="mt-4 border border-slate-300/80 rounded-lg overflow-hidden grid grid-cols-3 divide-x divide-y divide-slate-300/80 bg-white">
        {/* Row 1, Col 1: ISF */}
        <div className="px-3.5 py-2.5 bg-white">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            ISF
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.isf_mg_dl_per_unit || 60} mg/dL/U
          </span>
        </div>

        {/* Row 1, Col 2: ICR */}
        <div className="px-3.5 py-2.5 bg-white">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            ICR
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            1:{ehr?.icr_grams_per_unit || 15} U/g
          </span>
        </div>

        {/* Row 1, Col 3: Basal */}
        <div className="px-3.5 py-2.5 bg-white">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            Basal
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.basal_rate_u_hr || 0.65} U/h
          </span>
        </div>

        {/* Row 2, Col 1: HbA1c */}
        <div className="px-3.5 py-2.5 bg-white">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            HbA1c
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.hba1c_pct || 7.8}%
          </span>
        </div>

        {/* Row 2, Col 2: BMI */}
        <div className="px-3.5 py-2.5 bg-white">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            BMI
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.bmi || 24.1}
          </span>
        </div>

        {/* Row 2, Col 3: Diagnosed */}
        <div className="px-3.5 py-2.5 bg-white">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            Diagnosed
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.years_with_t1d || 14} yrs
          </span>
        </div>
      </div>

      {/* 3. Below Layer: 3 Biosignals (Exact Typography, Spacing, and Colors from Image) */}
      <div className="mt-7 grid grid-cols-3">
        {/* Col 1: CURRENT CGM */}
        <div>
          <div className="flex items-baseline space-x-1">
            <span className="text-[38px] font-black text-black leading-none tracking-tight font-sans">
              {cgmVal}
            </span>
            <span className="text-sm font-semibold text-black leading-none font-sans">
              mg/dL
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mt-2 block font-sans">
            CURRENT CGM
          </span>
        </div>

        {/* Col 2: HEART RATE */}
        <div>
          <div className="flex items-baseline space-x-1">
            <span className="text-[38px] font-black text-black leading-none tracking-tight font-sans">
              {hrVal}
            </span>
            <span className="text-sm font-semibold text-black leading-none font-sans">
              BPM
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mt-2 block font-sans">
            HEART RATE
          </span>
        </div>

        {/* Col 3: ACTIVITY STEP COUNT */}
        <div>
          <div className="flex items-baseline space-x-1">
            <span className="text-[38px] font-black text-black leading-none tracking-tight font-sans">
              {stepsVal}
            </span>
            <span className="text-sm font-semibold text-black leading-none font-sans">
              steps
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wide mt-2 block font-sans">
            ACTIVITY STEP COUNT
          </span>
        </div>
      </div>
    </div>
  );
}
