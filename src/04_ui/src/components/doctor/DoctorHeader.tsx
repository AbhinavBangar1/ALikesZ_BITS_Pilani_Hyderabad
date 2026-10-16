"use client";

import React, { useState, useEffect } from "react";

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

export default function DoctorHeader() {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    setTimeStr(formatDateTime(new Date()));
    const timer = setInterval(() => {
      setTimeStr(formatDateTime(new Date()));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 select-none">
      {/* Brand: Vector Logo + 'Kiko infinity' */}
      <div className="flex items-center space-x-2.5">
        <img
          src="/kiko_logo.svg"
          alt="Kiko Logo"
          className="w-6 h-6 object-contain"
        />
        <span className="text-lg font-bold tracking-tight text-slate-900 font-sans">
          Kiko infinity
        </span>
      </div>

      {/* Live Responsive Monospace Timestamp */}
      <div className="font-mono-tech text-xs text-slate-700 font-medium">
        {timeStr || "Fri, 16 Oct 2026 · 19:32:00"}
      </div>
    </header>
  );
}
