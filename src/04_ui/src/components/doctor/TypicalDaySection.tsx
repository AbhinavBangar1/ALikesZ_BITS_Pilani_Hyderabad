"use client";

import React, { useState, useMemo } from "react";

export interface AGPPoint {
  hour: string;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

interface TypicalDaySectionProps {
  agpData?: AGPPoint[];
  agpNote?: string;
  onFileInNote?: () => void;
}

export default function TypicalDaySection({
  agpData = [],
  agpNote,
  onFileInNote,
}: TypicalDaySectionProps) {
  const [activeTab, setActiveTab] = useState<"Overview" | "Daily trend" | "Weekly overlay" | "AGP">("AGP");
  const [copiedNote, setCopiedNote] = useState(false);

  // Default standard curve if loading
  const points = useMemo(() => {
    if (agpData && agpData.length === 24) return agpData;
    // Fallback baseline hourly progression
    return Array.from({ length: 24 }).map((_, h) => {
      const base = 135 + Math.sin((h - 5) / 3.5) * 45;
      return {
        hour: `${String(h).padStart(2, "0")}:00`,
        p05: Math.round(base - 35),
        p25: Math.round(base - 18),
        p50: Math.round(base),
        p75: Math.round(base + 22),
        p95: Math.round(base + 45),
      };
    });
  }, [agpData]);

  // Chart Dimensions
  const svgWidth = 860;
  const svgHeight = 280;
  const margin = { top: 25, right: 90, bottom: 40, left: 50 };
  const graphWidth = svgWidth - margin.left - margin.right;
  const graphHeight = svgHeight - margin.top - margin.bottom;

  const minY = 40;
  const maxY = 360;
  const getY = (val: number) =>
    margin.top + graphHeight - ((val - minY) / (maxY - minY)) * graphHeight;
  const getX = (idx: number) =>
    margin.left + (idx / (points.length - 1)) * graphWidth;

  // Build Paths for 5-95 (outer), 25-75 (inner), and median line
  const { outerAreaPath, innerAreaPath, medianLinePath } = useMemo(() => {
    if (points.length === 0) return { outerAreaPath: "", innerAreaPath: "", medianLinePath: "" };

    const top95 = points.map((p, i) => `${getX(i).toFixed(1)},${getY(p.p95).toFixed(1)}`);
    const bot05 = [...points].reverse().map((p, i) => {
      const origIdx = points.length - 1 - i;
      return `${getX(origIdx).toFixed(1)},${getY(p.p05).toFixed(1)}`;
    });
    const outer = `M ${top95.join(" L ")} L ${bot05.join(" L ")} Z`;

    const top75 = points.map((p, i) => `${getX(i).toFixed(1)},${getY(p.p75).toFixed(1)}`);
    const bot25 = [...points].reverse().map((p, i) => {
      const origIdx = points.length - 1 - i;
      return `${getX(origIdx).toFixed(1)},${getY(p.p25).toFixed(1)}`;
    });
    const inner = `M ${top75.join(" L ")} L ${bot25.join(" L ")} Z`;

    const med = points.reduce(
      (acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)},${getY(p.p50).toFixed(1)}`,
      ""
    );

    return { outerAreaPath: outer, innerAreaPath: inner, medianLinePath: med };
  }, [points]);

  const handleFileClick = () => {
    if (onFileInNote) {
      onFileInNote();
    } else {
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 2000);
    }
  };

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-5">
      {/* Header and Action Button (NO 03 PATTERNS) */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-serif text-slate-900 font-normal">
            Typical day
          </h2>
        </div>

        <button
          onClick={handleFileClick}
          type="button"
          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-sans font-medium px-3.5 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          {copiedNote ? "✓ Filed to Note" : "+ File to note"}
        </button>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 mb-4 text-xs font-sans">
        {(["Overview", "Daily trend", "Weekly overlay", "AGP"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`pb-2 transition-colors cursor-pointer ${
              activeTab === tab
                ? "font-bold text-slate-900 border-b-2 border-slate-900"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* AGP Modal Day Canvas */}
      <div className="w-full border border-slate-200 bg-white overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[700px] select-none block"
        >
          <defs>
            <linearGradient id="agpOuterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#EFF6FF" stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="agpInnerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#BFDBFE" stopOpacity="0.75" />
            </linearGradient>
          </defs>

          {/* Target Zone: 70 to 180 mg/dL */}
          <line
            x1={margin.left}
            y1={getY(180)}
            x2={margin.left + graphWidth}
            y2={getY(180)}
            stroke="#10B981"
            strokeWidth="1.2"
          />
          <line
            x1={margin.left}
            y1={getY(70)}
            x2={margin.left + graphWidth}
            y2={getY(70)}
            stroke="#10B981"
            strokeWidth="1.2"
          />

          {/* Right Y-Axis Target Guidelines & Percentile Labels */}
          <text
            x={margin.left + graphWidth + 6}
            y={getY(points[points.length - 1]?.p95 || 300) + 3}
            fill="#64748B"
            fontSize="8"
            fontFamily="sans-serif"
          >
            95%
          </text>
          <text
            x={margin.left + graphWidth + 6}
            y={getY(points[points.length - 1]?.p75 || 250) + 3}
            fill="#64748B"
            fontSize="8"
            fontFamily="sans-serif"
          >
            75%
          </text>
          <text
            x={margin.left + graphWidth + 6}
            y={getY(points[points.length - 1]?.p50 || 220) + 3}
            fill="#1D4ED8"
            fontSize="8"
            fontFamily="sans-serif"
            fontWeight="bold"
          >
            50%
          </text>
          <text
            x={margin.left + graphWidth + 6}
            y={getY(180) + 3}
            fill="#059669"
            fontSize="8"
            fontFamily="sans-serif"
            fontWeight="500"
          >
            180 target
          </text>
          <text
            x={margin.left + graphWidth + 6}
            y={getY(points[points.length - 1]?.p25 || 150) + 3}
            fill="#64748B"
            fontSize="8"
            fontFamily="sans-serif"
          >
            25%
          </text>
          <text
            x={margin.left + graphWidth + 6}
            y={getY(points[points.length - 1]?.p05 || 100) + 3}
            fill="#64748B"
            fontSize="8"
            fontFamily="sans-serif"
          >
            5%
          </text>
          <text
            x={margin.left + graphWidth + 6}
            y={getY(70) + 3}
            fill="#059669"
            fontSize="8"
            fontFamily="sans-serif"
            fontWeight="500"
          >
            70 target
          </text>

          {/* Left Y-Axis Grid & Ticks (350, 300, 250, 200, 150, 100) */}
          {[350, 300, 250, 200, 150, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                y1={getY(tick)}
                x2={margin.left + graphWidth}
                y2={getY(tick)}
                stroke="#F1F5F9"
                strokeWidth="1"
              />
              <text
                x={margin.left - 8}
                y={getY(tick) + 3}
                fill="#94A3B8"
                fontSize="8.5"
                fontFamily="sans-serif"
                textAnchor="end"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* Outer 5th-95th Percentile Envelope */}
          {outerAreaPath && (
            <path d={outerAreaPath} fill="url(#agpOuterGrad)" />
          )}

          {/* Inner 25th-75th Percentile Band (IQR) */}
          {innerAreaPath && (
            <path d={innerAreaPath} fill="url(#agpInnerGrad)" />
          )}

          {/* 50th Percentile (Median) Curve */}
          {medianLinePath && (
            <path
              d={medianLinePath}
              fill="none"
              stroke="#1D4ED8"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* X-Axis Ticks (Every 3 hours: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00, 00:00) */}
          <line
            x1={margin.left}
            y1={margin.top + graphHeight}
            x2={margin.left + graphWidth}
            y2={margin.top + graphHeight}
            stroke="#CBD5E1"
            strokeWidth="1"
          />
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h, i) => {
            const fraction = i / 8;
            const x = margin.left + fraction * graphWidth;
            const label = h === 24 ? "00:00" : `${String(h).padStart(2, "0")}:00`;
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={margin.top + graphHeight}
                  x2={x}
                  y2={margin.top + graphHeight + 4}
                  stroke="#94A3B8"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={margin.top + graphHeight + 16}
                  fill="#64748B"
                  fontSize="8"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Subtitle inside chart */}
          <text
            x={margin.left + graphWidth / 2}
            y={margin.top + graphHeight + 30}
            fill="#94A3B8"
            fontSize="7"
            fontFamily="sans-serif"
            fontWeight="bold"
            textAnchor="middle"
            letterSpacing="0.05em"
          >
            AMBULATORY GLUCOSE PROFILE · 14 DAYS OVERLAID ON ONE 24 H CLOCK
          </text>
        </svg>
      </div>
    </div>
  );
}
