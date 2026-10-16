import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#EBF3F1] flex flex-col items-center justify-center p-6 text-slate-800">
      <div className="w-12 h-12 rounded-2xl bg-teal-800 flex items-center justify-center text-white font-bold text-2xl mb-4">
        ∞
      </div>
      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Kiko Digital Twin</h1>
      <p className="text-sm text-slate-500 mb-8 text-center max-w-md">
        Predictive Physiological Multi-Modal Twin Platform for Type 1 & Type 2 Diabetes Management
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
        <Link
          href="/doctor"
          className="clean-card p-6 flex flex-col justify-between hover:border-teal-400 transition-all cursor-pointer"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
              Provider
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-3">Clinician Dashboard</h2>
            <p className="text-xs text-slate-500 mt-1">
              Population risk triage, 2-hour trajectory forecasting, and adverse event alerts.
            </p>
          </div>
          <span className="text-xs font-bold text-teal-700 mt-4 flex items-center">Open Portal →</span>
        </Link>

        <Link
          href="/patient"
          className="clean-card p-6 flex flex-col justify-between hover:border-blue-400 transition-all cursor-pointer"
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              Patient
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-3">Patient Companion</h2>
            <p className="text-xs text-slate-500 mt-1">
              Real-time metabolic status, interactive "What-If" meal simulator, and Indian macro logger.
            </p>
          </div>
          <span className="text-xs font-bold text-blue-700 mt-4 flex items-center">Open Portal →</span>
        </Link>
      </div>
    </div>
  );
}
