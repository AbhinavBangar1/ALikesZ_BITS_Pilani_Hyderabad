"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";

export interface TelemetryRecord {
  timestamp: string;
  glucose: number;
  heart_rate: number;
  steps: number;
  insulin_units?: number;
  carbs_grams?: number;
}

interface TelemetryChartProps {
  stream: TelemetryRecord[];
  currentGlucose?: number;
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

export default function TelemetryChart({ stream }: TelemetryChartProps) {
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

  // Chart layout dimensions
  const svgWidth = 600;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // ── DYNAMIC Y-AXIS SCALE ──────────────────────────────────────────────────
  const { minY, maxY, yTicks } = useMemo(() => {
    if (visibleData.length === 0) {
      return { minY: 60, maxY: 260, yTicks: [250, 180, 140, 100, 70] };
    }

    const glucoseVals = visibleData
      .map((d) => d.glucose)
      .filter((g) => g && !isNaN(g));

    const rawMin = glucoseVals.length > 0 ? Math.min(...glucoseVals) : 70;
    const rawMax = glucoseVals.length > 0 ? Math.max(...glucoseVals) : 180;

    // Comfortably bracket the actual live telemetry and the target safe zone (70 - 140)
    const paddedMin = Math.min(rawMin - 15, 60);
    const paddedMax = Math.max(rawMax + 20, 160);

    const calcMin = Math.max(30, Math.floor(paddedMin / 20) * 20);
    const calcMax = Math.min(400, Math.ceil(paddedMax / 20) * 20);

    // Pick 4-5 clean tick increments
    const span = calcMax - calcMin;
    const step = span > 180 ? 50 : span > 100 ? 40 : 25;
    const ticks: number[] = [];
    for (let v = calcMax; v >= calcMin; v -= step) {
      ticks.push(v);
    }
    if (!ticks.includes(70) && calcMin <= 70 && calcMax >= 70) ticks.push(70);
    if (!ticks.includes(140) && calcMin <= 140 && calcMax >= 140) ticks.push(140);

    const uniqueTicks = Array.from(new Set(ticks)).sort((a, b) => b - a);
    return { minY: calcMin, maxY: calcMax, yTicks: uniqueTicks };
  }, [visibleData]);

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return padTop + plotHeight - ((clamped - minY) / (maxY - minY)) * plotHeight;
  };

  // Target safe zone band: 70 to 140 mg/dL dynamically mapped to current Y scale
  const targetTopY = getY(140);
  const targetBottomY = getY(70);
  const targetHeight = targetBottomY - targetTopY;

