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
  cgm_device?: string;
  isf_mg_dl_per_unit?: number;
  icr_grams_per_unit?: number;
  basal_rate_u_hr?: number;
  homa_ir?: number;
  oral_medications?: string;
  target_tir_pct?: number;
  years_with_t1d?: number;
  years_with_diabetes?: number;
}

interface PatientProfileCardProps {
  ehr: PatientEHR | null;
  currentGlucose?: number;
  stream: TelemetryRecord[];
  liveBpm?: number;
}

export default function PatientProfileCard({
  ehr,
  currentGlucose,
  stream,
  liveBpm,
}: PatientProfileCardProps) {
  const latestTelemetry = stream && stream.length > 0 ? stream[stream.length - 1] : null;
  const cgmVal = Math.round(currentGlucose || latestTelemetry?.glucose || 140);
  const hrVal = Math.round(liveBpm || latestTelemetry?.heart_rate || 72);
  const stepsVal =
    stream && stream.length > 0
      ? stream.slice(-24).reduce((sum, pt) => sum + (pt.steps || 0), 0).toLocaleString()
      : "4,821";

  const isT2D = ehr?.diabetes_type === "Type 2" || (ehr?.patient_id?.startsWith("T2D") ?? false);

  return (
    <div className="w-full h-full p-6 pb-0 bg-white hover:bg-slate-50/30 transition-colors duration-200 flex flex-col justify-between select-none rounded-none">
      {/* 1. Patient Name Headline in Editorial Serif with Demographic Details */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-editorial text-3xl font-normal text-slate-900 tracking-tight">
            {ehr?.name || "Aarav Sharma"}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs font-mono-tech text-slate-500">
            <span>{ehr?.age || 28} yrs</span>
            <span>·</span>
            <span>{ehr?.gender || "Male"}</span>
            <span>·</span>
            <span>{ehr?.city || "Bengaluru"}</span>
            <span>·</span>
            <span className="text-slate-800">{ehr?.delivery_system || "AID Closed-Loop"}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] font-mono-tech uppercase tracking-wider px-2 py-0.5 border border-slate-300 text-slate-800 bg-slate-50">
            {isT2D ? "Type 2 Cohort" : "Type 1 Cohort"}
          </span>
          <span className="text-[10px] font-mono-tech text-slate-400">
            {ehr?.cgm_device || "Dexcom G7"}
          </span>
        </div>
      </div>

      {/* 2. 2x3 Hairline Table Grid: Center-Aligned, Strictly Squared Corners */}
      <div className="mt-4 border border-slate-300/80 rounded-none overflow-hidden grid grid-cols-3 divide-x divide-y divide-slate-300/80 bg-white">
        {isT2D ? (
          <>
            {/* T2D Row 1, Col 1: HOMA-IR */}
            <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
              <span className="text-[13px] font-medium text-slate-900 block leading-tight">
                HOMA-IR
              </span>
              <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
                {ehr?.homa_ir ? `${ehr.homa_ir} IR` : "3.8 IR"}
              </span>
            </div>

            {/* T2D Row 1, Col 2: Target TIR */}
            <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
              <span className="text-[13px] font-medium text-slate-900 block leading-tight">
                Target TIR
              </span>
              <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
                &gt; {ehr?.target_tir_pct || 70}%
              </span>
            </div>

            {/* T2D Row 1, Col 3: Therapy */}
            <div
              className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none"
              title={ehr?.oral_medications || "Metformin"}
            >
              <span className="text-[13px] font-medium text-slate-900 block leading-tight">
                Therapy
              </span>
              <span className="text-[13px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight truncate max-w-[125px]">
                {ehr?.oral_medications ? ehr.oral_medications.split("+")[0].trim() : "Metformin"}
              </span>
            </div>
          </>
        ) : (
          <>
            {/* T1D Row 1, Col 1: ISF */}
            <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
              <span className="text-[13px] font-medium text-slate-900 block leading-tight">
                ISF
              </span>
              <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
                {ehr?.isf_mg_dl_per_unit || 60} mg/dL/U
              </span>
            </div>

            {/* T1D Row 1, Col 2: ICR */}
            <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
              <span className="text-[13px] font-medium text-slate-900 block leading-tight">
                ICR
              </span>
              <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
                1:{ehr?.icr_grams_per_unit || 15} U/g
              </span>
            </div>

            {/* T1D Row 1, Col 3: Basal */}
            <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
              <span className="text-[13px] font-medium text-slate-900 block leading-tight">
                Basal
              </span>
              <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
                {ehr?.basal_rate_u_hr || 0.65} U/h
              </span>
            </div>
          </>
        )}

        {/* Row 2, Col 1: HbA1c */}
        <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            HbA1c
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.hba1c_pct || 7.8}%
          </span>
        </div>

        {/* Row 2, Col 2: BMI */}
        <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            BMI
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.bmi || 24.1}
          </span>
        </div>

        {/* Row 2, Col 3: Diagnosed */}
        <div className="px-3.5 py-2.5 bg-white text-center flex flex-col items-center justify-center hover:bg-slate-100 transition-colors duration-150 cursor-pointer rounded-none">
          <span className="text-[13px] font-medium text-slate-900 block leading-tight">
            Diagnosed
          </span>
          <span className="text-[15px] font-semibold font-mono-tech text-slate-900 mt-1 block leading-tight">
            {ehr?.years_with_diabetes || ehr?.years_with_t1d || 14} yrs
          </span>
        </div>
      </div>

      {/* 3. Below Layer: 3 Biosignals (Full Space of Parent Width, Invisible Borders, Clean Contrast) */}
      <div className="-mx-6 mt-6 grid grid-cols-3 gap-0 border-t border-transparent bg-slate-50/30">
        {/* Col 1: CURRENT CGM */}
        <div className="py-4 px-2 rounded-none hover:bg-slate-100 transition-colors duration-150 cursor-pointer flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline space-x-1 justify-center">
            <span className="text-[38px] font-semibold text-slate-900 leading-none tracking-tight font-sans">
              {cgmVal}
            </span>
            <span className="text-sm font-semibold text-slate-900 leading-none font-sans">
              mg/dL
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span
              className={`w-1.5 h-1.5 rounded-none ${
                cgmVal < 70 ? "bg-rose-600" : cgmVal > 180 ? "bg-amber-600" : "bg-emerald-600"
              }`}
            />
            <span className="text-[11px] font-mono-tech uppercase tracking-wider text-slate-600">
              CURRENT CGM
            </span>
          </div>
        </div>

        {/* Col 2: HEART RATE */}
        <div className="py-4 px-2 rounded-none hover:bg-slate-100 transition-colors duration-150 cursor-pointer flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline space-x-1 justify-center">
            <span className="text-[38px] font-semibold text-slate-900 leading-none tracking-tight font-sans">
              {hrVal}
            </span>
            <span className="text-sm font-semibold text-slate-900 leading-none font-sans">
              BPM
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-none bg-red-600" />
            <span className="text-[11px] font-mono-tech uppercase tracking-wider text-slate-600">
              HEART RATE
            </span>
          </div>
        </div>

        {/* Col 3: ACTIVITY STEP COUNT */}
        <div className="py-4 px-2 rounded-none hover:bg-slate-100 transition-colors duration-150 cursor-pointer flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline space-x-1 justify-center">
            <span className="text-[38px] font-semibold text-slate-900 leading-none tracking-tight font-sans">
              {stepsVal}
            </span>
            <span className="text-sm font-semibold text-slate-900 leading-none font-sans">
              steps
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-none bg-purple-600" />
            <span className="text-[11px] font-mono-tech uppercase tracking-wider text-slate-600">
              WINDOW STEPS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
