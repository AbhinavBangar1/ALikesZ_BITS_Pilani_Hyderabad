"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

function formatDateTime(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  const pad = (n: number) => n.toString().padStart(2, "0");
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${dayName}, ${day} ${month} ${year} · ${hours}:${minutes}:${seconds}`;
}

interface DoctorHeaderProps {
  selectedPatientId?: string;
  selectedPatientName?: string;
  liveStreaming?: boolean;
  onToggleLive?: () => void;
  onTick?: () => void;
}

export default function DoctorHeader({
  selectedPatientId = "T1D-IN-001",
  selectedPatientName = "Aarav Sharma",
  liveStreaming = false,
  onToggleLive,
  onTick,
}: DoctorHeaderProps) {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    setTimeStr(formatDateTime(new Date()));
    const timer = setInterval(() => {
      setTimeStr(formatDateTime(new Date()));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 select-none rounded-none">
      {/* Brand: Logo + 'Kiko' in Editorial Serif + Command Center subtitle */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-bold text-lg font-editorial rounded-none">
          ∞
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-editorial text-2xl font-normal tracking-tight text-slate-900">
              Kiko
            </span>
            <span className="text-[11px] font-mono-tech uppercase tracking-wider text-slate-500">
              Clinician Triage & Telemetry Command Center
            </span>
          </div>
        </div>
      </div>

      {/* Center: Clinician Identity & Live Sync Status */}
      <div className="hidden md:flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 text-xs">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <span className="font-medium text-slate-900">Dr. Kavya Reddy, MD</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600 font-mono-tech">Senior Endocrinologist</span>
        </div>

        {/* Live Simulation Controls */}
        {onToggleLive && (
          <div className="flex items-center space-x-2 border border-slate-300 px-3 py-1 text-xs bg-white shadow-xs">
            <span
              className={`inline-block w-2 h-2 rounded-none ${
                liveStreaming ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
              }`}
            />
            <button
              onClick={onToggleLive}
              className="text-xs font-semibold tracking-wide text-slate-900 hover:text-blue-600 transition-colors uppercase font-mono-tech cursor-pointer"
            >
              {liveStreaming ? "Live: 15s Stream" : "Live: Paused"}
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={onTick}
              className="text-xs font-semibold tracking-wide text-blue-600 hover:text-blue-800 transition-colors font-mono-tech cursor-pointer"
              title="Advance telemetry by 1 tick (15 seconds)"
            >
              +15s Tick
            </button>
          </div>
        )}
      </div>

      {/* Right: Patient Companion View Switcher & Monospace Clock */}
      <div className="flex items-center gap-4">
        <Link
          href={`/patient?id=${selectedPatientId}`}
          className="px-3.5 py-1.5 text-xs font-sans font-medium text-slate-900 border border-slate-300 hover:bg-slate-100 transition-colors rounded-none flex items-center gap-1.5 cursor-pointer shadow-xs"
          title={`Open Patient Companion for ${selectedPatientName}`}
        >
          <span>Patient Portal View</span>
          <span className="font-mono-tech opacity-60">({selectedPatientId})</span>
          <span>→</span>
        </Link>

        {/* Live Responsive Monospace Timestamp */}
        <div className="hidden lg:block font-mono-tech text-xs text-slate-600 font-medium px-2.5 py-1 bg-slate-50 border border-slate-200">
          {timeStr || "Fri, 16 Oct 2026 · 19:32:00"}
        </div>
      </div>
    </header>
  );
}