  // ── DYNAMIC X-AXIS SCALE ──────────────────────────────────────────────────
  const xTicks = useMemo(() => {
    if (visibleData.length === 0) {
      return [
        { label: "1:00", pct: 0, anchor: "start" },
        { label: "9:00", pct: 0.25, anchor: "middle" },
        { label: "12:00", pct: 0.5, anchor: "middle" },
        { label: "15:00", pct: 0.75, anchor: "middle" },
        { label: "20:00", pct: 1.0, anchor: "end" },
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
        label: i === 4 ? `${timeStr}` : timeStr,
        pct,
        anchor: i === 0 ? "start" : i === 4 ? "end" : "middle",
      };
    });
  }, [visibleData]);

  // Calculate coordinates for visible points
  const points = useMemo(() => {
    if (visibleData.length === 0) {
      return [
        { x: padLeft, yG: getY(88), yHR: getY(80), steps: 0 },
        { x: padLeft + plotWidth * 0.15, yG: getY(84), yHR: getY(78), steps: 40 },
        { x: padLeft + plotWidth * 0.3, yG: getY(105), yHR: getY(82), steps: 120 },
        { x: padLeft + plotWidth * 0.45, yG: getY(98), yHR: getY(84), steps: 90 },
        { x: padLeft + plotWidth * 0.58, yG: getY(225), yHR: getY(118), steps: 250 },
        { x: padLeft + plotWidth * 0.72, yG: getY(170), yHR: getY(122), steps: 80 },
        { x: padLeft + plotWidth * 0.85, yG: getY(95), yHR: getY(92), steps: 30 },
        { x: padLeft + plotWidth, yG: getY(102), yHR: getY(88), steps: 10 },
      ];
    }

    return visibleData.map((d, i) => {
      const x = padLeft + (i / Math.max(1, visibleData.length - 1)) * plotWidth;
      const yG = getY(d.glucose);
      const yHR = getY(d.heart_rate);
      return { x, yG, yHR, steps: d.steps || 0 };
    });
  }, [visibleData, plotWidth, padLeft, minY, maxY]);

  const cgmPath = useMemo(() => {
    return pointsToCubicBezierPath(points.map((p) => ({ x: p.x, y: p.yG })));
  }, [points]);

  const hrPath = useMemo(() => {
    return pointsToCubicBezierPath(points.map((p) => ({ x: p.x, y: p.yHR })));
  }, [points]);

  // Hovered data point
  const hoveredData = useMemo(() => {
    if (hoverIdx === null || hoverIdx < 0 || hoverIdx >= visibleData.length) return null;
    return visibleData[hoverIdx];
  }, [hoverIdx, visibleData]);

  const hoveredPoint = useMemo(() => {
    if (hoverIdx === null || hoverIdx < 0 || hoverIdx >= points.length) return null;
    return points[hoverIdx];
  }, [hoverIdx, points]);

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

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-6 bg-white hover:bg-slate-50/40 transition-colors duration-200 flex flex-col justify-between select-none cursor-pointer rounded-none"
    >
      {/* Card Header: Title + Live Readout */}
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h2 className="font-editorial text-xl font-normal text-slate-900 tracking-tight">
            Synchronized Multi-Modal Telemetry
          </h2>
          <span className="text-[10px] font-mono-tech px-2 py-0.5 border border-slate-300 text-slate-600 bg-slate-50 uppercase">
            15s High-Frequency
          </span>
        </div>
        <div className="flex items-center space-x-3 text-xs font-semibold pr-1">
          <span className="text-[#2563EB] font-sans flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-blue-600 inline-block" />
            CGM{hoveredData ? `: ${hoveredData.glucose} mg/dL` : ""}
          </span>
          <span className="text-[#991B1B] font-sans flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-red-700 inline-block" />
            HR{hoveredData ? `: ${hoveredData.heart_rate} BPM` : ""}
          </span>
          <span className="text-[#7C3AED] font-sans flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-purple-400 inline-block" />
            Steps{hoveredData ? `: ${hoveredData.steps}` : ""}
          </span>
          {hoveredData && (
            <span className="text-slate-700 font-mono-tech text-[11px] font-medium px-1.5 py-0.5 bg-slate-100 border border-slate-300">
              {formatTimestamp(hoveredData.timestamp)}
            </span>
          )}
        </div>
      </div>

      <svg
        className="w-full h-auto overflow-visible cursor-crosshair"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Dynamic Y Axis Guide Lines & Labels */}
        {yTicks.map((val) => {
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

        {/* Dynamic Target Range Band: Strictly Squared Corners */}
        <rect
          x={padLeft}
          y={targetTopY}
          width={plotWidth}
          height={targetHeight}
          fill="#D9EFE3"
          opacity="0.85"
        />

        {/* Physical Activity Steps (Subtle Histogram Bars) */}
        {points.map((pt, i) => {
          const barH = Math.min(28, (pt.steps / 350) * 28);
          if (barH <= 1) return null;
          const barW = Math.max(4, plotWidth / points.length - 8);
          const isHovered = hoverIdx === i;
          return (
            <rect
              key={`step-${i}`}
              x={pt.x - barW / 2}
              y={padTop + plotHeight - barH}
              width={barW}
              height={barH}
              fill={isHovered ? "#7C3AED" : "#C4B5FD"}
              opacity={isHovered ? 1 : 0.6}
              className="rounded-none transition-colors"
            />
          );
        })}

        {/* Heart Rate Red Dashed Curve */}
        {hrPath && (
          <path
            d={hrPath}
            fill="none"
            stroke="#991B1B"
            strokeWidth="1.8"
            strokeDasharray="4 4"
          />
        )}

        {/* CGM Blue Spline Curve */}
        {cgmPath && (
          <path
            d={cgmPath}
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.2"
          />
        )}

        {/* Interactive Hover Guides & Crosshairs */}
        {hoveredPoint && hoveredData && (
          <g className="pointer-events-none">
            {/* Vertical Hairline Guide */}
            <line
              x1={hoveredPoint.x}
              y1={padTop}
              x2={hoveredPoint.x}
              y2={padTop + plotHeight}
              stroke="#64748B"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* CGM Active Dot */}
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.yG}
              r="5"
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth="2"
            />

            {/* HR Active Dot */}
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.yHR}
              r="4.5"
              fill="#991B1B"
              stroke="#FFFFFF"
              strokeWidth="2"
            />

            {/* Floating Squared Tooltip Badge */}
            <g
              transform={`translate(${
                hoveredPoint.x > padLeft + plotWidth - 135
                  ? hoveredPoint.x - 138
                  : hoveredPoint.x + 12
              }, ${Math.min(padTop + plotHeight - 70, Math.max(padTop - 5, hoveredPoint.yG - 35))})`}
            >
              <rect
                x="0"
                y="0"
                width="126"
                height="64"
                fill="#0F172A"
                opacity="0.95"
                className="rounded-none shadow-md"
              />
              <rect x="0" y="0" width="3" height="64" fill="#2563EB" />
              <text x="8" y="15" fill="#94A3B8" className="text-[10px] font-mono-tech font-medium">
                {formatTimestamp(hoveredData.timestamp)}
              </text>
              <text x="8" y="30" fill="#60A5FA" className="text-[12px] font-semibold font-sans">
                CGM: {hoveredData.glucose} <tspan fill="#93C5FD" className="text-[9px] font-normal">mg/dL</tspan>
              </text>
              <text x="8" y="44" fill="#F87171" className="text-[11px] font-semibold font-sans">
                HR: {hoveredData.heart_rate} <tspan fill="#FCA5A5" className="text-[9px] font-normal">BPM</tspan>
              </text>
              <text x="8" y="57" fill="#C4B5FD" className="text-[10px] font-semibold font-sans">
                Steps: {hoveredData.steps}
              </text>
            </g>
          </g>
        )}

        {/* Dynamic Bottom X Axis Labels (Timeline) */}
        <g transform={`translate(0, ${padTop + plotHeight + 18})`}>
          {xTicks.map((tick, i) => {
            const xPos = padLeft + tick.pct * plotWidth;
            return (
              <text
                key={`xtick-${i}`}
                x={xPos}
                textAnchor={tick.anchor as any}
                className="text-[11px] font-sans fill-slate-700 font-medium"
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
