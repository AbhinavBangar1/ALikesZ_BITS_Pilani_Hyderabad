"use client";

import React, { useState } from "react";

export interface CDSSAlert {
  pattern_id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  status: "ACTIVE" | "ACKNOWLEDGED" | "DISMISSED";
  timestamp: string;
  description: string;
  clinical_rationale: string;
  recommended_action: string;
}

interface CDSSActionCardProps {
  patientId: string;
  alerts: CDSSAlert[];
  onAcknowledge: (patternId: string) => Promise<void>;
  onDismiss: (patternId: string) => Promise<void>;
}

export default function CDSSActionCard({
  patientId,
  alerts,
  onAcknowledge,
  onDismiss,
}: CDSSActionCardProps) {
  const [loadingPattern, setLoadingPattern] = useState<string | null>(null);

  const activeAlerts = alerts.filter((a) => a.status !== "DISMISSED");

  const handleAction = async (patternId: string, action: "ack" | "dismiss") => {
    setLoadingPattern(patternId);
    try {
      if (action === "ack") {
        await onAcknowledge(patternId);
      } else {
        await onDismiss(patternId);
      }
    } finally {
      setLoadingPattern(null);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-rose-100 text-[#8F1D21] border-rose-300";
      case "HIGH":
        return "bg-amber-100 text-amber-900 border-amber-300";
      case "MODERATE":
        return "bg-blue-50 text-blue-800 border-blue-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  return (
    <div className="w-full h-full p-6 bg-white hover:bg-slate-50/20 transition-colors duration-200 flex flex-col justify-between select-none rounded-none border-t border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <h2 className="font-editorial text-xl font-normal text-slate-900 tracking-tight">
            Clinical Decision Support (CDSS)
          </h2>
          <span className="text-[11px] font-mono-tech px-2 py-0.5 bg-slate-900 text-white">
            {activeAlerts.length} {activeAlerts.length === 1 ? "Alert" : "Alerts"}
          </span>
        </div>
        <span className="text-[11px] font-mono-tech text-slate-500 uppercase tracking-wider">
          Automated Pattern Engine
        </span>
      </div>

      {/* Alert Cards Feed */}
      <div className="flex-1 my-3 space-y-3 overflow-y-auto max-h-[190px] pr-1">
        {activeAlerts.length === 0 ? (
          <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 bg-slate-50/50">
            <span className="text-sm font-medium text-slate-700">
              No Active Clinical Alerts
            </span>
            <span className="text-[12px] text-slate-500 mt-1">
              Physiological continuous metrics nominal. No nocturnal hypoglycemia or exercise excursions detected.
            </span>
          </div>
        ) : (
          activeAlerts.map((alert) => (
            <div
              key={alert.pattern_id}
              className={`p-3.5 border transition-all duration-150 ${
                alert.status === "ACKNOWLEDGED"
                  ? "bg-slate-50/80 border-slate-200 opacity-80"
                  : "bg-white border-slate-300 shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono-tech uppercase font-semibold px-1.5 py-0.5 border ${getSeverityBadge(
                      alert.severity
                    )}`}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {alert.title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {alert.status === "ACKNOWLEDGED" && (
                    <span className="text-[10px] font-mono-tech uppercase tracking-wider text-emerald-700 font-semibold px-1.5 py-0.5 bg-emerald-50 border border-emerald-200">
                      Acknowledged
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    {alert.status !== "ACKNOWLEDGED" && (
                      <button
                        onClick={() => handleAction(alert.pattern_id, "ack")}
                        disabled={loadingPattern === alert.pattern_id}
                        className="px-2.5 py-1 text-[11px] font-sans font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 transition-colors disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(alert.pattern_id, "dismiss")}
                      disabled={loadingPattern === alert.pattern_id}
                      className="px-2.5 py-1 text-[11px] font-sans font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>

              {/* Description & Clinical Rationale */}
              <p className="text-[12px] text-slate-800 mt-2 font-normal">
                {alert.description}
              </p>
              <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2 border border-slate-150">
                <span className="font-semibold text-slate-900">Recommendation: </span>
                {alert.recommended_action}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Info Strip */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono-tech">
        <span>Target: ADA Clinical Guidance 2026</span>
        <span>Patient ID: {patientId}</span>
      </div>
    </div>
  );
}
