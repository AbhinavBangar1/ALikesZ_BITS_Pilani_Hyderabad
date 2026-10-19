"use client";

import React from "react";

export interface MealResponseItem {
  meal: string;
  time: string;
  carbs_g: number;
  bolus_u?: number;
  walk_steps?: number;
  walk_display?: string;
  pre_meal: number;
  peak: number;
  time_to_peak: string;
  rise: number;
  back_in_range: string;
}

interface MealResponseSectionProps {
  meals?: MealResponseItem[];
  averageRise?: number;
  summaryNote?: string;
  diabetesType?: string;
}

export default function MealResponseSection({
  meals = [],
  averageRise = 58,
  summaryNote,
  diabetesType = "Type 1",
}: MealResponseSectionProps) {
  const isT1D = diabetesType === "Type 1";

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-5">
      {/* Header (NO 04 SECTION TAG) */}
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-serif text-slate-900 font-normal">
            Meal response
          </h2>
        </div>
        <div className="text-[11px] font-sans text-slate-500 uppercase tracking-wider">
          {/* PREVIOUS: GLUCOSE IN MG/DL · AVERAGE RISE +{Math.round(averageRise || 128)} */}
          GLUCOSE IN MG/DL{averageRise ? ` · AVERAGE RISE +${Math.round(averageRise)}` : ""}
        </div>
      </div>

      {/* Post-Prandial Response Table */}
      <div className="w-full border border-slate-200 overflow-x-auto bg-white">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wider text-slate-500">
              <th className="py-2.5 px-3">MEAL</th>
              <th className="py-2.5 px-3">TIME</th>
              <th className="py-2.5 px-3">CARBS</th>
              {isT1D ? (
                <th className="py-2.5 px-3">BOLUS</th>
              ) : (
                <th className="py-2.5 px-3">WALK</th>
              )}
              <th className="py-2.5 px-3">PRE-MEAL</th>
              <th className="py-2.5 px-3">PEAK</th>
              <th className="py-2.5 px-3">TIME TO PEAK</th>
              <th className="py-2.5 px-3 w-40">RISE</th>
              <th className="py-2.5 px-3">BACK IN RANGE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {meals && meals.length > 0 ? (
              meals.map((m, idx) => {
                const isPeakHigh = m.peak > 180;
                const isDelayedRecovery =
                  m.back_in_range === "Not yet" || m.back_in_range.includes("Not within");
                const riseBarWidth = Math.min(100, Math.max(10, (m.rise / 160) * 100));

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{m.meal}</td>
                    <td className="py-2.5 px-3 text-slate-500">{m.time}</td>
                    <td className="py-2.5 px-3 font-medium">{m.carbs_g} g</td>
                    {isT1D ? (
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {/* PREVIOUS: {m.bolus_u && m.bolus_u > 0 ? `${m.bolus_u} U` : "4 U"} */}
                        {m.bolus_u && m.bolus_u > 0 ? `${m.bolus_u} U` : "—"}
                      </td>
                    ) : (
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {m.walk_display || (m.walk_steps && m.walk_steps > 0 ? `${m.walk_steps} steps` : "—")}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-slate-600">{Math.round(m.pre_meal)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`font-bold ${isPeakHigh ? "text-amber-600" : "text-slate-800"}`}>
                        {Math.round(m.peak)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{m.time_to_peak}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 h-2 overflow-hidden">
                          <div
                            style={{ width: `${riseBarWidth}%` }}
                            className="bg-[#D97706] h-full"
                          />
                        </div>
                        <span className="font-bold text-slate-700 w-10 text-right">
                          +{Math.round(m.rise)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-medium ${
                          isDelayedRecovery ? "text-rose-600 font-bold" : "text-slate-700"
                        }`}
                      >
                        {m.back_in_range}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400 font-sans">
                  No meal ingestion episodes recorded in this monitoring window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
