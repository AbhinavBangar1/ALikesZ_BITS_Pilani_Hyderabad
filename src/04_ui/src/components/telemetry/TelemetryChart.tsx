"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";

export interface TelemetryRecord {
  timestamp: string;
  glucose: number;
  heart_rate: number;
  steps: number;
  insulin_units?: number;
  carbs_grams?: number;
  carb_input?: number;
  bolus_volume_delivered?: number;
}

export interface LiveHrPoint {
  timestamp: string;
  heart_rate: number;
  rr_ms?: number;
  activity_state?: string;
  steps?: number;
}

interface TelemetryChartProps {
  stream: TelemetryRecord[];
  liveHrHistory?: LiveHrPoint[];
  currentGlucose?: number;
  liveBpm?: number;
  liveRr?: number;
}

// Convert points to Catmull-Rom cubic bezier SVG path
function pointsToCubicBezierPath(pts: { x: number; y: number }[]): string {
  if (!pts || pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

// Format timestamp to clean HH:mm:ss for 15-second high-frequency telemetry
function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "";
  if (ts.includes(" ")) {
    return ts.split(" ")[1].slice(0, 8);
  }
  if (ts.includes("T")) {
    return ts.split("T")[1].slice(0, 8);
  }
  return ts.slice(0, 8);
}

export default function TelemetryChart({ stream, liveHrHistory, currentGlucose, liveBpm }: TelemetryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamic window points for 15-second telemetry (default 40 points = 10 minutes)
  const [windowPoints, setWindowPoints] = useState<number>(40);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const totalStream = useMemo(() => stream || [], [stream]);

  // Non-intrusive mousewheel listener to zoom window dynamically
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY;
      setWindowPoints((prev) => {
        const step = delta > 0 ? 4 : -4;
        const maxPts = Math.max(20, totalStream.length || 80);
        const minPts = 12;
        return Math.max(minPts, Math.min(maxPts, prev + step));
      });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [totalStream.length]);

  const visibleData = useMemo(() => {
    if (totalStream.length === 0) return [];
    return totalStream.slice(-windowPoints);
  }, [totalStream, windowPoints]);

  // Overall Chart Layout (exact same parent dimensions: 600 x 220)
  const svgWidth = 600;
  const svgHeight = 220;
  const padLeft = 46;
  const padRight = 24;
  const plotWidth = svgWidth - padLeft - padRight;

  // ── DUAL PLOT VERTICAL PARTITIONS ─────────────────────────────────────────
  // Upper Piece: CGM Glucose (Y: 14 to 110, height = 96px)
  const cgmTop = 14;
  const cgmHeight = 96;
  const cgmBottom = cgmTop + cgmHeight;

  // Lower Piece: Heart Rate (Y: 126 to 190, height = 64px)
  const hrTop = 126;
  const hrHeight = 64;
  const hrBottom = hrTop + hrHeight;

  // ── 1. UPPER PIECE: CGM HARDCODED CLINICAL SCALE (40 - 350 mg/dL) ─────────
  const { minCGM, maxCGM, cgmTicks } = useMemo(() => {
    const gVals = visibleData.map((d) => d.glucose).filter((g) => g && !isNaN(g));
    const rawMax = gVals.length > 0 ? Math.max(...gVals) : 180;
    const calcMin = 40;
    const calcMax = rawMax > 330 ? Math.ceil((rawMax + 20) / 50) * 50 : 350;
    const ticks = calcMax > 350 ? [calcMax, 300, 250, 180, 140, 70] : [300, 250, 180, 140, 70];
    return { minCGM: calcMin, maxCGM: calcMax, cgmTicks: ticks };
  }, [visibleData]);

  const getY_CGM = (val: number) => {
    const clamped = Math.max(minCGM, Math.min(maxCGM, val));
    return cgmTop + cgmHeight - ((clamped - minCGM) / (maxCGM - minCGM)) * cgmHeight;
  };

  // CGM Target safe zone band (70 to 140 mg/dL)
  const cgmTargetTop = getY_CGM(140);
  const cgmTargetBottom = getY_CGM(70);
  const cgmTargetHeight = Math.max(4, cgmTargetBottom - cgmTargetTop);

  // ── 2. LOWER PIECE: HEART RATE HARDCODED CLINICAL SCALE (40 - 140 BPM) ───
  const { minHR, maxHR, hrTicks } = useMemo(() => {
    const hrData = liveHrHistory && liveHrHistory.length > 0 ? liveHrHistory : visibleData;
    const hrVals = hrData.map((d) => d.heart_rate).filter((h) => h && !isNaN(h));
    const rawMax = hrVals.length > 0 ? Math.max(...hrVals) : 100;
    const calcMin = 40;
    const calcMax = rawMax > 135 ? Math.ceil((rawMax + 10) / 10) * 10 : 140;
    const ticks = calcMax > 140 ? [calcMax, 100, 60] : [140, 100, 60];
    return { minHR: calcMin, maxHR: calcMax, hrTicks: ticks };
  }, [liveHrHistory, visibleData]);

  const getY_HR = (val: number) => {
    const clamped = Math.max(minHR, Math.min(maxHR, val));
    return hrTop + hrHeight - ((clamped - minHR) / (maxHR - minHR)) * hrHeight;
  };

  // ── 3. SHARED TIMELINE X-AXIS SCALE ──────────────────────────────────────
  const xTicks = useMemo(() => {
    if (visibleData.length === 0) {
      return [
        { label: "00:00:00", pct: 0, anchor: "start" },
        { label: "00:02:30", pct: 0.25, anchor: "middle" },
        { label: "00:05:00", pct: 0.5, anchor: "middle" },
        { label: "00:07:30", pct: 0.75, anchor: "middle" },
        { label: "00:10:00", pct: 1.0, anchor: "end" },
      ];
    }

    const n = visibleData.length;
    const indices = [
      0,
      Math.floor(n * 0.25),
      Math.floor(n * 0.5),
      Math.floor(n * 0.75),
      n - 1,
    ];

    return indices.map((idx, i) => {
      const pct = idx / Math.max(1, n - 1);
      const timeStr = formatTimestamp(visibleData[idx]?.timestamp);
      return {
        label: timeStr,
        pct,
        anchor: i === 0 ? "start" : i === 4 ? "end" : "middle",
      };
    });
  }, [visibleData]);

  // Points mapped into upper (CGM) coordinate space
  const points = useMemo(() => {
    if (visibleData.length === 0) return [];
    return visibleData.map((d, i) => {
      const x = padLeft + (i / Math.max(1, visibleData.length - 1)) * plotWidth;
      const yG = getY_CGM(d.glucose);
      const yHR = getY_HR(d.heart_rate);
      const carbs = Number(d.carb_input || d.carbs_grams || 0);
      const bolus = Number(d.bolus_volume_delivered || d.insulin_units || 0);
      return {
        x,
        yG,
        yHR,
        steps: d.steps || 0,
        carbs,
        bolus,
        glucose: d.glucose,
        heart_rate: d.heart_rate,
        timestamp: d.timestamp,
      };
    });
  }, [visibleData, plotWidth, padLeft, minCGM, maxCGM, minHR, maxHR]);

  // Detected meal events within the visible telemetry window
  const mealPoints = useMemo(() => {
    return points.filter((p) => p.carbs > 0 || p.bolus > 0);
  }, [points]);

  // Most recent meal ingestion event
  const recentMeal = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].carbs > 0) return points[i];
    }
    return null;
  }, [points]);

  const cgmPath = useMemo(() => {
    return pointsToCubicBezierPath(points.map((p) => ({ x: p.x, y: p.yG })));
  }, [points]);

  // Points mapped into lower (HR) coordinate space: supports 1-second live buffer!
  const hrPoints = useMemo(() => {
    if (liveHrHistory && liveHrHistory.length > 0) {
      const n = liveHrHistory.length;
      return liveHrHistory.map((d, i) => {
        const x = padLeft + (i / Math.max(1, n - 1)) * plotWidth;
        const yHR = getY_HR(d.heart_rate);
        return { x, yHR, heart_rate: d.heart_rate, timestamp: d.timestamp, rr_ms: d.rr_ms };
      });
    }
    return points.map((p, i) => ({
      x: p.x,
      yHR: p.yHR,
      heart_rate: visibleData[i]?.heart_rate || 72,
      timestamp: visibleData[i]?.timestamp,
    }));
  }, [liveHrHistory, points, visibleData, plotWidth, padLeft, minHR, maxHR]);

  const hrPath = useMemo(() => {
    return pointsToCubicBezierPath(hrPoints.map((p) => ({ x: p.x, y: p.yHR })));
  }, [hrPoints]);

  // ── 4. CLINICAL STEPS & ACTIVITY REPRESENTATION (WINDOW-BASED) ────────────
  const { totalWindowSteps, activeBoutState, avgCadenceSpm } = useMemo(() => {
    if (visibleData.length === 0) {
      return { totalWindowSteps: 0, activeBoutState: "Sedentary", avgCadenceSpm: 0 };
    }
    const totalSteps = visibleData.reduce((acc, d) => acc + (d.steps || 0), 0);
    // Window duration in minutes (each tick = 15s = 0.25 min)
    const windowMinutes = Math.max(1, (visibleData.length * 15) / 60);
    const cadence = Math.round(totalSteps / windowMinutes);

    let state = "Sedentary";
    if (cadence > 95) state = "Exercise";
    else if (cadence > 25) state = "Ambulatory Walk";

    return { totalWindowSteps: totalSteps, activeBoutState: state, avgCadenceSpm: cadence };
  }, [visibleData]);

  // Hovered item
  const hoveredData = useMemo(() => {
    if (hoverIdx === null || hoverIdx < 0 || hoverIdx >= visibleData.length) return null;
    return visibleData[hoverIdx];
  }, [hoverIdx, visibleData]);

  const hoveredPoint = useMemo(() => {
    if (hoverIdx === null || hoverIdx < 0 || hoverIdx >= points.length) return null;
    return points[hoverIdx];
  }, [hoverIdx, points]);

  const hoveredHrPoint = useMemo(() => {
    if (hoverIdx === null || hoverIdx < 0) return null;
    if (liveHrHistory && liveHrHistory.length > 0) {
      const frac = hoverIdx / Math.max(1, visibleData.length - 1);
      const hrIdx = Math.min(liveHrHistory.length - 1, Math.max(0, Math.round(frac * (liveHrHistory.length - 1))));
      return hrPoints[hrIdx];
    }
    return hrPoints[hoverIdx] || null;
  }, [hoverIdx, liveHrHistory, visibleData.length, hrPoints]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;

    if (mouseX < padLeft - 10 || mouseX > padLeft + plotWidth + 10 || points.length === 0) {
      setHoverIdx(null);
      return;
    }

    let closestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, i) => {
      const diff = Math.abs(p.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    setHoverIdx(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
  };

  // Latest readings for display
  const latestHrPoint = liveHrHistory && liveHrHistory.length > 0 ? liveHrHistory[liveHrHistory.length - 1] : null;
  const latestGlucose = hoveredData
    ? hoveredData.glucose
    : visibleData.length > 0
    ? visibleData[visibleData.length - 1].glucose
    : currentGlucose || 140;

  const currentDisplayHr = hoveredData
    ? hoveredData.heart_rate
    : liveBpm || latestHrPoint?.heart_rate || (visibleData.length > 0 ? visibleData[visibleData.length - 1].heart_rate : 72);

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-5 bg-white hover:bg-slate-50/30 transition-colors duration-200 flex flex-col justify-between select-none cursor-pointer rounded-none"
    >
      {/* ── CARD HEADER: CLEAN READOUT STRIP (NO HEADERS, NO GRAPH SYMBOLS) ── */}
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100 text-xs">
        <div className="flex items-center space-x-5 font-semibold flex-wrap gap-y-1">
          <span className="text-[#2563EB] font-sans">
            CGM: {latestGlucose} mg/dL
          </span>
          <span className="text-[#DC2626] font-sans">
            1s HR: {currentDisplayHr} BPM
          </span>
          <span className="text-slate-600 font-mono-tech text-[11px]">
            {activeBoutState} ({totalWindowSteps.toLocaleString()} st · {avgCadenceSpm} spm)
          </span>
          {recentMeal && (
            <span className="text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[11px] font-mono-tech flex items-center gap-1 font-medium">
              <span>🍽 Ingestion:</span>
              <span className="font-bold">{recentMeal.carbs}g</span>
              {recentMeal.bolus > 0 && <span className="text-blue-700">({recentMeal.bolus}U)</span>}
              <span className="text-slate-500 font-normal">@{formatTimestamp(recentMeal.timestamp)}</span>
            </span>
          )}
        </div>

        {hoveredData && (
          <span className="text-slate-700 font-mono-tech text-[11px] font-medium px-1.5 py-0.5 bg-slate-100 border border-slate-300">
            {formatTimestamp(hoveredData.timestamp)}
          </span>
        )}
      </div>

      {/* ── STACKED DUAL-PLOT SVG (CGM UPPER + HR LOWER) ───────────────────── */}
      <svg
        className="w-full h-auto overflow-visible cursor-crosshair"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* =================================================================== */}
        {/* 1. UPPER PIECE: CONTINUOUS GLUCOSE MONITOR (CGM)                   */}
        {/* =================================================================== */}

        {/* Target Range Safe Zone Band: strictly mapped to CGM scale */}
        <rect
          x={padLeft}
          y={cgmTargetTop}
          width={plotWidth}
          height={cgmTargetHeight}
          fill="#D9EFE3"
          opacity="0.80"
        />

        {/* CGM Grid lines & Y-Axis Labels */}
        {cgmTicks.map((val) => {
          const y = getY_CGM(val);
          return (
            <g key={`cgm-tick-${val}`}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotWidth}
                y2={y}
                stroke="#F1F5F9"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="text-[10px] font-mono-tech fill-slate-500 font-medium"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Target 140 mg/dL and 70 mg/dL Hairline Guides */}
        <line
          x1={padLeft}
          y1={cgmTargetTop}
          x2={padLeft + plotWidth}
          y2={cgmTargetTop}
          stroke="#10B981"
          strokeWidth="0.8"
          strokeDasharray="2 3"
          opacity="0.7"
        />
        <line
          x1={padLeft}
          y1={cgmTargetBottom}
          x2={padLeft + plotWidth}
          y2={cgmTargetBottom}
          stroke="#10B981"
          strokeWidth="0.8"
          strokeDasharray="2 3"
          opacity="0.7"
        />

        {/* CGM Blue Continuous Spline Curve */}
        {cgmPath && (
          <path
            d={cgmPath}
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}

        {/* ── Meal Ingestion Markers & Event Guidelines ── */}
        {mealPoints.map((m, idx) => (
          <g key={`meal-marker-${idx}`} className="transition-all">
            {/* Vertical dashed guideline from CGM point to divider */}
            <line
              x1={m.x}
              y1={cgmTop}
              x2={m.x}
              y2={cgmBottom}
              stroke="#D97706"
              strokeWidth="1.2"
              strokeDasharray="2 3"
              opacity="0.85"
            />
            {/* Meal Ingestion Pin on CGM Curve */}
            <circle
              cx={m.x}
              cy={m.yG}
              r="4.5"
              fill="#F59E0B"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            {/* Meal Ingestion Pill Badge */}
            <g
              transform={`translate(${Math.max(
                padLeft + 2,
                Math.min(padLeft + plotWidth - (m.bolus > 0 ? 66 : 48), m.x - (m.bolus > 0 ? 33 : 24))
              )}, ${Math.max(cgmTop + 2, m.yG - 22)})`}
            >
              <rect
                x="0"
                y="0"
                width={m.bolus > 0 ? "66" : "48"}
                height="16"
                fill="#FFFBEB"
                stroke="#D97706"
                strokeWidth="1"
                className="rounded-none shadow-sm"
              />
              <text
                x={m.bolus > 0 ? "33" : "24"}
                y="11.5"
                textAnchor="middle"
                className="text-[9px] font-mono-tech font-bold fill-amber-900"
              >
                🍽 {m.carbs}g{m.bolus > 0 ? `·${m.bolus}U` : ""}
              </text>
            </g>
          </g>
        ))}

        {/* =================================================================== */}
        {/* SUBTLE HORIZONTAL DIVIDER BETWEEN UPPER & LOWER PLOTS               */}
        {/* =================================================================== */}
        <line
          x1={padLeft}
          y1={118}
          x2={padLeft + plotWidth}
          y2={118}
          stroke="#E2E8F0"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* =================================================================== */}
        {/* 2. LOWER PIECE: CONTINUOUS HEART RATE (BPM)                        */}
        {/* =================================================================== */}

        {/* HR Grid lines & Dedicated Y-Axis Labels */}
        {hrTicks.map((val) => {
          const y = getY_HR(val);
          return (
            <g key={`hr-tick-${val}`}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotWidth}
                y2={y}
                stroke="#F8FAFC"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="text-[10px] font-mono-tech fill-slate-500 font-medium"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* HR Red Continuous Curve with Full Vertical Amplitude */}
        {hrPath && (
          <path
            d={hrPath}
            fill="none"
            stroke="#DC2626"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}

        {/* =================================================================== */}
        {/* 3. SYNCHRONIZED CROSSHAIR & HOVER INSPECTOR                         */}
        {/* =================================================================== */}
        {hoveredPoint && hoveredData && (
          <g className="pointer-events-none">
            {/* Unified Vertical Hairline spanning across BOTH plots */}
            <line
              x1={hoveredPoint.x}
              y1={cgmTop}
              x2={hoveredPoint.x}
              y2={hrBottom}
              stroke="#64748B"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* Upper Plot Active Dot (CGM) */}
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.yG}
              r="4.5"
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth="2"
            />

            {/* Lower Plot Active Dot (HR) */}
            <circle
              cx={hoveredPoint.x}
              cy={hoveredHrPoint ? hoveredHrPoint.yHR : hoveredPoint.yHR}
              r="4"
              fill="#DC2626"
              stroke="#FFFFFF"
              strokeWidth="2"
            />

            {/* Floating Squared Tooltip Badge */}
            <g
              transform={`translate(${
                hoveredPoint.x > padLeft + plotWidth - 145
                  ? hoveredPoint.x - 150
                  : hoveredPoint.x + 12
              }, ${Math.min(cgmBottom - 30, Math.max(cgmTop, hoveredPoint.yG - 30))})`}
            >
              <rect
                x="0"
                y="0"
                width="138"
                height={hoveredData.carb_input || hoveredData.bolus_volume_delivered ? "76" : "62"}
                fill="#0F172A"
                opacity="0.95"
                className="rounded-none shadow-md"
              />
              <rect
                x="0"
                y="0"
                width="3"
                height={hoveredData.carb_input || hoveredData.bolus_volume_delivered ? "76" : "62"}
                fill={hoveredData.carb_input ? "#F59E0B" : "#2563EB"}
              />
              <text x="8" y="14" fill="#94A3B8" className="text-[10px] font-mono-tech font-medium">
                {formatTimestamp(hoveredData.timestamp)}
              </text>
              <text x="8" y="29" fill="#60A5FA" className="text-[12px] font-semibold font-sans">
                CGM: {hoveredData.glucose} <tspan fill="#93C5FD" className="text-[9px] font-normal">mg/dL</tspan>
              </text>
              <text x="8" y="43" fill="#F87171" className="text-[11px] font-semibold font-sans">
                HR: {hoveredHrPoint ? hoveredHrPoint.heart_rate : hoveredData.heart_rate} <tspan fill="#FCA5A5" className="text-[9px] font-normal">BPM</tspan>
              </text>
              <text x="8" y="55" fill="#DDD6FE" className="text-[10px] font-mono-tech">
                Step interval: {hoveredData.steps || 0}
              </text>
              {(hoveredData.carb_input || hoveredData.bolus_volume_delivered) && (
                <text x="8" y="69" fill="#FBBF24" className="text-[10px] font-mono-tech font-bold">
                  🍽 +{hoveredData.carb_input || 0}g carbs · {hoveredData.bolus_volume_delivered || 0}U bolus
                </text>
              )}
            </g>
          </g>
        )}

        {/* =================================================================== */}
        {/* 4. SHARED BOTTOM TIMELINE X-AXIS LABELS                             */}
        {/* =================================================================== */}
        <g transform={`translate(0, ${hrBottom + 16})`}>
          {xTicks.map((tick, i) => {
            const xPos = padLeft + tick.pct * plotWidth;
            return (
              <text
                key={`xtick-${i}`}
                x={xPos}
                textAnchor={tick.anchor as any}
                className="text-[10px] font-mono-tech fill-slate-600 font-medium"
              >
                {tick.label}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
