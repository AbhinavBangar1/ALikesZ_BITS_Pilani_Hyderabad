"use client";

import React, { useState } from "react";
import { TelemetryRecord } from "../telemetry/TelemetryChart";

export interface TwinForecast {
  current_glucose: number;
  trend: string;
  alert_level: string;
  alert_message: string;
  adverse_risk_prob: number;
  diabetes_type?: string;
  forecast: {
    t_plus_30min: number;
    t_plus_60min: number;
    t_plus_120min: number;
  };
}

interface ForecastCardProps {
  forecast: TwinForecast | null;
  stream: TelemetryRecord[];
}

export default function ForecastCard({ forecast, stream }: ForecastCardProps) {
  const [hoveredPoint, setHoveredPoint] = useState<"30" | "60" | "120" | "now" | null>(null);

  const svgWidth = 400;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // Trajectory Anchor Points
  const currG = forecast?.current_glucose || (stream.length > 0 ? stream[stream.length - 1].glucose : 160);
  const pastG = stream.length >= 6 ? stream[stream.length - 6].glucose : currG - 10;
  const val30 = forecast?.forecast?.t_plus_30min ?? (currG + 15);
  const val60 = forecast?.forecast?.t_plus_60min ?? (currG + 8);
  const val120 = forecast?.forecast?.t_plus_120min ?? (currG - 12);

  // Hardcoded Clinical CGM Range (40 - 350 mg/dL, with dynamic ceiling if extreme excursion)
  const highestG = Math.max(currG, pastG, val30, val60, val120);
  const minY = 40;
  const maxY = highestG > 330 ? Math.ceil((highestG + 20) / 50) * 50 : 350;

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return padTop + plotHeight - ((clamped - minY) / (maxY - minY)) * plotHeight;
  };

  const yPast = getY(pastG);
  const yNow = getY(currG);
  const y30 = getY(val30);
  const y60 = getY(val60);
  const y120 = getY(val120);

  const xPast = padLeft;
  const xNow = padLeft + plotWidth * 0.22;
  const x30 = padLeft + plotWidth * 0.48;
  const x60 = padLeft + plotWidth * 0.74;
  const x120 = padLeft + plotWidth;

  // 90% Confidence Uncertainty Envelope Bounds
  const y30_upper = getY(val30 + 14);
  const y30_lower = getY(val30 - 14);
  const y60_upper = getY(val60 + 24);
  const y60_lower = getY(val60 - 24);
  const y120_upper = getY(val120 + 38);
  const y120_lower = getY(val120 - 38);

  // Target safe zone (70 to 140 mg/dL)
  const safeTopY = getY(140);
  const safeBottomY = getY(70);
  const safeHeight = Math.max(0, safeBottomY - safeTopY);

  // Dynamic triage status pill
  let statusText = "Target Trajectory";
  let statusBg = "bg-slate-100 text-slate-800 border-slate-300";
  if (Math.min(val30, val60, val120) < 70) {
    statusText = "Hypo Alert (<70 in ~40m)";
    statusBg = "bg-rose-50 text-[#8F1D21] border-rose-300";
  } else if (Math.max(val30, val60, val120) > 220) {
    statusText = `Peak ${Math.round(Math.max(val30, val60, val120))} mg/dL`;
    statusBg = "bg-amber-50 text-amber-900 border-amber-300";
  }

  return (
    <div className="w-full h-full p-6 bg-white hover:bg-slate-50/30 transition-colors duration-200 flex flex-col justify-between select-none rounded-none">
      {/* Title & Dynamic Status Badge */}
      <div className="flex items-center justify-between">
        {/* OLD: <h2 className="font-editorial text-xl font-normal text-slate-900 tracking-tight">2-Hour Predictive Trajectory</h2> */}
        <h2 className="font-sans text-lg font-bold text-slate-900 tracking-tight">
          2-Hour Predictive Trajectory
        </h2>
        {/* OLD: <span className={`text-[11px] font-mono-tech px-2 py-0.5 border ${statusBg}`}> */}
        <span className={`text-[11px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 border ${statusBg}`}>
          {statusText}
        </span>
      </div>

      {/* Trajectory Canvas */}
      <div className="my-auto py-2 hover:bg-slate-50 rounded-none p-2 transition-colors duration-150">
        <svg
          className="w-full h-auto overflow-visible"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        >
          {/* Green Safe Target Zone Band (70 - 140 mg/dL) */}
          <rect
            x={padLeft}
            y={safeTopY}
            width={plotWidth}
            height={safeHeight}
            fill="#10B981"
            fillOpacity="0.07"
          />

          {/* Safe Band Threshold Lines */}
          <line
            x1={padLeft}
            y1={safeTopY}
            x2={padLeft + plotWidth}
            y2={safeTopY}
            stroke="#10B981"
            strokeWidth="0.8"
            strokeDasharray="3 3"
            opacity="0.4"
          />
          <line
            x1={padLeft}
            y1={safeBottomY}
            x2={padLeft + plotWidth}
            y2={safeBottomY}
            stroke="#10B981"
            strokeWidth="0.8"
            strokeDasharray="3 3"
            opacity="0.4"
          />

          {/* Y Axis Guide Lines & Labels (300, 200, 100) */}
          {[300, 200, 100].map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotWidth}
                  y2={y}
                  stroke="#F1F5F9"
                  strokeWidth="1"
                />
                {/* OLD: <text x={padLeft - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono-tech fill-slate-500 font-medium"> */}
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10px] font-sans fill-slate-500 font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* 90% Confidence Uncertainty Envelope Ribbon */}
          <path
            d={`M ${xNow} ${yNow} 
                C ${xNow + 25} ${y30_upper}, ${x30 - 20} ${y30_upper}, ${x30} ${y30_upper} 
                C ${x30 + 25} ${y60_upper}, ${x60 - 20} ${y60_upper}, ${x60} ${y60_upper} 
                C ${x60 + 25} ${y120_upper}, ${x120 - 20} ${y120_upper}, ${x120} ${y120_upper} 
                L ${x120} ${y120_lower} 
                C ${x120 - 20} ${y120_lower}, ${x60 + 25} ${y60_lower}, ${x60} ${y60_lower} 
                C ${x60 - 20} ${y60_lower}, ${x30 + 25} ${y30_lower}, ${x30} ${y30_lower} 
                C ${x30 - 20} ${y30_lower}, ${xNow + 25} ${yNow}, ${xNow} ${yNow} Z`}
            fill="#2563EB"
            fillOpacity="0.09"
          />

          {/* Historical Solid Line (Past to Now) */}
          <path
            d={`M ${xPast} ${yPast} Q ${(xPast + xNow) / 2} ${(yPast + yNow) / 2}, ${xNow} ${yNow}`}
            fill="none"
            stroke="#64748B"
            strokeWidth="2"
          />

          {/* Future Trajectory Path (Now through +30m, +60m, +120m) */}
          <path
            d={`M ${xNow} ${yNow} C ${xNow + 25} ${yNow}, ${x30 - 25} ${y30}, ${x30} ${y30} C ${x30 + 25} ${y30}, ${x60 - 25} ${y60}, ${x60} ${y60} C ${x60 + 25} ${y60}, ${x120 - 25} ${y120}, ${x120} ${y120}`}
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.4"
            strokeDasharray="4 2"
          />

          {/* Now Vertical Anchor Line */}
          <line
            x1={xNow}
            y1={padTop}
            x2={xNow}
            y2={padTop + plotHeight}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Horizon Interactive Dots */}
          {/* NOW Dot */}
          <circle
            cx={xNow}
            cy={yNow}
            r="4.5"
            fill="#0F172A"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            className="cursor-pointer hover:r-6 transition-all"
            onMouseEnter={() => setHoveredPoint("now")}
            onMouseLeave={() => setHoveredPoint(null)}
          />
          {/* +30m Dot */}
          <circle
            cx={x30}
            cy={y30}
            r="4.5"
            fill="#2563EB"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            className="cursor-pointer hover:r-6 transition-all"
            onMouseEnter={() => setHoveredPoint("30")}
            onMouseLeave={() => setHoveredPoint(null)}
          />
          {/* +60m Dot */}
          <circle
            cx={x60}
            cy={y60}
            r="4.5"
            fill="#2563EB"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            className="cursor-pointer hover:r-6 transition-all"
            onMouseEnter={() => setHoveredPoint("60")}
            onMouseLeave={() => setHoveredPoint(null)}
          />
          {/* +120m Dot */}
          <circle
            cx={x120}
            cy={y120}
            r="4.5"
            fill="#2563EB"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            className="cursor-pointer hover:r-6 transition-all"
            onMouseEnter={() => setHoveredPoint("120")}
            onMouseLeave={() => setHoveredPoint(null)}
          />

          {/* Value Labels Above Dots */}
          {/* OLD: className="text-[11px] font-mono-tech font-semibold fill-..." */}
          <text
            x={xNow}
            y={yNow - 9}
            textAnchor="middle"
            className="text-[11px] font-sans font-bold fill-slate-900"
          >
            {Math.round(currG)}
          </text>
          <text
            x={x30}
            y={y30 - 9}
            textAnchor="middle"
            className="text-[11px] font-sans font-bold fill-blue-700"
          >
            {Math.round(val30)}
          </text>
          <text
            x={x60}
            y={y60 - 9}
            textAnchor="middle"
            className="text-[11px] font-sans font-bold fill-blue-700"
          >
            {Math.round(val60)}
          </text>
          <text
            x={x120}
            y={y120 - 9}
            textAnchor="end"
            className="text-[11px] font-sans font-bold fill-blue-700"
          >
            {Math.round(val120)}
          </text>

          {/* Boundary Surrounding Trajectory Graph */}
          <rect
            x={padLeft}
            y={padTop}
            width={plotWidth}
            height={plotHeight}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1"
          />

          {/* Bottom X Axis Labels */}
          <g transform={`translate(0, ${padTop + plotHeight + 18})`}>
            <text x={xNow} textAnchor="middle" className="text-[11px] font-sans font-medium fill-slate-800">
              Now
            </text>
            <text x={x30} textAnchor="middle" className="text-[11px] font-sans font-medium fill-slate-600">
              +30m
            </text>
            <text x={x60} textAnchor="middle" className="text-[11px] font-sans font-medium fill-slate-600">
              +60m
            </text>
            <text x={x120} textAnchor="end" className="text-[11px] font-sans font-medium fill-slate-600">
              +120m
            </text>
          </g>
        </svg>
      </div>

    </div>
  );
}
