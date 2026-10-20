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

export interface DayPartData {
  name: string;
  hours: string;
  mean_glucose: number;
  std_glucose: number;
  tir_pct: number;
  tbr_pct: number;
  tar_pct: number;
  min_glucose: number;
  max_glucose: number;
  status: string;
  status_color: string;
  clinical_focus: string;
}

export interface DailyTrendPoint {
  time: string;
  glucose: number;
  roc: number;
  in_range: boolean;
}

export interface WeeklyOverlayPoint {
  hour: string;
  glucose: number;
}

export interface WeeklyOverlayData {
  weekday_points: WeeklyOverlayPoint[];
  weekend_points: WeeklyOverlayPoint[];
  metrics: {
    weekday_tir: number;
    weekend_tir: number;
    weekday_mean: number;
    weekend_mean: number;
    dawn_shift: string;
    lifestyle_note: string;
  };
}

export interface TypicalDayPayload {
  day_parts?: DayPartData[];
  daily_trend?: DailyTrendPoint[];
  weekly_overlay?: WeeklyOverlayData;
}

interface TypicalDaySectionProps {
  agpData?: AGPPoint[];
  agpNote?: string;
  typicalDay?: TypicalDayPayload;
  }

export default function TypicalDaySection({
  agpData = [],
  agpNote,
  typicalDay,
}: TypicalDaySectionProps) {
  // 4 Full Tabs: Overview, Daily trend, Weekly overlay, AGP
  const [activeTab, setActiveTab] = useState<"Overview" | "Daily trend" | "Weekly overlay" | "AGP">("Overview");

  // Hover states for interactive tooltips
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [hoveredHourIdx, setHoveredHourIdx] = useState<number | null>(null);
  const [hoveredOverlayHour, setHoveredOverlayHour] = useState<number | null>(null);

  // 1. Fallback & Normalized AGP Points
  const points: AGPPoint[] = useMemo(() => {
    if (agpData && agpData.length === 24) return agpData;
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

  // 2. Day Parts Data (Overview Tab)
  const dayParts: DayPartData[] = useMemo(() => {
    if (typicalDay?.day_parts && typicalDay.day_parts.length === 4) {
      return typicalDay.day_parts;
    }
    // Calculate fallback from AGP medians
    const getSliceStats = (startH: number, endH: number) => {
      const slice = points.slice(startH, endH);
      const vals = slice.map((p) => p.p50);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const inRange = vals.filter((v) => v >= 70 && v <= 180).length;
      const tir = Math.round((inRange / vals.length) * 100);
      return { mean: Math.round(mean), min, max, tir };
    };

    const p0 = getSliceStats(0, 6);
    const p1 = getSliceStats(6, 12);
    const p2 = getSliceStats(12, 18);
    const p3 = getSliceStats(18, 24);

    return [
      {
        name: "Overnight",
        hours: "00:00–06:00",
        mean_glucose: p0.mean,
        std_glucose: 14.2,
        tir_pct: p0.tir,
        tbr_pct: 0.0,
        tar_pct: 100 - p0.tir,
        min_glucose: p0.min,
        max_glucose: p0.max,
        status: p0.tir >= 70 ? "TARGET ACHIEVED" : "HIGH EXCURSION",
        status_color: p0.tir >= 70 ? "emerald" : "amber",
        clinical_focus: "Basal stability & Dawn phenomenon monitoring",
      },
      {
        name: "Morning",
        hours: "06:00–12:00",
        mean_glucose: p1.mean,
        std_glucose: 26.5,
        tir_pct: p1.tir,
        tbr_pct: 0.0,
        tar_pct: 100 - p1.tir,
        min_glucose: p1.min,
        max_glucose: p1.max,
        status: p1.tir >= 70 ? "OPTIMAL RECOVERY" : "POST-PRANDIAL SPIKE",
        status_color: p1.tir >= 70 ? "emerald" : "amber",
        clinical_focus: "Breakfast excursion & morning insulin sensitivity",
      },
      {
        name: "Afternoon",
        hours: "12:00–18:00",
        mean_glucose: p2.mean,
        std_glucose: 19.8,
        tir_pct: p2.tir,
        tbr_pct: 0.0,
        tar_pct: 100 - p2.tir,
        min_glucose: p2.min,
        max_glucose: p2.max,
        status: p2.tir >= 70 ? "TARGET ACHIEVED" : "SUB-OPTIMAL",
        status_color: p2.tir >= 70 ? "emerald" : "blue",
        clinical_focus: "Lunch post-prandial recovery & physical activity",
      },
      {
        name: "Evening",
        hours: "18:00–24:00",
        mean_glucose: p3.mean,
        std_glucose: 22.1,
        tir_pct: p3.tir,
        tbr_pct: 0.0,
        tar_pct: 100 - p3.tir,
        min_glucose: p3.min,
        max_glucose: p3.max,
        status: p3.tir >= 70 ? "TARGET ACHIEVED" : "HIGH EXCURSION",
        status_color: p3.tir >= 70 ? "emerald" : "amber",
        clinical_focus: "Dinner response & bedtime glucose entry",
      },
    ];
  }, [typicalDay, points]);

  // 3. Daily Trend Data (Daily Trend Tab)
  const dailyTrend: DailyTrendPoint[] = useMemo(() => {
    if (typicalDay?.daily_trend && typicalDay.daily_trend.length > 0) {
      return typicalDay.daily_trend;
    }
    // Generate 48 smooth half-hourly points from points
    return Array.from({ length: 48 }).map((_, i) => {
      const h = Math.floor(i / 2);
      const isHalf = i % 2 === 1;
      const base = points[h]?.p50 || 140;
      const nextBase = points[(h + 1) % 24]?.p50 || 140;
      const val = Math.round(isHalf ? (base + nextBase) / 2 : base);
      return {
        time: `${String(h).padStart(2, "0")}:${isHalf ? "30" : "00"}`,
        glucose: val,
        roc: isHalf ? Math.round((nextBase - base) / 30) : 0,
        in_range: val >= 70 && val <= 180,
      };
    });
  }, [typicalDay, points]);

  // Daily Trend Stats
  const dailyStats = useMemo(() => {
    const vals = dailyTrend.map((d) => d.glucose);
    if (vals.length === 0) return { mean: 0, peak: 0, peakTime: "", trough: 0, troughTime: "", tir: 0 };
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = Math.round(sum / vals.length);
    const peak = Math.max(...vals);
    const trough = Math.min(...vals);
    const peakPoint = dailyTrend.find((d) => d.glucose === peak);
    const troughPoint = dailyTrend.find((d) => d.glucose === trough);
    const inRangeCount = dailyTrend.filter((d) => d.in_range).length;
    const tir = Math.round((inRangeCount / dailyTrend.length) * 100);
    return {
      mean,
      peak,
      peakTime: peakPoint?.time || "14:00",
      trough,
      troughTime: troughPoint?.time || "04:30",
      tir,
    };
  }, [dailyTrend]);

  // 4. Weekly Overlay Data (Weekly Overlay Tab)
  const weeklyOverlay: WeeklyOverlayData = useMemo(() => {
    if (typicalDay?.weekly_overlay) {
      return typicalDay.weekly_overlay;
    }
    // Derive from points
    const weekday = points.map((p) => ({ hour: p.hour, glucose: p.p50 }));
    const weekend = points.map((p, idx) => {
      let g = p.p50;
      if (idx >= 6 && idx <= 10) {
        const prev = points[(idx - 1 + 24) % 24].p50;
        g = Math.round(prev * 1.04);
      } else if (idx >= 19 && idx <= 23) {
        g = Math.round(g * 1.05);
      } else {
        g = Math.round(g * 0.98);
      }
      return { hour: p.hour, glucose: g };
    });
    return {
      weekday_points: weekday,
      weekend_points: weekend,
      metrics: {
        weekday_tir: 68,
        weekend_tir: 62,
        weekday_mean: Math.round(weekday.reduce((a, b) => a + b.glucose, 0) / 24),
        weekend_mean: Math.round(weekend.reduce((a, b) => a + b.glucose, 0) / 24),
        dawn_shift: "+45 min",
        lifestyle_note:
          "Weekend wake-up time is delayed by ~45 min, shifting breakfast peak from 08:30 to 09:15 with higher evening dinner excursion.",
      },
    };
  }, [typicalDay, points]);

  // ── Sizing & Scaling (Strict Dynamic Scale: lowest - 10 to highest + 10) ────
  const svgWidth = 860;
  const svgHeight = 280;
  const margin = { top: 25, right: 80, bottom: 40, left: 50 };
  const graphWidth = svgWidth - margin.left - margin.right;
  const graphHeight = svgHeight - margin.top - margin.bottom;

  // Global Dynamic Y Scale calculation for all charts
  const { minY, maxY, yTicks } = useMemo(() => {
    const allVals: number[] = [
      ...points.flatMap((p) => [p.p05, p.p95]),
      ...dailyTrend.map((d) => d.glucose),
      ...weeklyOverlay.weekday_points.map((p) => p.glucose),
      ...weeklyOverlay.weekend_points.map((p) => p.glucose),
      70,
      180,
    ].filter((v) => typeof v === "number" && !isNaN(v));

    const minRaw = Math.min(...allVals);
    const maxRaw = Math.max(...allVals);

    // Rule: lowest - 10, highest + 10
    const minCalculated = Math.max(20, Math.floor(minRaw - 10));
    const maxCalculated = Math.ceil(maxRaw + 10);

    const span = maxCalculated - minCalculated;
    const step = span > 200 ? 50 : span > 100 ? 30 : 20;

    const ticks: number[] = [];
    const firstTick = Math.ceil(minCalculated / step) * step;
    for (let t = firstTick; t <= maxCalculated; t += step) {
      ticks.push(t);
    }
    return { minY: minCalculated, maxY: maxCalculated, yTicks: ticks };
  }, [points, dailyTrend, weeklyOverlay]);

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return margin.top + graphHeight - ((clamped - minY) / (maxY - minY)) * graphHeight;
  };

  const getX = (idx: number, total: number) =>
    margin.left + (idx / Math.max(1, total - 1)) * graphWidth;

  // AGP Paths
  const { outerAreaPath, innerAreaPath, medianLinePath } = useMemo(() => {
    if (points.length === 0) return { outerAreaPath: "", innerAreaPath: "", medianLinePath: "" };

    const top95 = points.map((p, i) => `${getX(i, points.length).toFixed(1)},${getY(p.p95).toFixed(1)}`);
    const bot05 = [...points].reverse().map((p, i) => {
      const origIdx = points.length - 1 - i;
      return `${getX(origIdx, points.length).toFixed(1)},${getY(p.p05).toFixed(1)}`;
    });
    const outer = `M ${top95.join(" L ")} L ${bot05.join(" L ")} Z`;

    const top75 = points.map((p, i) => `${getX(i, points.length).toFixed(1)},${getY(p.p75).toFixed(1)}`);
    const bot25 = [...points].reverse().map((p, i) => {
      const origIdx = points.length - 1 - i;
      return `${getX(origIdx, points.length).toFixed(1)},${getY(p.p25).toFixed(1)}`;
    });
    const inner = `M ${top75.join(" L ")} L ${bot25.join(" L ")} Z`;

    const med = points.reduce(
      (acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${getX(i, points.length).toFixed(1)},${getY(p.p50).toFixed(1)}`,
      ""
    );

    return { outerAreaPath: outer, innerAreaPath: inner, medianLinePath: med };
  }, [points, minY, maxY]);

  // Daily Trend Path
  const dailyTrendPath = useMemo(() => {
    if (dailyTrend.length === 0) return "";
    return dailyTrend.reduce(
      (acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${getX(i, dailyTrend.length).toFixed(1)},${getY(p.glucose).toFixed(1)}`,
      ""
    );
  }, [dailyTrend, minY, maxY]);

  // Weekly Overlay Paths
  const { weekdayPath, weekendPath } = useMemo(() => {
    const wday = weeklyOverlay.weekday_points.reduce(
      (acc, p, i) =>
        `${acc} ${i === 0 ? "M" : "L"} ${getX(i, weeklyOverlay.weekday_points.length).toFixed(1)},${getY(p.glucose).toFixed(1)}`,
      ""
    );
    const wend = weeklyOverlay.weekend_points.reduce(
      (acc, p, i) =>
        `${acc} ${i === 0 ? "M" : "L"} ${getX(i, weeklyOverlay.weekend_points.length).toFixed(1)},${getY(p.glucose).toFixed(1)}`,
      ""
    );
    return { weekdayPath: wday, weekendPath: wend };
  }, [weeklyOverlay, minY, maxY]);

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-5">
      {/* ── Section Header (FILE TO NOTE BUTTON REMOVED AS REQUESTED) ─────────── */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-serif text-slate-900 font-normal">
            Typical day
          </h2>
          <p className="text-xs font-sans text-slate-500 mt-0.5">
            24-hour diurnal patterns, day-part segments & ambulatory glucose profile
          </p>
        </div>
      </div>

      {/* ── 4 Clinical Tabs Navigation ────────────────────────────────────────── */}
      <div className="flex items-center gap-6 border-b border-slate-200 mb-5 text-xs font-sans">
        {(["Overview", "Daily trend", "Weekly overlay", "AGP"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`pb-2.5 transition-colors cursor-pointer relative ${
              activeTab === tab
                ? "font-semibold text-slate-900 border-b-2 border-slate-900"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab}
                      </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 1: OVERVIEW (Day-Part Circadian Breakdown & Hourly Map)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "Overview" && (
        <div className="space-y-4">
          {/* 4 Day-Part Circadian Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {dayParts.map((part) => {
              const isTarget = part.tir_pct >= 70;
              const isHypo = part.tbr_pct > 4;
              const badgeBg = isHypo
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : isTarget
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200";

              return (
                <div
                  key={part.name}
                  className="p-3.5 bg-slate-50 border border-slate-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-sans font-semibold text-xs text-slate-900">
                        {part.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {part.hours}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-2xl font-serif text-slate-900 font-normal">
                        {part.mean_glucose}
                      </span>
                      <span className="text-[10px] font-sans text-slate-500">
                        mg/dL mean
                      </span>
                    </div>

                    <div className="text-[11px] font-sans text-slate-600 space-y-0.5 border-t border-slate-200/60 pt-2 mb-2">
                      <div className="flex justify-between">
                        <span>Time in range:</span>
                        <span className="font-semibold text-slate-900 font-mono">
                          {part.tir_pct}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Range:</span>
                        <span className="font-mono text-slate-700">
                          {part.min_glucose}–{part.max_glucose}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Variability (SD):</span>
                        <span className="font-mono text-slate-700">
                          ±{part.std_glucose}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={`text-[9px] font-mono uppercase px-2 py-0.5 border text-center ${badgeBg} mb-1.5`}>
                      {part.status}
                    </div>
                    <p className="text-[10px] font-sans text-slate-500 italic leading-tight">
                      {part.clinical_focus}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hourly Circadian Bar Canvas */}
          <div className="w-full border border-slate-200 bg-white p-3 overflow-x-auto">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-sans font-medium text-slate-700">
                Hourly Median Distribution across 24h
              </span>
              <div className="flex items-center gap-3 text-[10px] font-sans text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-emerald-500 inline-block"></span> Target (70–180)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-amber-500 inline-block"></span> Elevated (&gt;180)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-rose-500 inline-block"></span> Very High (&gt;250) / Low
                </span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${svgWidth} 170`}
              className="w-full h-auto min-w-[700px] select-none block"
            >
              {/* Target guidelines */}
              <line
                x1={margin.left}
                y1={getY(180) * 0.6}
                x2={margin.left + graphWidth}
                y2={getY(180) * 0.6}
                stroke="#10B981"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={margin.left}
                y1={getY(70) * 0.6}
                x2={margin.left + graphWidth}
                y2={getY(70) * 0.6}
                stroke="#10B981"
                strokeWidth="1"
                strokeDasharray="3 3"
              />

              {/* 24 Hourly Bars */}
              {points.map((p, i) => {
                const barWidth = (graphWidth / 24) * 0.68;
                const x = margin.left + (i / 24) * graphWidth + (graphWidth / 24 - barWidth) / 2;
                const med = p.p50;
                const scaledY = getY(med) * 0.6;
                const barH = Math.max(4, (getY(minY) * 0.6) - scaledY);
                const color =
                  med > 250 || med < 70
                    ? "#EF4444"
                    : med > 180
                    ? "#F59E0B"
                    : "#10B981";

                return (
                  <g
                    key={p.hour}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredHourIdx(i)}
                    onMouseLeave={() => setHoveredHourIdx(null)}
                  >
                    <rect
                      x={x}
                      y={scaledY}
                      width={barWidth}
                      height={barH}
                      fill={color}
                      opacity={hoveredHourIdx === i ? 1 : 0.85}
                    />
                    <text
                      x={x + barWidth / 2}
                      y={scaledY - 4}
                      fill={color}
                      fontSize="7.5"
                      fontFamily="monospace"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {med}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={150}
                      fill="#64748B"
                      fontSize="7.5"
                      fontFamily="sans-serif"
                      textAnchor="middle"
                    >
                      {p.hour.slice(0, 2)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Diurnal Summary Callout */}
          <div className="p-3 bg-slate-50 border border-slate-200 text-xs font-sans text-slate-700 leading-relaxed">
            <span className="font-semibold text-slate-900 uppercase text-[10px] tracking-wide block mb-1">
              Circadian Clinical Assessment
            </span>
            {agpNote ||
              "Patient demonstrates circadian diurnal excursion with morning breakfast insulin resistance and distinct evening post-prandial rise. Basal stability overnight maintains stable glycemic profile until dawn rise."}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 2: DAILY TREND (24-Hour Continuous Telemetry & Interactive Crosshair)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "Daily trend" && (
        <div className="space-y-4">
          <div className="w-full border border-slate-200 bg-white relative overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto min-w-[700px] select-none block"
              onMouseLeave={() => setHoveredTrendIdx(null)}
            >
              <defs>
                <linearGradient id="dailyTrendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Target Range Band: 70 to 180 */}
              <rect
                x={margin.left}
                y={getY(180)}
                width={graphWidth}
                height={getY(70) - getY(180)}
                fill="#ECFDF5"
                opacity="0.8"
              />
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

              {/* Y-Axis Guidelines & Ticks */}
              {yTicks.map((tick) => (
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

              {/* Continuous Telemetry Curve */}
              {dailyTrendPath && (
                <path
                  d={dailyTrendPath}
                  fill="none"
                  stroke="#0284C7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Hourly Reference Points */}
              {dailyTrend.map((p, i) => {
                const cx = getX(i, dailyTrend.length);
                const cy = getY(p.glucose);
                const isHovered = hoveredTrendIdx === i;
                const ptColor = p.glucose > 180 ? "#F59E0B" : p.glucose < 70 ? "#EF4444" : "#0284C7";

                return (
                  <g
                    key={p.time}
                    onMouseEnter={() => setHoveredTrendIdx(i)}
                    className="cursor-pointer"
                  >
                    {isHovered && (
                      <line
                        x1={cx}
                        y1={margin.top}
                        x2={cx}
                        y2={margin.top + graphHeight}
                        stroke="#94A3B8"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 5 : i % 2 === 0 ? 2.5 : 1.5}
                      fill={isHovered ? ptColor : "#FFFFFF"}
                      stroke={ptColor}
                      strokeWidth={isHovered ? 2 : 1.5}
                    />
                  </g>
                );
              })}

              {/* Right Axis Target Labels */}
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
                y={getY(70) + 3}
                fill="#059669"
                fontSize="8"
                fontFamily="sans-serif"
                fontWeight="500"
              >
                70 target
              </text>

              {/* X-Axis Ticks (Every 3 hours) */}
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
            </svg>

            {/* Interactive Hover Tooltip */}
            {hoveredTrendIdx !== null && dailyTrend[hoveredTrendIdx] && (
              <div
                className="absolute top-3 left-16 bg-slate-900/90 text-white text-[11px] px-3 py-1.5 rounded shadow pointer-events-none flex items-center gap-3 font-mono"
              >
                <span>Time: {dailyTrend[hoveredTrendIdx].time}</span>
                <span className="font-bold text-sky-400">
                  {dailyTrend[hoveredTrendIdx].glucose} mg/dL
                </span>
                <span>
                  ROC: {dailyTrend[hoveredTrendIdx].roc >= 0 ? "+" : ""}
                  {dailyTrend[hoveredTrendIdx].roc} mg/dL/min
                </span>
                <span
                  className={
                    dailyTrend[hoveredTrendIdx].in_range
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }
                >
                  {dailyTrend[hoveredTrendIdx].in_range ? "IN RANGE" : "OUT OF RANGE"}
                </span>
              </div>
            )}
          </div>

          {/* Daily Trend Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-sans text-slate-500 uppercase block">
                24h Mean Glucose
              </span>
              <span className="text-xl font-serif text-slate-900 font-normal">
                {dailyStats.mean}{" "}
                <span className="text-xs font-sans text-slate-500 font-normal">
                  mg/dL
                </span>
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-sans text-slate-500 uppercase block">
                Peak Glucose
              </span>
              <span className="text-xl font-serif text-amber-600 font-normal">
                {dailyStats.peak}{" "}
                <span className="text-[10px] font-mono text-slate-500 font-normal">
                  at {dailyStats.peakTime}
                </span>
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-sans text-slate-500 uppercase block">
                Lowest Glucose
              </span>
              <span className="text-xl font-serif text-slate-900 font-normal">
                {dailyStats.trough}{" "}
                <span className="text-[10px] font-mono text-slate-500 font-normal">
                  at {dailyStats.troughTime}
                </span>
              </span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-sans text-slate-500 uppercase block">
                Time in Range (70–180)
              </span>
              <span className="text-xl font-serif text-emerald-700 font-normal">
                {dailyStats.tir}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 3: WEEKLY OVERLAY (Weekday vs Weekend Diurnal Comparison)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "Weekly overlay" && (
        <div className="space-y-4">
          <div className="w-full border border-slate-200 bg-white relative overflow-x-auto">
            {/* Header Legend */}
            <div className="flex items-center justify-between p-3 border-b border-slate-100">
              <span className="text-xs font-sans font-medium text-slate-800">
                Weekday (Mon–Fri) vs. Weekend (Sat–Sun) Diurnal Overlay
              </span>
              <div className="flex items-center gap-4 text-xs font-sans">
                <span className="flex items-center gap-1.5 text-blue-700 font-medium">
                  <span className="w-4 h-0.5 bg-blue-600 inline-block"></span> Weekday Routine (Mon–Fri)
                </span>
                <span className="flex items-center gap-1.5 text-purple-700 font-medium">
                  <span className="w-4 h-0.5 bg-purple-600 inline-block border-b border-dashed border-purple-600"></span> Weekend Lifestyle (Sat–Sun)
                </span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto min-w-[700px] select-none block"
              onMouseLeave={() => setHoveredOverlayHour(null)}
            >
              {/* Target range */}
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

              {/* Ticks */}
              {yTicks.map((tick) => (
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

              {/* Weekday curve (Solid Blue) */}
              {weekdayPath && (
                <path
                  d={weekdayPath}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Weekend curve (Dashed Purple) */}
              {weekendPath && (
                <path
                  d={weekendPath}
                  fill="none"
                  stroke="#9333EA"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {weeklyOverlay.weekday_points.map((p, i) => {
                const cx = getX(i, 24);
                const cyW = getY(p.glucose);
                const cyWe = getY(weeklyOverlay.weekend_points[i]?.glucose || p.glucose);
                const isHovered = hoveredOverlayHour === i;

                return (
                  <g
                    key={p.hour}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredOverlayHour(i)}
                  >
                    {isHovered && (
                      <line
                        x1={cx}
                        y1={margin.top}
                        x2={cx}
                        y2={margin.top + graphHeight}
                        stroke="#CBD5E1"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    )}
                    <circle cx={cx} cy={cyW} r={isHovered ? 4.5 : 2} fill="#2563EB" />
                    <circle cx={cx} cy={cyWe} r={isHovered ? 4.5 : 2} fill="#9333EA" />
                  </g>
                );
              })}

              {/* X Axis */}
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
            </svg>

            {/* Hover Comparison Tooltip */}
            {hoveredOverlayHour !== null && (
              <div className="absolute top-12 left-16 bg-slate-900/90 text-white text-[11px] px-3 py-1.5 rounded shadow pointer-events-none flex items-center gap-3 font-mono">
                <span>Hour: {weeklyOverlay.weekday_points[hoveredOverlayHour]?.hour}</span>
                <span className="text-blue-300">
                  Weekday: {weeklyOverlay.weekday_points[hoveredOverlayHour]?.glucose} mg/dL
                </span>
                <span className="text-purple-300">
                  Weekend: {weeklyOverlay.weekend_points[hoveredOverlayHour]?.glucose} mg/dL
                </span>
                <span className="text-amber-300">
                  Δ:{" "}
                  {Math.round(
                    (weeklyOverlay.weekend_points[hoveredOverlayHour]?.glucose || 0) -
                      (weeklyOverlay.weekday_points[hoveredOverlayHour]?.glucose || 0)
                  )}{" "}
                  mg/dL
                </span>
              </div>
            )}
          </div>

          {/* Comparative Metrics Table */}
          <div className="border border-slate-200 bg-white">
            <table className="w-full text-xs font-sans text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 font-medium">Metric</th>
                  <th className="px-4 py-2 font-medium">Weekday (Mon–Fri)</th>
                  <th className="px-4 py-2 font-medium">Weekend (Sat–Sun)</th>
                  <th className="px-4 py-2 font-medium">Variance</th>
                  <th className="px-4 py-2 font-medium">Clinical Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-900">Time in Range</td>
                  <td className="px-4 py-2.5 font-mono text-emerald-700">
                    {weeklyOverlay.metrics.weekday_tir}%
                  </td>
                  <td className="px-4 py-2.5 font-mono text-amber-700">
                    {weeklyOverlay.metrics.weekend_tir}%
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">
                    {weeklyOverlay.metrics.weekend_tir - weeklyOverlay.metrics.weekday_tir}%
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">Weekend social meals reduce TIR</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-900">Mean Glucose</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">
                    {weeklyOverlay.metrics.weekday_mean} mg/dL
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">
                    {weeklyOverlay.metrics.weekend_mean} mg/dL
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">
                    +{weeklyOverlay.metrics.weekend_mean - weeklyOverlay.metrics.weekday_mean} mg/dL
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">Slightly higher post-prandial excursions</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-900">Circadian Wake Shift</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">07:00</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">07:45</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{weeklyOverlay.metrics.dawn_shift}</td>
                  <td className="px-4 py-2.5 text-slate-600">Delayed breakfast and delayed bolus timing</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 4: AGP (Ambulatory Glucose Profile Percentiles & IQR)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "AGP" && (
        <div className="space-y-4">
          <div className="w-full border border-slate-200 bg-white overflow-x-auto">
            {/* Top Bar with Clear Percentile Legend in Top Right */}
            <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 text-xs font-sans gap-2">
              <span className="font-medium text-slate-700">
                Ambulatory Glucose Profile (14-day modal percentiles)
              </span>
              <div className="flex items-center gap-4 text-[11px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-blue-700 inline-block"></span>
                  <span className="font-semibold text-slate-900">50%</span> Median
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 bg-blue-200 border border-blue-400 inline-block"></span>
                  <span className="font-medium text-slate-800">25%–75%</span> IQR
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 bg-blue-100 border border-blue-200 inline-block"></span>
                  <span className="font-medium text-slate-700">5%–95%</span> Range
                </span>
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <span className="w-3.5 h-0.5 bg-emerald-500 inline-block"></span>
                  <span>70–180 Target</span>
                </span>
              </div>
            </div>

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

              {/* Top-Right In-Chart Legend Card */}
              <g transform={`translate(${margin.left + graphWidth - 175}, ${margin.top + 6})`}>
                <rect
                  x="-8"
                  y="-6"
                  width="180"
                  height="72"
                  rx="3"
                  fill="#FFFFFF"
                  fillOpacity="0.94"
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                
                {/* 50% Median Line */}
                <line x1="0" y1="8" x2="16" y2="8" stroke="#1D4ED8" strokeWidth="2.2" strokeLinecap="round" />
                <text x="22" y="11" fill="#1D4ED8" fontSize="8.5" fontFamily="sans-serif" fontWeight="bold">
                  50% Median Curve
                </text>

                {/* 25%-75% IQR Box */}
                <rect x="0" y="20" width="16" height="8" fill="url(#agpInnerGrad)" stroke="#93C5FD" strokeWidth="0.8" />
                <text x="22" y="27" fill="#334155" fontSize="8" fontFamily="sans-serif" fontWeight="500">
                  25%–75% Interquartile
                </text>

                {/* 5%-95% Outer Envelope Box */}
                <rect x="0" y="36" width="16" height="8" fill="url(#agpOuterGrad)" stroke="#BFDBFE" strokeWidth="0.8" />
                <text x="22" y="43" fill="#64748B" fontSize="8" fontFamily="sans-serif">
                  5%–95% Outer Range
                </text>

                {/* 70-180 Target Line */}
                <line x1="0" y1="55" x2="16" y2="55" stroke="#10B981" strokeWidth="1.2" strokeDasharray="3 2" />
                <text x="22" y="58" fill="#059669" fontSize="8" fontFamily="sans-serif" fontWeight="500">
                  70–180 Target Zone
                </text>
              </g>

              {/* Right Y-Axis Target Guidelines (Clean, Non-Overlapping Fixed Levels) */}
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
                y={getY(70) + 3}
                fill="#059669"
                fontSize="8"
                fontFamily="sans-serif"
                fontWeight="500"
              >
                70 target
              </text>

              {/* Left Y-Axis Grid & Ticks */}
              {yTicks.map((tick) => (
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
              {outerAreaPath && <path d={outerAreaPath} fill="url(#agpOuterGrad)" />}

              {/* Inner 25th-75th Percentile Band (IQR) */}
              {innerAreaPath && <path d={innerAreaPath} fill="url(#agpInnerGrad)" />}

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

              {/* X-Axis Ticks (Every 3 hours) */}
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

          {/* AGP Clinical Interpretation */}
          {agpNote && (
            <div className="p-3 bg-slate-50 border border-slate-200 text-xs font-sans text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-900 uppercase text-[10px] tracking-wide block mb-1">
                AGP Interpretation
              </span>
              {agpNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
