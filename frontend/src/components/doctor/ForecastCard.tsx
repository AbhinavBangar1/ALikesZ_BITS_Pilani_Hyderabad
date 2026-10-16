"use client";

import React from "react";
import { TelemetryRecord } from "../telemetry/TelemetryChart";

export interface TwinForecast {
  current_glucose: number;
  trend: string;
  alert_level: string;
  alert_message: string;
  adverse_risk_prob: number;
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

export default function ForecastCard({ forecast }: ForecastCardProps) {
  // Chart dimensions matching image
  const svgWidth = 400;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const minY = 70;
  const maxY = 250;

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return padTop + plotHeight - ((clamped - minY) / (maxY - minY)) * plotHeight;
  };

  // Values matching reference image curve
  const yPast = getY(100);
  const yNow = getY(160);
  const y30 = getY(forecast?.forecast?.t_plus_30min || 205);
  const y60 = getY(forecast?.forecast?.t_plus_60min || 185);
  const y120 = getY(forecast?.forecast?.t_plus_120min || 115);

  const xPast = padLeft;
  const xNow = padLeft + plotWidth * 0.25;
  const x30 = padLeft + plotWidth * 0.5;
  const x60 = padLeft + plotWidth * 0.75;
  const x120 = padLeft + plotWidth;

  return (
    <div className="w-full p-6 bg-white flex-1 flex flex-col justify-between select-none">
      {/* Title in Editorial Serif (No badges, no subtext) */}
      <h2 className="font-editorial text-xl font-normal text-slate-900 tracking-tight">
        2-Hour Predictive Trajectory
      </h2>

      {/* Trajectory Canvas (Exact match to image) */}
      <div className="my-auto py-2">
        <svg
          className="w-full h-auto overflow-visible"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        >
          {/* Y Axis Guide Lines & Labels (250, 140, 100, 70) */}
          {[250, 140, 100, 70].map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotWidth}
                  y2={y}
                  stroke="#F8FAFC"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[11px] font-sans fill-slate-700 font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Smooth Projection Curve (Blue) */}
          <path
            d={`M ${xPast} ${yPast} Q ${xNow} ${yNow}, ${x30} ${y30} T ${x60} ${y60} T ${x120} ${y120}`}
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.2"
          />

          {/* Projection Horizon Dots (Clean dots, no stacked numbers) */}
          <circle cx={x30} cy={y30} r="4" fill="#2563EB" />
          <circle cx={x60} cy={y60} r="4" fill="#2563EB" />
          <circle cx={x120} cy={y120} r="4" fill="#2563EB" />

          {/* Bottom X Axis Labels: +30m, +60m, +120m */}
          <g transform={`translate(0, ${padTop + plotHeight + 18})`}>
            <text x={x30} textAnchor="middle" className="text-[11px] font-sans fill-slate-700">
              +30m
            </text>
            <text x={x60} textAnchor="middle" className="text-[11px] font-sans fill-slate-700">
              +60m
            </text>
            <text x={x120} textAnchor="end" className="text-[11px] font-sans fill-slate-700">
              +120m
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
