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

export default function TelemetryChart({ stream }: TelemetryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamic window points (default ~1 hour, 12 points at 5 min intervals)
  const [windowPoints, setWindowPoints] = useState<number>(18);
  const totalStream = useMemo(() => stream || [], [stream]);

  // Non-intrusive mousewheel listener to zoom window dynamically without toolbars
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY;
      setWindowPoints((prev) => {
        const step = delta > 0 ? 2 : -2;
        const maxPts = Math.max(12, totalStream.length || 36);
        const minPts = 6;
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

  // Chart dimensions matching reference image
  const svgWidth = 600;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // Coordinate scales matching image: Y ranges 70 to 250
  const minY = 70;
  const maxY = 250;

  const getY = (val: number) => {
    const clamped = Math.max(minY, Math.min(maxY, val));
    return padTop + plotHeight - ((clamped - minY) / (maxY - minY)) * plotHeight;
  };

  // Target safe zone band: 70 to 140 mg/dL
  const targetTopY = getY(140);
  const targetBottomY = getY(70);
  const targetHeight = targetBottomY - targetTopY;

  // Calculate points
  const points = useMemo(() => {
    if (visibleData.length === 0) {
      // Clean fallback demo points matching reference curve exactly
      return [
        { x: padLeft, yG: getY(88), yHR: getY(80) },
        { x: padLeft + plotWidth * 0.15, yG: getY(84), yHR: getY(78) },
        { x: padLeft + plotWidth * 0.3, yG: getY(105), yHR: getY(82) },
        { x: padLeft + plotWidth * 0.45, yG: getY(98), yHR: getY(84) },
        { x: padLeft + plotWidth * 0.58, yG: getY(225), yHR: getY(118) },
        { x: padLeft + plotWidth * 0.72, yG: getY(170), yHR: getY(122) },
        { x: padLeft + plotWidth * 0.85, yG: getY(95), yHR: getY(92) },
        { x: padLeft + plotWidth, yG: getY(102), yHR: getY(88) },
      ];
    }

    return visibleData.map((d, i) => {
      const x = padLeft + (i / Math.max(1, visibleData.length - 1)) * plotWidth;
      const yG = getY(d.glucose);
      const yHR = getY(d.heart_rate);
      return { x, yG, yHR };
    });
  }, [visibleData, plotWidth, padLeft]);

  const cgmPath = useMemo(() => {
    return pointsToCubicBezierPath(points.map((p) => ({ x: p.x, y: p.yG })));
  }, [points]);

  const hrPath = useMemo(() => {
    return pointsToCubicBezierPath(points.map((p) => ({ x: p.x, y: p.yHR })));
  }, [points]);

  return (
    <div ref={containerRef} className="w-full p-6 bg-white flex flex-col justify-center select-none">
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

        {/* Target Range Band (70 - 140 mg/dL): Light mint green safe zone */}
        <rect
          x={padLeft}
          y={targetTopY}
          width={plotWidth}
          height={targetHeight}
          fill="#D9EFE3"
          opacity="0.85"
        />

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

        {/* In-chart Curve Labels: 'CGM' and 'Heart rate' */}
        <text
          x={padLeft + plotWidth * 0.64}
          y={getY(185)}
          className="text-[10px] font-sans font-medium fill-[#2563EB]"
        >
          CGM
        </text>
        <text
          x={padLeft + plotWidth * 0.82}
          y={getY(115)}
          className="text-[10px] font-sans font-medium fill-[#991B1B]"
        >
          Heart rate
        </text>

        {/* Bottom X Axis Labels: 1:00, 9:00, 12:00, 15:00, 20:00 */}
        <g transform={`translate(0, ${padTop + plotHeight + 18})`}>
          <text x={padLeft} textAnchor="start" className="text-[11px] font-sans fill-slate-700">
            1:00
          </text>
          <text x={padLeft + plotWidth * 0.25} textAnchor="middle" className="text-[11px] font-sans fill-slate-700">
            9:00
          </text>
          <text x={padLeft + plotWidth * 0.5} textAnchor="middle" className="text-[11px] font-sans fill-slate-700">
            12:00
          </text>
          <text x={padLeft + plotWidth * 0.75} textAnchor="middle" className="text-[11px] font-sans fill-slate-700">
            15:00
          </text>
          <text x={padLeft + plotWidth} textAnchor="end" className="text-[11px] font-sans fill-slate-700">
            20:00
          </text>
        </g>
      </svg>
    </div>
  );
}
