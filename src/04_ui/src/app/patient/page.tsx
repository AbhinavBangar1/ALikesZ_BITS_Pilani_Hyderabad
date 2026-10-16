"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WhatIfResponse {
  patient_id: string;
  patient_name: string;
  action_evaluated: {
    carbs_added_g: number;
    bolus_added_u: number;
    walk_duration_min: number;
  };
  horizons_min: number[];
  baseline_trajectory: number[];
  simulated_trajectory: number[];
  net_difference_mg_dl: number[];
  safety_flag: string;
  clinical_recommendation: string;
}

export default function PatientDashboard() {
  const patientId = "T1D-IN-001"; // Aarav Sharma
  const [currentGlucose, setCurrentGlucose] = useState<number>(112);
  const [cgmTime, setCgmTime] = useState<string>("7:45 PM");
  const [forecast30, setForecast30] = useState<number>(119);
  const [forecast60, setForecast60] = useState<number>(124);
  const [sparklineData, setSparklineData] = useState<number[]>([]);

  // Simulator Sliders
  const [carbs, setCarbs] = useState<number>(60);
  const [bolus, setBolus] = useState<number>(3.0);
  const [walk, setWalk] = useState<number>(10);

  // Simulation output
  const [whatIf, setWhatIf] = useState<WhatIfResponse | null>(null);

  // Meal Multipliers
  const [multipliers, setMultipliers] = useState<Record<string, number>>({
    roti: 2.0,
    dal: 1.0,
    paneer: 1.0,
    rice: 0,
    dosa: 0,
    idli: 0,
    poha: 0,
  });

  const baseMacros: Record<string, { carbs: number; protein: number; fat: number }> = {
    roti: { carbs: 18, protein: 3, fat: 1 },
    dal: { carbs: 20, protein: 9, fat: 5 },
    paneer: { carbs: 4, protein: 14, fat: 18 },
    rice: { carbs: 35, protein: 3, fat: 1 },
    dosa: { carbs: 45, protein: 6, fat: 10 },
    idli: { carbs: 30, protein: 5, fat: 2 },
    poha: { carbs: 32, protein: 5, fat: 7 },
  };

  // Initial load
  useEffect(() => {
    async function loadPatient() {
      try {
        const [streamRes, forecastRes] = await Promise.all([
          fetch(`http://127.0.0.1:8000/api/patient/${patientId}/stream?points=24`),
          fetch(`http://127.0.0.1:8000/api/patient/${patientId}/twin-forecast`),
        ]);

        const stream = await streamRes.json();
        const forecast = await forecastRes.json();

        setCurrentGlucose(Math.round(forecast.current_glucose));
        setCgmTime(forecast.timestamp.split(" ")[1].slice(0, 5));
        setForecast30(Math.round(forecast.forecast.t_plus_30min));
        setForecast60(Math.round(forecast.forecast.t_plus_60min));
        setSparklineData((stream.data || []).map((pt: any) => pt.glucose));
      } catch (err) {
        console.error("Failed to load patient companion:", err);
      }
    }

    loadPatient();
  }, []);

  // Run simulation whenever sliders change
  useEffect(() => {
    async function runSimulation() {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/patient/${patientId}/simulate-what-if`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ carbs_g: carbs, bolus_u: bolus, walk_min: walk }),
        });
        const result = await res.json();
        setWhatIf(result);
      } catch (err) {
        console.error("What-if execution failed:", err);
      }
    }

    runSimulation();
  }, [carbs, bolus, walk]);

  // Compute Meal Totals
  const mealTotals = Object.entries(multipliers).reduce(
    (acc, [food, mult]) => {
      if (mult > 0 && baseMacros[food]) {
        acc.carbs += baseMacros[food].carbs * mult;
        acc.protein += baseMacros[food].protein * mult;
        acc.fat += baseMacros[food].fat * mult;
      }
      return acc;
    },
    { carbs: 0, protein: 0, fat: 0 }
  );

  const applyMeal = () => {
    setCarbs(Math.round(mealTotals.carbs));
  };

  const resetSliders = () => {
    setCarbs(60);
    setBolus(3.0);
    setWalk(10);
  };

  const peakSimVal = whatIf ? Math.max(...whatIf.simulated_trajectory) : 207;
  const isHypoDanger = whatIf?.safety_flag === "DANGER_HYPO" || (whatIf && Math.min(...whatIf.simulated_trajectory) < 70);
  const isHyperSpike = whatIf?.safety_flag === "WARN_HYPER" || peakSimVal > 190;
  const isSafe = !isHypoDanger && !isHyperSpike;

  return (
    <div className="min-h-screen bg-[#EBF3F1] p-4 md:p-6 text-slate-800">
      {/* Top Header */}
      <header className="flex items-center justify-between pb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-teal-800 flex items-center justify-center text-white font-bold text-lg">
            ∞
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">Kiko</span>
        </div>

        <div className="hidden sm:block text-center">
          <h1 className="text-base font-bold text-slate-900">Good evening, Aarav</h1>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/doctor"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            Clinician Portal
          </Link>
          <span className="text-xs font-medium bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Simulated Patient</span>
          </span>
          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-bold">
            AS
          </div>
        </div>
      </header>

      {/* Main 3-Column Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Status + Lookahead + Meal Ideas (col-span-3) */}
        <aside className="lg:col-span-3 space-y-5">
          {/* Current Glucose Hero Card */}
          <div className="clean-card p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate-400 font-medium">
                Current glucose · <span>{cgmTime}</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                ✓ In range
              </span>
            </div>
            <div className="flex items-baseline space-x-2 my-2">
              <span className="text-5xl font-black text-slate-900">{currentGlucose}</span>
              <span className="text-xs font-medium text-slate-400">mg/dL</span>
            </div>
            <p className="text-xs font-semibold text-emerald-600 flex items-center">
              <span className="mr-1">↗</span> Rising slowly
            </p>

            {/* Sparkline Canvas */}
            <div className="h-16 w-full mt-4">
              <svg className="w-full h-full" viewBox="0 0 200 60" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  points={sparklineData
                    .map((val, i) => `${(i / (sparklineData.length - 1 || 1)) * 200},${60 - ((val - 60) / 180) * 55}`)
                    .join(" ")}
                />
              </svg>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">Last 3 hours · target 70–180</p>
          </div>

          {/* Forecast Badges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="clean-card p-3.5">
              <span className="text-[10px] text-slate-400 block font-medium">In 30 min</span>
              <div className="flex items-baseline space-x-1 my-1">
                <span className="text-xl font-extrabold text-slate-800">{forecast30}</span>
                <span className="text-[10px] text-slate-400">mg/dL</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded block text-center">
                Stays in range
              </span>
            </div>
            <div className="clean-card p-3.5">
              <span className="text-[10px] text-slate-400 block font-medium">In 1 hour</span>
              <div className="flex items-baseline space-x-1 my-1">
                <span className="text-xl font-extrabold text-slate-800">{forecast60}</span>
                <span className="text-[10px] text-slate-400">mg/dL</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded block text-center">
                Stays in range
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center -mt-2">Forecast if you do nothing new</p>

          {/* Next Meal Ideas */}
          <div className="clean-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">Next meal ideas</h3>
              <span className="text-[9px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded">Matched to trend</span>
            </div>
            <p className="text-[10px] text-slate-400">Lower-carb picks to keep you steady</p>

            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">
                  🌱
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800">Moong chilla with mint chutney</p>
                  <p className="text-[10px] text-slate-500">12 g carbs · 14 g protein</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">
                  🌾
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800">Roasted chana with buttermilk</p>
                  <p className="text-[10px] text-slate-500">14 g carbs · 9 g protein</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center space-x-2.5">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">
                  🥒
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800">Cucumber and paneer salad</p>
                  <p className="text-[10px] text-slate-500">5 g carbs · 11 g protein</p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-start space-x-2 text-[10px] text-slate-500">
              <span>🌙</span>
              <p>If you are dropping at bedtime, we suggest a small glass of milk to steady the night.</p>
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: Simulator & Safety Check (col-span-6) */}
        <section className="lg:col-span-6 space-y-5">
          <div className="clean-card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-900">What if I eat this?</h2>
              <button
                onClick={resetSliders}
                className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Reset
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Move the sliders to see how your glucose could respond over the next 2 hours
            </p>

            {/* Sliders */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-700">🍴 Food carbs</span>
                  <span className="font-extrabold text-blue-700">{carbs} g</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={carbs}
                  onChange={(e) => setCarbs(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>0</span>
                  <span>100 g</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-700">💉 Insulin bolus</span>
                  <span className="font-extrabold text-teal-700">{bolus} U</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={bolus}
                  onChange={(e) => setBolus(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                />
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>0</span>
                  <span>10 U</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-700">🚶 Walking</span>
                  <span className="font-extrabold text-emerald-700">{walk} min</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="5"
                  value={walk}
                  onChange={(e) => setWalk(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>0</span>
                  <span>60 min</span>
                </div>
              </div>
            </div>

            {/* Trajectory Header */}
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-slate-800">Two possible next 2 hours</span>
              <div className="flex items-center space-x-3 text-[11px]">
                <span className="text-slate-400 font-medium">-- Do nothing</span>
                <span className="text-blue-700 font-bold">— With your inputs</span>
              </div>
            </div>

            {/* Custom SVG Trajectory Chart */}
            <div className="h-64 w-full relative pt-2">
              <svg className="w-full h-full" viewBox="0 0 450 220" preserveAspectRatio="none">
                {/* Target Band (70-180 mg/dL) */}
                <rect x="0" y="65" width="450" height="95" fill="#F0FDF4" />
                <line x1="0" y1="65" x2="450" y2="65" stroke="#BBF7D0" strokeDasharray="3 3" />
                <line x1="0" y1="160" x2="450" y2="160" stroke="#BBF7D0" strokeDasharray="3 3" />

                {/* Vertical 'Now' Line */}
                <line x1="90" y1="10" x2="90" y2="210" stroke="#CBD5E1" strokeWidth="1.5" />
                <text x="95" y="25" fontSize="10" fill="#64748B" fontWeight="bold">
                  Now
                </text>

                {/* Baseline Line (Do nothing) */}
                {whatIf && (
                  <polyline
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    points={`
                      90,${210 - ((whatIf.baseline_trajectory[0] - 40) / 280) * 190}
                      180,${210 - ((whatIf.baseline_trajectory[1] - 40) / 280) * 190}
                      280,${210 - ((whatIf.baseline_trajectory[2] - 40) / 280) * 190}
                      410,${210 - ((whatIf.baseline_trajectory[3] - 40) / 280) * 190}
                    `}
                  />
                )}

                {/* Simulated Curve (With your inputs) */}
                {whatIf && (
                  <polyline
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="3"
                    points={`
                      90,${210 - ((whatIf.simulated_trajectory[0] - 40) / 280) * 190}
                      180,${210 - ((whatIf.simulated_trajectory[1] - 40) / 280) * 190}
                      280,${210 - ((whatIf.simulated_trajectory[2] - 40) / 280) * 190}
                      410,${210 - ((whatIf.simulated_trajectory[3] - 40) / 280) * 190}
                    `}
                  />
                )}

                {/* Peak Dot & Callout */}
                {whatIf && (
                  <>
                    <circle
                      cx="280"
                      cy={210 - ((whatIf.simulated_trajectory[2] - 40) / 280) * 190}
                      r="4"
                      fill="#EA580C"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x="240"
                      y={Math.max(25, 210 - ((whatIf.simulated_trajectory[2] - 40) / 280) * 190 - 10)}
                      fontSize="10"
                      fill="#EA580C"
                      fontWeight="bold"
                    >
                      Peak {Math.round(peakSimVal)} at +75 min
                    </text>
                  </>
                )}
              </svg>
            </div>

            <div className="flex justify-between text-[10px] text-slate-400 mt-2">
              <span>Now</span>
              <span>+30 min</span>
              <span>+1 hour</span>
              <span>+2 hours</span>
            </div>
          </div>

          {/* Safety Check for this Scenario */}
          <div className="clean-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-900">Safety check for this scenario</h3>
              <span className="text-[10px] text-slate-400">Updates as you move the sliders</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-center text-xs font-bold mb-3">
              <div className={`py-1.5 rounded-lg ${isSafe ? "bg-emerald-100 text-emerald-800 shadow-sm" : "text-slate-400"}`}>
                Safe
              </div>
              <div
                className={`py-1.5 rounded-lg ${
                  isHypoDanger ? "bg-rose-100 text-rose-800 shadow-sm" : "text-slate-400"
                }`}
              >
                Hypo danger
              </div>
              <div
                className={`py-1.5 rounded-lg ${
                  isHyperSpike ? "bg-amber-100 text-amber-800 shadow-sm" : "text-slate-400"
                }`}
              >
                Hyper spike
              </div>
            </div>

            <div
              className={`p-3.5 border rounded-xl flex items-start space-x-3 ${
                isHypoDanger
                  ? "bg-rose-50/70 border-rose-200 text-rose-900"
                  : isHyperSpike
                  ? "bg-amber-50/70 border-amber-200 text-amber-900"
                  : "bg-emerald-50/70 border-emerald-200 text-emerald-900"
              }`}
            >
              <span className="text-base">{isHypoDanger ? "🛑" : isHyperSpike ? "⚠️" : "✅"}</span>
              <div>
                <p className="text-xs font-bold">
                  {isHypoDanger
                    ? "Hypoglycemia Danger! Predicted crash below 70 mg/dL."
                    : isHyperSpike
                    ? `Your glucose is likely to peak near ${Math.round(peakSimVal)} mg/dL after eating.`
                    : "Safe to proceed! Glucose stays balanced within your target range."}
                </p>
                <p className="text-[11px] mt-0.5 opacity-90">
                  {whatIf?.clinical_recommendation ||
                    "Try a 20-minute walk after the meal, or adjust bolus slightly."}
                </p>
              </div>
            </div>
            <p className="text-[9px] text-slate-400 text-center mt-3">
              Guidance from a simulated twin. It is not medical advice.
            </p>
          </div>
        </section>

        {/* RIGHT COLUMN: Food Logger & Macros (col-span-3) */}
        <aside className="lg:col-span-3 clean-card p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 mb-0.5">Today's meal</h2>
            <p className="text-[10px] text-slate-400 mb-3">Tap to add common Indian foods</p>

            {/* Food Chips */}
            <div className="flex flex-wrap gap-1.5 mb-4 text-xs font-medium">
              {["roti", "rice", "dal", "paneer", "dosa", "idli", "poha"].map((food) => {
                const isActive = (multipliers[food] || 0) > 0;
                return (
                  <button
                    key={food}
                    onClick={() =>
                      setMultipliers((prev) => ({
                        ...prev,
                        [food]: prev[food] > 0 ? 0 : 1.0,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {isActive ? "✓" : "+"} {food.charAt(0).toUpperCase() + food.slice(1)}
                  </button>
                );
              })}
            </div>

            {/* Selected Items */}
            <div className="space-y-3 mb-5">
              {Object.entries(multipliers).map(([food, mult]) => {
                if (mult <= 0) return null;
                const c = Math.round(baseMacros[food].carbs * mult);

                return (
                  <div key={food} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 capitalize">{food}</span>
                      <span className="font-extrabold text-slate-900">{c} g carbs</span>
                    </div>
                    <div className="flex space-x-1 text-[10px] font-semibold mt-2">
                      {[0.5, 1.0, 1.5, 2.0].map((m) => (
                        <button
                          key={m}
                          onClick={() => setMultipliers((prev) => ({ ...prev, [food]: m }))}
                          className={`px-2 py-0.5 rounded transition-all ${
                            mult === m ? "bg-slate-900 text-white font-bold" : "bg-white border border-slate-200"
                          }`}
                        >
                          x{m === 0.5 ? "½" : m}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="space-y-2.5 pt-3 border-t border-slate-100 text-xs">
              <span className="font-bold text-slate-900 block mb-1">Meal total</span>
              <div>
                <div className="flex justify-between font-semibold mb-0.5">
                  <span className="text-slate-600">Carbs</span>
                  <span className="text-blue-700 font-extrabold">{Math.round(mealTotals.carbs)} g</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${Math.min(100, (mealTotals.carbs / 100) * 100)}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-semibold mb-0.5">
                  <span className="text-slate-600">Protein</span>
                  <span className="text-emerald-700 font-extrabold">{Math.round(mealTotals.protein)} g</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${Math.min(100, (mealTotals.protein / 50) * 100)}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-semibold mb-0.5">
                  <span className="text-slate-600">Fat</span>
                  <span className="text-amber-700 font-extrabold">{Math.round(mealTotals.fat)} g</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${Math.min(100, (mealTotals.fat / 50) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={applyMeal}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm"
            >
              Simulate this meal
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Sends {Math.round(mealTotals.carbs)} g carbs to the simulator
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
