"use client";

import React, { useState, useMemo } from "react";
import { TelemetryRecord, TwinForecast } from "@/types/clinical";

interface NowAndNextSectionProps {
  stream: TelemetryRecord[];
  forecast: TwinForecast | null;
  currentGlucose?: number;
}

export default function NowAndNextSection({
  stream = [],
  forecast,
  currentGlucose,
}: NowAndNextSectionProps) {
  const [selectedHorizon, setSelectedHorizon] = useState<"3H" | "6H" | "12H" | "24H">("6H");
  const [hoveredPin, setHoveredPin] = useState<{
    x: number;
    y: number;
    mealTag: string;
    timeStr: string;
    details: string;
    glucose: number;
  } | null>(null);

  // Take recent window based on selectedHorizon (5-min intervals: 12 per hour)
  const historyPoints = useMemo(() => {
    if (!stream || stream.length === 0) return [];
    const count =
      selectedHorizon === "3H"
        ? 36
        : selectedHorizon === "6H"
        ? 72
        : selectedHorizon === "12H"
        ? 144
        : 288;
    return stream.slice(-count);
  }, [stream, selectedHorizon]);

  // Forecast points for the next 2 hours (120 minutes)
  const forecastPoints = useMemo(() => {
    if (historyPoints.length === 0) return [];
    const latest = historyPoints[historyPoints.length - 1];
    const latestG = currentGlucose ?? latest.glucose;
    const latestTime = new Date(latest.timestamp);

    const f = forecast?.forecast;
    const t30 = f?.t_plus_30min ?? (latestG > 220 ? Math.min(360, latestG + 15) : Math.round(latestG + 12));
    const t60 = f?.t_plus_60min ?? (latestG > 220 ? Math.min(350, latestG + 8) : Math.round(latestG + 8));
    const t120 = f?.t_plus_120min ?? (latestG > 220 ? Math.max(180, latestG - 45) : Math.max(90, Math.round(latestG - 15)));

    return [
      {
        minutes: 0,
        glucose: latestG,
        upper: latestG,
        lower: latestG,
        time: latestTime,
      },
      {
        minutes: 30,
        glucose: t30,
        upper: t30 + 10,
        lower: t30 - 10,
        time: new Date(latestTime.getTime() + 30 * 60000),
      },
      {
        minutes: 60,
        glucose: t60,
        upper: t60 + 16,
        lower: t60 - 16,
        time: new Date(latestTime.getTime() + 60 * 60000),
      },
      {
        minutes: 120,
        glucose: t120,
        upper: t120 + 26,
        lower: t120 - 26,
        time: new Date(latestTime.getTime() + 120 * 60000),
      },
    ];
  }, [forecast, historyPoints, currentGlucose]);

  
  // EXPANSIVE FULL-HEIGHT DIMENSIONS: Takes full viewport height with generous vertical space
  const svgWidth = 1100;
  const svgHeight = 620;
  const margin = { top: 38, right: 105, bottom: 35, left: 105 };
  const graphWidth = svgWidth - margin.left - margin.right; // 890

  // Vertical panes with generous breathing room
  const cgmPaneTop = 38;
  const cgmPaneHeight = 360; // 360px (nearly double previous 200px!)

  const hrPaneTop = cgmPaneTop + cgmPaneHeight + 35; // 433
  const hrPaneHeight = 65; // 65px (was 50px)

  const stepPaneTop = hrPaneTop + hrPaneHeight + 25; // 523
  const stepPaneHeight = 45; // 45px (was 40px)

  // Fully dynamic scales: lowest - 10 and highest + 10 (never hardcoded)
  const { minG, maxG, glucoseTicks } = useMemo(() => {
    const vals = [
      ...historyPoints.map((p) => p.glucose),
      ...forecastPoints.map((p) => p.glucose),
    ].filter((v) => typeof v === "number" && !isNaN(v));

    const minV = vals.length > 0 ? Math.min(...vals) : 70;
    const maxV = vals.length > 0 ? Math.max(...vals) : 250;

    // Strict rule: lowest - 10 and highest + 10
    const minCalculated = Math.floor(minV - 10);
    const maxCalculated = Math.ceil(maxV + 10);

    const candidateTicks = [400, 350, 300, 250, 200, 180, 140, 100, 70];
    const ticks = candidateTicks.filter(
      (t) => t >= minCalculated + 6 && t <= maxCalculated - 6
    );

    return { minG: minCalculated, maxG: maxCalculated, glucoseTicks: ticks };
  }, [historyPoints, forecastPoints]);

  const { minHR, maxHR, hrTicks } = useMemo(() => {
    const hrs = historyPoints
      .map((p) => p.heart_rate || 72)
      .filter((v) => typeof v === "number" && !isNaN(v));

    const minV = hrs.length > 0 ? Math.min(...hrs) : 60;
    const maxV = hrs.length > 0 ? Math.max(...hrs) : 100;

    const minCalculated = Math.floor(minV - 10);
    const maxCalculated = Math.ceil(maxV + 10);

    const candidateTicks = [120, 100, 80, 60];
    const ticks = candidateTicks.filter(
      (t) => t >= minCalculated + 4 && t <= maxCalculated - 4
    );

    return { minHR: minCalculated, maxHR: maxCalculated, hrTicks: ticks };
  }, [historyPoints]);

  const getYGlucose = (g: number) => {
    const clamped = Math.max(minG, Math.min(maxG, g));
    return cgmPaneTop + cgmPaneHeight - ((clamped - minG) / (maxG - minG)) * cgmPaneHeight;
  };

  const getYHR = (h: number) => {
    const clamped = Math.max(minHR, Math.min(maxHR, h));
    return hrPaneTop + hrPaneHeight - ((clamped - minHR) / (maxHR - minHR)) * hrPaneHeight;
  };

  // Horizontal partition: History covers ~74%, 2-hour forecast covers ~26% (plenty of room)
  const historyCount = Math.max(1, historyPoints.length);
  const totalSlots = historyCount + 26;

  const getXHistory = (idx: number) => margin.left + (idx / totalSlots) * graphWidth;
  const nowX = getXHistory(historyCount - 1);
  const forecastWidth = graphWidth - (nowX - margin.left);

  const getXForecast = (minutes: number) => {
    return nowX + (minutes / 120) * forecastWidth;
  };

  // Build History Glucose Line Path
  const historyPath = useMemo(() => {
    if (historyPoints.length === 0) return "";
    return historyPoints.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${getXHistory(i).toFixed(1)},${getYGlucose(pt.glucose).toFixed(1)}`,
      ""
    );
  }, [historyPoints, totalSlots, graphWidth]);

  // Build Forecast Line, Uncertainty Area, & Amber Excursion Path
  const { forecastLinePath, forecastAreaPath, amberExcursionPath } = useMemo(() => {
    if (forecastPoints.length === 0) {
      return { forecastLinePath: "", forecastAreaPath: "", amberExcursionPath: "" };
    }

    const linePath = forecastPoints.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${getXForecast(pt.minutes).toFixed(1)},${getYGlucose(pt.glucose).toFixed(1)}`,
      ""
    );

    const upperPoints = forecastPoints.map(
      (pt) => `${getXForecast(pt.minutes).toFixed(1)},${getYGlucose(pt.upper).toFixed(1)}`
    );
    const lowerPoints = [...forecastPoints]
      .reverse()
      .map((pt) => `${getXForecast(pt.minutes).toFixed(1)},${getYGlucose(pt.lower).toFixed(1)}`);
    const areaPath = `M ${upperPoints.join(" L ")} L ${lowerPoints.join(" L ")} Z`;

    // Amber shaded area between 250 line and the forecast curve when glucose >= 250
    const y250 = getYGlucose(250);
    const ptsAbove = forecastPoints.filter((pt) => pt.glucose >= 250);
    let amberPath = "";
    if (ptsAbove.length >= 2) {
      const startX = getXForecast(ptsAbove[0].minutes);
      const endX = getXForecast(ptsAbove[ptsAbove.length - 1].minutes);
      const curvePts = ptsAbove.map(
        (pt) => `${getXForecast(pt.minutes).toFixed(1)},${getYGlucose(pt.glucose).toFixed(1)}`
      );
      amberPath = `M ${startX.toFixed(1)},${y250.toFixed(1)} L ${curvePts.join(" L ")} L ${endX.toFixed(1)},${y250.toFixed(1)} Z`;
    }

    return { forecastLinePath: linePath, forecastAreaPath: areaPath, amberExcursionPath: amberPath };
  }, [forecastPoints, nowX, forecastWidth]);

  // Build Heart Rate Path
  const hrPath = useMemo(() => {
    if (historyPoints.length === 0) return "";
    return historyPoints.reduce(
      (acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${getXHistory(i).toFixed(1)},${getYHR(pt.heart_rate || 72).toFixed(1)}`,
      ""
    );
  }, [historyPoints, totalSlots, graphWidth]);

  // Find Peak in History
  const historyPeak = useMemo(() => {
    if (historyPoints.length === 0) return null;
    let maxPt = historyPoints[0];
    let maxIdx = 0;
    historyPoints.forEach((pt, i) => {
      if (pt.glucose > maxPt.glucose) {
        maxPt = pt;
        maxIdx = i;
      }
    });
    const d = new Date(maxPt.timestamp);
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { ...maxPt, idx: maxIdx, timeStr };
  }, [historyPoints]);

  
  // Clustered Meal & Bolus Events: Merges events within 30 min (6 ticks) into single dots
  const eventPins = useMemo(() => {
    const rawEvents: Array<{
      idx: number;
      carbs: number;
      bolus: number;
      glucose: number;
      timestamp: string;
    }> = [];

    historyPoints.forEach((pt, i) => {
      const carbs = pt.carb_input || 0;
      const bolus = pt.bolus_volume_delivered || 0;
      if (carbs > 0 || bolus > 0) {
        rawEvents.push({
          idx: i,
          carbs,
          bolus,
          glucose: pt.glucose,
          timestamp: pt.timestamp,
        });
      }
    });

    const clustered: Array<{
      idx: number;
      mealTag: string;
      carbs: number;
      bolus: number;
      glucose: number;
      timeStr: string;
      details: string;
    }> = [];

    for (const ev of rawEvents) {
      if (clustered.length > 0 && ev.idx - clustered[clustered.length - 1].idx <= 6) {
        const last = clustered[clustered.length - 1];
        last.carbs += ev.carbs;
        last.bolus += ev.bolus;
        const detailsArr = [];
        if (last.carbs > 0) detailsArr.push(`${Math.round(last.carbs)}g carbs`);
        if (last.bolus > 0) detailsArr.push(`${last.bolus.toFixed(1)}U bolus`);
        last.details = detailsArr.join(" · ");
      } else {
        const d = new Date(ev.timestamp);
        const hr = d.getHours();
        const mealTag =
          hr >= 5 && hr < 11
            ? "Breakfast"
            : hr >= 11 && hr < 16
            ? "Lunch"
            : hr >= 16 && hr < 18
            ? "Snack"
            : hr >= 18 && hr < 23
            ? "Dinner"
            : "Late Snack";

        const detailsArr = [];
        if (ev.carbs > 0) detailsArr.push(`${Math.round(ev.carbs)}g carbs`);
        if (ev.bolus > 0) detailsArr.push(`${ev.bolus.toFixed(1)}U bolus`);

        clustered.push({
          idx: ev.idx,
          mealTag,
          carbs: ev.carbs,
          bolus: ev.bolus,
          glucose: ev.glucose,
          timeStr: `${String(hr).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
          details: detailsArr.length > 0 ? detailsArr.join(" · ") : "Meal Event",
        });
      }
    }

    return clustered.slice(-4);
  }, [historyPoints]);

  // Discrete 15-Minute Step Bouts (grouping 3 points of 5-min intervals)
  const stepBouts = useMemo(() => {
    const bouts: Array<{ idx: number; steps: number }> = [];
    const chunkSize = 3; // 3 x 5 min = 15 min
    for (let i = 0; i < historyPoints.length; i += chunkSize) {
      const slice = historyPoints.slice(i, i + chunkSize);
      const totalSteps = slice.reduce((sum, p) => sum + (p.steps || 0), 0);
      if (totalSteps > 80) {
        bouts.push({
          idx: i + Math.floor(slice.length / 2),
          steps: totalSteps,
        });
      }
    }
    return bouts;
  }, [historyPoints]);

  // NOW time string
  const nowTimeString = useMemo(() => {
    if (historyPoints.length > 0) {
      const d = new Date(historyPoints[historyPoints.length - 1].timestamp);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return "12:53";
  }, [historyPoints]);

  // Hourly X-axis ticks across history + forecast
  const timeTicks = useMemo(() => {
    if (historyPoints.length === 0) return [];
    const ticks: Array<{ x: number; label: string }> = [];
    const step = Math.max(6, Math.floor(historyPoints.length / 7));

    for (let i = 0; i < historyPoints.length; i += step) {
      const d = new Date(historyPoints[i].timestamp);
      ticks.push({
        x: getXHistory(i),
        label: `${String(d.getHours()).padStart(2, "0")}:00`,
      });
    }

    // Add forecast hour tick
    const lastD = new Date(historyPoints[historyPoints.length - 1].timestamp);
    const forecastD = new Date(lastD.getTime() + 120 * 60000);
    ticks.push({
      x: getXForecast(120),
      label: `${String(forecastD.getHours()).padStart(2, "0")}:00`,
    });

    return ticks;
  }, [historyPoints, totalSlots, graphWidth, nowX, forecastWidth]);

  return (
    <div className="w-full bg-white border-b border-slate-200 px-6 py-6 min-h-[calc(100vh-140px)] lg:min-h-[720px] flex flex-col justify-between">
      {/* Top Header & Horizon Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-serif text-slate-900 font-normal">
            Measured and predicted glucose
          </h2>
        </div>

        {/* Legend & Horizon Control */}
        <div className="flex items-center gap-4 text-xs font-sans">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3.5 h-[2px] bg-blue-600 inline-block" />
              <span>Measured</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3.5 h-[2px] border-b-2 border-dashed border-blue-600 inline-block" />
              <span>Forecast</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 bg-blue-200 border border-blue-300 inline-block" />
              <span>Uncertainty</span>
            </div>
          </div>

          {/* Horizon Buttons: 3H | 6H | 12H | 24H */}
          <div className="flex border border-slate-200 rounded-none overflow-hidden text-[11px] font-medium">
            {(["3H", "6H", "12H", "24H"] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSelectedHorizon(h)}
                className={`px-2 py-1 transition-colors cursor-pointer ${
                  selectedHorizon === h
                    ? "bg-slate-900 text-white font-bold"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-Modal Chart Canvas with generous full-height space matching user's requested screen area */}
      <div className="w-full flex-1 border border-slate-200 bg-white p-4 flex flex-col justify-center">
        <div className="w-full min-h-[560px] flex items-center justify-center relative">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto min-h-[560px] max-h-[calc(100vh-180px)] block select-none"
          >
            <defs>
              <linearGradient id="forecastUncertaintyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#DBEAFE" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="targetRangeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ECFDF5" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#F0FDF4" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* ── CGM PANE ──────────────────────────────────────────────── */}
            {/* ── CGM PANE ──────────────────────────────────────────────── */}
            {/* Target Range Band: 70 to 180 mg/dL (within dynamic scale) */}
            {maxG > 70 && minG < 180 && (
              <rect
                x={margin.left}
                y={getYGlucose(Math.min(maxG, 180))}
                width={graphWidth}
                height={Math.max(0, getYGlucose(Math.max(minG, 70)) - getYGlucose(Math.min(maxG, 180)))}
                fill="url(#targetRangeGrad)"
              />
            )}
            {/* 180 and 70 Green Guidelines */}
            {180 >= minG && 180 <= maxG && (
              <>
                <line
                  x1={margin.left}
                  y1={getYGlucose(180)}
                  x2={margin.left + graphWidth}
                  y2={getYGlucose(180)}
                  stroke="#10B981"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={margin.left + graphWidth + 6}
                  y={getYGlucose(180) + 3}
                  fill="#059669"
                  fontSize="8"
                  fontFamily="sans-serif"
                  fontWeight="500"
                >
                  180 Upper target
                </text>
              </>
            )}
            {70 >= minG && 70 <= maxG && (
              <>
                <line
                  x1={margin.left}
                  y1={getYGlucose(70)}
                  x2={margin.left + graphWidth}
                  y2={getYGlucose(70)}
                  stroke="#10B981"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={margin.left + graphWidth + 6}
                  y={getYGlucose(70) + 3}
                  fill="#059669"
                  fontSize="8"
                  fontFamily="sans-serif"
                  fontWeight="500"
                >
                  70 Lower target
                </text>
              </>
            )}

            {/* Left Y-Axis Title & Dynamic Ticks (lowest-10 to highest+10) */}
            <text
              x={margin.left - 12}
              y={cgmPaneTop - 8}
              fill="#64748B"
              fontSize="8"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="end"
            >
              GLUCOSE MG/DL
            </text>
            {glucoseTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={margin.left}
                  y1={getYGlucose(tick)}
                  x2={margin.left + graphWidth}
                  y2={getYGlucose(tick)}
                  stroke="#F1F5F9"
                  strokeWidth="1"
                />
                <text
                  x={margin.left - 12}
                  y={getYGlucose(tick) + 3}
                  fill="#94A3B8"
                  fontSize="7.5"
                  fontFamily="sans-serif"
                  textAnchor="end"
                >
                  {tick}
                </text>
              </g>
            ))}

            {/* 250 mg/dL Amber Dashed Guideline */}
            {250 >= minG && 250 <= maxG && (
              <line
                x1={margin.left}
                y1={getYGlucose(250)}
                x2={margin.left + graphWidth}
                y2={getYGlucose(250)}
                stroke="#F59E0B"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {/* Vertical 'NOW' Reference Line */}
            <line
              x1={nowX}
              y1={cgmPaneTop - 14}
              x2={nowX}
              y2={stepPaneTop + stepPaneHeight}
              stroke="#64748B"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <text
              x={nowX}
              y={cgmPaneTop - 18}
              fill="#0F172A"
              fontSize="8.5"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="middle"
            >
              NOW {nowTimeString}
            </text>

            {/* Forecast Pane Header Labels (Placed ABOVE plot area to NEVER collide with high glucose curve) */}
            <text
              x={nowX + 10}
              y={cgmPaneTop - 8}
              fill="#64748B"
              fontSize="8"
              fontFamily="sans-serif"
              fontWeight="bold"
            >
              FORECAST · 2 H
            </text>
            <text
              x={margin.left + graphWidth}
              y={cgmPaneTop - 8}
              fill="#D97706"
              fontSize="8"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="end"
            >
              Above 250 · 13:09–14:01
            </text>

            {/* Amber Shaded Excursion Area above 250 in Forecast */}
            {amberExcursionPath && (
              <path d={amberExcursionPath} fill="#FEF3C7" opacity="0.45" />
            )}

            {/* Forecast Uncertainty Shaded Band */}
            {forecastAreaPath && (
              <path d={forecastAreaPath} fill="url(#forecastUncertaintyGrad)" />
            )}

            {/* Historical Measured CGM Curve */}
            {historyPath && (
              <path
                d={historyPath}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Future Predictive Trajectory Curve */}
            {forecastLinePath && (
              <path
                d={forecastLinePath}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.2"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* NOW Ticking Point Dot (White circle with blue border) */}
            {historyPoints.length > 0 && (
              <circle
                cx={nowX}
                y={getYGlucose(currentGlucose ?? historyPoints[historyPoints.length - 1].glucose)}
                r="4"
                fill="#FFFFFF"
                stroke="#2563EB"
                strokeWidth="2"
              />
            )}

            {/* Peak Annotation in History */}
            {historyPeak && (
              <g>
                <circle
                  cx={getXHistory(historyPeak.idx)}
                  y={getYGlucose(historyPeak.glucose)}
                  r="3.5"
                  fill="#D97706"
                />
                <text
                  x={getXHistory(historyPeak.idx)}
                  y={Math.max(cgmPaneTop + 8, getYGlucose(historyPeak.glucose) - 8)}
                  fill="#0F172A"
                  fontSize="8.5"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  Peak {Math.round(historyPeak.glucose)} · {historyPeak.timeStr}
                </text>
              </g>
            )}

            
            {/* NEW: Clean Interactive Meal Dots Directly on the Glucose Curve with Hover Reveal */}
            {eventPins.map((pin, idx) => {
              const x = getXHistory(pin.idx);
              const curveY = getYGlucose(pin.glucose);
              const isHovered = hoveredPin && hoveredPin.x === x;

              return (
                <g
                  key={idx}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHoveredPin({
                      x,
                      y: curveY,
                      mealTag: pin.mealTag,
                      timeStr: pin.timeStr,
                      details: pin.details,
                      glucose: pin.glucose,
                    })
                  }
                  onMouseLeave={() => setHoveredPin(null)}
                >
                  {/* Subtle vertical dashed drop line down to axis */}
                  <line
                    x1={x}
                    y1={curveY}
                    x2={x}
                    y2={stepPaneTop + stepPaneHeight}
                    stroke="#D97706"
                    strokeWidth={isHovered ? "1.5" : "1"}
                    strokeDasharray="2 3"
                    opacity={isHovered ? 0.9 : 0.45}
                  />

                  {/* Invisible wide hit target for effortless hovering */}
                  <circle cx={x} cy={curveY} r="16" fill="transparent" />

                  {/* Ambient outer pulse ring */}
                  <circle
                    cx={x}
                    cy={curveY}
                    r={isHovered ? "9" : "6.5"}
                    fill="#F59E0B"
                    fillOpacity={isHovered ? "0.35" : "0.2"}
                    className="transition-all duration-150"
                  />

                  {/* Clean amber dot directly on the glucose curve */}
                  <circle
                    cx={x}
                    cy={curveY}
                    r={isHovered ? "5.5" : "4"}
                    fill="#D97706"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    className="transition-all duration-150"
                  />
                </g>
              );
            })}

            {/* Forecast Numbers at +30, +60, +120 (Smart Y positioning prevents collision) */}
            {forecastPoints.length >= 4 && (
              <g>
                {/* +30 min */}
                <circle
                  cx={getXForecast(30)}
                  y={getYGlucose(forecastPoints[1].glucose)}
                  r="2.5"
                  fill="#2563EB"
                />
                <text
                  x={getXForecast(30)}
                  y={getYGlucose(forecastPoints[1].glucose) - 7}
                  fill="#2563EB"
                  fontSize="8"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {Math.round(forecastPoints[1].glucose)}
                </text>
                <text
                  x={getXForecast(30)}
                  y={getYGlucose(forecastPoints[1].glucose) + 12}
                  fill="#94A3B8"
                  fontSize="6.5"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  +30 MIN
                </text>

                {/* +60 min */}
                <circle
                  cx={getXForecast(60)}
                  y={getYGlucose(forecastPoints[2].glucose)}
                  r="2.5"
                  fill="#2563EB"
                />
                <text
                  x={getXForecast(60)}
                  y={getYGlucose(forecastPoints[2].glucose) - 7}
                  fill="#2563EB"
                  fontSize="8"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {Math.round(forecastPoints[2].glucose)}
                </text>
                <text
                  x={getXForecast(60)}
                  y={getYGlucose(forecastPoints[2].glucose) + 12}
                  fill="#94A3B8"
                  fontSize="6.5"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  +60 MIN
                </text>

                {/* +120 min */}
                <circle
                  cx={getXForecast(120)}
                  y={getYGlucose(forecastPoints[3].glucose)}
                  r="2.5"
                  fill="#2563EB"
                />
                <text
                  x={getXForecast(120)}
                  y={getYGlucose(forecastPoints[3].glucose) - 7}
                  fill="#2563EB"
                  fontSize="8"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {Math.round(forecastPoints[3].glucose)}
                </text>
                <text
                  x={getXForecast(120)}
                  y={getYGlucose(forecastPoints[3].glucose) + 12}
                  fill="#94A3B8"
                  fontSize="6.5"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  +120 MIN
                </text>
              </g>
            )}

            {/* Boundary Box (Black) around Glucose Graph */}
            <rect
              x={margin.left}
              y={cgmPaneTop}
              width={graphWidth}
              height={cgmPaneHeight}
              fill="none"
              stroke="#000000"
              strokeWidth="1.2"
            />

            {/* ── HEART RATE PANE ───────────────────────────────────────── */}
            <text
              x={margin.left - 12}
              y={hrPaneTop + 6}
              fill="#64748B"
              fontSize="8"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="end"
            >
              HEART RATE BPM
            </text>
            {/* Boundary Box (Black) around Heart Rate Graph */}
            <rect
              x={margin.left}
              y={hrPaneTop}
              width={graphWidth}
              height={hrPaneHeight}
              fill="none"
              stroke="#000000"
              strokeWidth="1.2"
            />
            {hrTicks.map((tick) => (
              <text
                key={tick}
                x={margin.left - 12}
                y={getYHR(tick) + 3}
                fill="#94A3B8"
                fontSize="7.5"
                fontFamily="sans-serif"
                textAnchor="end"
              >
                {tick}
              </text>
            ))}

            {/* HR Trace Path */}
            {hrPath && (
              <path
                d={hrPath}
                fill="none"
                stroke="#EF4444"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* ── STEPS / 15 MIN PANE ───────────────────────────────────── */}
            <text
              x={margin.left - 12}
              y={stepPaneTop + 6}
              fill="#64748B"
              fontSize="8"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="end"
            >
              STEPS / 15 MIN
            </text>
            {/* Boundary Box (Black) around Steps Graph */}
            <rect
              x={margin.left}
              y={stepPaneTop}
              width={graphWidth}
              height={stepPaneHeight}
              fill="none"
              stroke="#000000"
              strokeWidth="1.2"
            />

            {/* Discrete 15-Minute Step Bars (Centered at bouts) */}
            {stepBouts.map((bout, idx) => {
              const x = getXHistory(bout.idx);
              const barHeight = Math.min(
                stepPaneHeight,
                Math.max(8, (bout.steps / 600) * stepPaneHeight)
              );
              return (
                <rect
                  key={idx}
                  x={x - 8}
                  y={stepPaneTop + stepPaneHeight - barHeight}
                  width="16"
                  height={barHeight}
                  fill="#8B5CF6"
                />
              );
            })}

            {/* ── TIME AXIS TICKS ───────────────────────────────────────── */}
            {timeTicks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={t.x}
                  y1={stepPaneTop + stepPaneHeight}
                  x2={t.x}
                  y2={stepPaneTop + stepPaneHeight + 4}
                  stroke="#94A3B8"
                  strokeWidth="1"
                />
                <text
                  x={t.x}
                  y={stepPaneTop + stepPaneHeight + 15}
                  fill="#64748B"
                  fontSize="7.5"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Floating Interactive Hover Tooltip Popover for Meal Event Dot */}
            {hoveredPin && (
              <g
                transform={`translate(${hoveredPin.x}, ${Math.max(cgmPaneTop + 8, hoveredPin.y - 66)})`}
                className="pointer-events-none"
              >
                {/* Tooltip Card Box */}
                <rect
                  x="-75"
                  y="0"
                  width="150"
                  height="54"
                  rx="3"
                  fill="#0F172A"
                  fillOpacity="0.97"
                  stroke="#334155"
                  strokeWidth="1"
                  filter="drop-shadow(0 6px 12px rgba(0,0,0,0.3))"
                />
                {/* Pointer triangle */}
                <polygon
                  points="-6,54 6,54 0,60"
                  fill="#0F172A"
                  fillOpacity="0.97"
                />
                {/* Meal Name & Time */}
                <text
                  x="0"
                  y="16"
                  fill="#FFFFFF"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {hoveredPin.mealTag} · {hoveredPin.timeStr}
                </text>
                {/* Carbs & Bolus */}
                <text
                  x="0"
                  y="32"
                  fill="#FBBF24"
                  fontSize="9"
                  fontWeight="600"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {hoveredPin.details}
                </text>
                {/* Glucose at event */}
                <text
                  x="0"
                  y="45"
                  fill="#94A3B8"
                  fontSize="8.5"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  Glucose at event: {Math.round(hoveredPin.glucose)} mg/dL
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
