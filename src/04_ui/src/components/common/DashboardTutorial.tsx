"use client";

import React, { useState, useEffect, useCallback } from "react";

export interface TutorialStep {
  targetId: string;
  title: string;
  badge?: string;
  description: string;
  tip?: string;
}

interface DashboardTutorialProps {
  steps: TutorialStep[];
  isOpen: boolean;
  onClose: () => void;
  tutorialTitle?: string;
  storageKey?: string;
}

export default function DashboardTutorial({
  steps,
  isOpen,
  onClose,
  tutorialTitle = "System Walkthrough",
  storageKey,
}: DashboardTutorialProps) {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Position target highlight and scroll target into view
  const updateTargetPosition = useCallback(() => {
    if (!isOpen || steps.length === 0) return;
    const step = steps[currentStep];
    if (!step) return;

    const el = document.getElementById(step.targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, steps]);

  useEffect(() => {
    if (!isOpen) return;
    updateTargetPosition();

    const handleResize = () => updateTargetPosition();
    const handleScroll = () => {
      const step = steps[currentStep];
      if (!step) return;
      const el = document.getElementById(step.targetId);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, currentStep, steps, updateTargetPosition]);

  // Keyboard navigation: Escape (close), ArrowRight (next), ArrowLeft (back)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSkip();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handleBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep, steps.length]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    if (storageKey && typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, "true");
      } catch (e) {
        // ignore storage errors
      }
    }
    onClose();
  };

  const handleComplete = () => {
    if (storageKey && typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, "true");
      } catch (e) {
        // ignore storage errors
      }
    }
    setCurrentStep(0);
    onClose();
  };

  if (!isOpen || steps.length === 0) return null;

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto select-none">
      {/* ── Semi-transparent Dimmed Backdrop ── */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-300"
        onClick={handleSkip}
      />

      {/* ── Precision Target Element Spotlight Ring ── */}
      {targetRect && (
        <div
          className="fixed pointer-events-none transition-all duration-300 border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] ring-4 ring-blue-500/30 rounded-none z-50"
          style={{
            top: Math.max(0, targetRect.top - 4),
            left: Math.max(0, targetRect.left - 4),
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        >
          {/* Subtle pulsating corner accents */}
          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-600 rounded-none" />
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-600 rounded-none" />
          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-600 rounded-none" />
          <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-600 rounded-none" />
        </div>
      )}

      {/* ── Floating Tutorial Step Modal ── */}
      <div className="fixed bottom-8 right-8 z-[60] max-w-lg w-full px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white border-2 border-slate-900 shadow-2xl rounded-none p-6 flex flex-col justify-between">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 bg-slate-900 text-white font-mono-tech text-[10px] uppercase font-bold tracking-wider rounded-none">
                STEP {currentStep + 1} OF {steps.length}
              </span>
              {step.badge && (
                <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 font-mono-tech text-[10px] font-semibold uppercase tracking-wider rounded-none">
                  {step.badge}
                </span>
              )}
            </div>

            <button
              onClick={handleSkip}
              className="text-slate-400 hover:text-slate-900 transition-colors text-xs font-mono-tech uppercase tracking-wider font-semibold cursor-pointer"
              title="Skip Tour"
            >
              Skip Tutorial [ESC]
            </button>
          </div>

          {/* Modal Body */}
          <div className="mb-5">
            <h3 className="font-editorial text-2xl font-normal text-slate-900 tracking-tight leading-snug">
              {step.title}
            </h3>
            <p className="mt-2.5 text-xs text-slate-700 leading-relaxed font-sans font-normal">
              {step.description}
            </p>
            {step.tip && (
              <div className="mt-3 p-2.5 bg-slate-50 border-l-2 border-blue-600 text-[11px] text-slate-600 font-mono-tech">
                <span className="font-semibold text-slate-900">💡 Clinical Note: </span>
                {step.tip}
              </div>
            )}
          </div>

          {/* Progress Segment Bar */}
          <div className="flex items-center gap-1.5 mb-5">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 transition-all rounded-none ${
                  idx === currentStep
                    ? "bg-blue-600"
                    : idx < currentStep
                    ? "bg-slate-900"
                    : "bg-slate-200"
                }`}
              />
            ))}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              onClick={handleSkip}
              className="text-xs font-mono-tech text-slate-500 hover:text-slate-900 font-medium transition-colors cursor-pointer"
            >
              Skip Tutorial
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBack}
                disabled={isFirst}
                className={`px-3 py-1.5 text-xs font-mono-tech border rounded-none transition-colors ${
                  isFirst
                    ? "border-slate-200 text-slate-300 cursor-not-allowed"
                    : "border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                }`}
              >
                ← Back
              </button>

              <button
                onClick={handleNext}
                className="px-4 py-1.5 text-xs font-mono-tech font-semibold bg-slate-900 hover:bg-blue-600 text-white transition-colors cursor-pointer rounded-none flex items-center gap-1.5 shadow-sm"
              >
                <span>{isLast ? "Finish Tour ✓" : "Next Step →"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
