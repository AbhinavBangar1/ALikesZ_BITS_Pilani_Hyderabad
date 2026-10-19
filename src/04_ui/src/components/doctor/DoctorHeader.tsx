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
  onLogout?: () => void;
  onOpenTutorial?: () => void;
}

export default function DoctorHeader({
  selectedPatientId = "T1D-IN-001",
  selectedPatientName = "Aarav Sharma",
  onLogout,
  onOpenTutorial,
}: DoctorHeaderProps) {
  const [timeStr, setTimeStr] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  useEffect(() => {
    setTimeStr(formatDateTime(new Date()));
    const timer = setInterval(() => {
      setTimeStr(formatDateTime(new Date()));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 select-none rounded-none">
      {/* Brand: Logo + 'Kiko' */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-slate-900 text-white flex items-center justify-center font-bold text-sm font-sans rounded-xs">
          ∞
        </div>
        {/* OLD: <span className="font-sans text-2xl font-bold tracking-tight text-slate-900"> */}
        <span className="font-serif text-2xl font-normal tracking-tight text-slate-900">
          Kiko
        </span>
      </div>

      {/* Right: Unboxed Time & Date | Squared Profile Icon with Initials & Hover Logout */}
      <div className="flex items-center gap-4">
        {/* Time and date without the box */}
        {/* OLD: <span className="font-mono-tech text-xs text-slate-500 font-medium tracking-tight"> */}
        <span className="font-sans text-xs text-slate-500 font-medium tracking-tight">
          {timeStr || "Sun, 18 Oct 2026 · 21:57:17"}
        </span>

        {/* Separator */}
        <span className="text-slate-300">|</span>

        {/* Quick Tour Button */}
        {onOpenTutorial && (
          <button
            type="button"
            onClick={onOpenTutorial}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer select-none"
            title="Start Guided Clinical Dashboard Tour (8 Steps)"
          >
            <span className="w-3.5 h-3.5 rounded-full border border-slate-500 text-[9px] flex items-center justify-center font-bold">
              ?
            </span>
            <span className="font-medium">Tour</span>
          </button>
        )}

        {/* Squared profile icon with initials only ('KR') + Hover dropdown */}
        <div
          className="relative"
          onMouseEnter={() => setDropdownOpen(true)}
          onMouseLeave={() => setDropdownOpen(false)}
        >
          {/* OLD: className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-mono-tech text-xs font-semibold rounded-none hover:bg-slate-800 transition-colors cursor-pointer select-none border border-slate-900 focus:outline-none" */}
          <button
            type="button"
            className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-sans text-xs font-semibold rounded-none hover:bg-slate-800 transition-colors cursor-pointer select-none border border-slate-900 focus:outline-none"
            aria-label="Clinician Profile Menu"
          >
            KR
          </button>

          {/* Hover dropdown with logout option */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full pt-1.5 z-50">
              <div className="w-60 bg-white border border-slate-200 shadow-lg rounded-none py-2 text-xs">
                {/* Clinician Details */}
                <div className="px-4 py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    {/* OLD: <div className="w-6 h-6 bg-slate-900 text-white flex items-center justify-center font-mono-tech text-[10px] font-semibold rounded-none"> */}
                    <div className="w-6 h-6 bg-slate-900 text-white flex items-center justify-center font-sans text-[10px] font-semibold rounded-none">
                      KR
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 leading-tight">
                        Dr. Kavya Reddy, MD
                      </p>
                      {/* OLD: <p className="text-[11px] font-mono-tech text-slate-500 mt-0.5"> */}
                      <p className="text-[11px] font-sans text-slate-500 mt-0.5">
                        Senior Endocrinologist
                      </p>
                    </div>
                  </div>
                </div>

                {/* Patient Companion link */}
                {selectedPatientId && (
                  <div className="px-2 py-1 border-b border-slate-100">
                    <Link
                      href={`/patient?id=${selectedPatientId}`}
                      className="flex items-center justify-between px-2 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors font-medium rounded-none"
                    >
                      <span>Patient Portal View</span>
                      <span className="font-mono-tech text-[10px] text-slate-400">
                        ({selectedPatientId}) →
                      </span>
                    </Link>
                  </div>
                )}

                {/* Guided Tutorial Option */}
                {onOpenTutorial && (
                  <div className="px-2 py-1 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenTutorial();
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors font-medium rounded-none cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border border-slate-400 text-[10px] flex items-center justify-center font-bold font-mono-tech">
                          ?
                        </span>
                        <span>Dashboard Tour</span>
                      </span>
                      {/* PREVIOUS: <span className="font-mono-tech text-[10px] text-blue-600 font-semibold uppercase">6 Steps</span> */}
                      <span className="font-mono-tech text-[10px] text-blue-600 font-semibold uppercase">
                        8 Steps
                      </span>
                    </button>
                  </div>
                )}

                {/* Logout Option */}
                <div className="px-2 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50 transition-colors font-medium rounded-none cursor-pointer"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
