import { useEffect, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useCurrency } from "../context/CurrencyContext";
import { useTheme } from "../context/ThemeContext";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconCalendarDay = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M8 13h.01M12 13h.01M8 17h.01M12 17h.01M16 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconCalendarWeek = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M7 14h10M7 18h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconCalendarMonth = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="7" y="13" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
    <rect x="13" y="13" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
  </svg>
);

const IconBarChart = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 20h18M7 20V10M12 20V4M17 20v-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

// ─── DATA ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "daily",   label: "Daily",   Icon: IconCalendarDay,   sub: "Hours 0–23" },
  { key: "weekly",  label: "Weekly",  Icon: IconCalendarWeek,  sub: "Mon – Sun" },
  { key: "monthly", label: "Monthly", Icon: IconCalendarMonth, sub: "Weeks 1–4" },
  { key: "yearly",  label: "Yearly",  Icon: IconBarChart,      sub: "Jan – Dec" },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Analytics() {
  const { fmt, currency, convert } = useCurrency();
  const { isDark } = useTheme();
  const chartRef  = useRef(null);
  const chartInst = useRef(null);

  const [activeTab, setActiveTab]         = useState("daily");
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const token = localStorage.getItem("token");

  const fetchAnalytics = useCallback(async (type) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/analytics?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load analytics");
      setAnalyticsData(json.data);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAnalytics(activeTab); }, [activeTab, fetchAnalytics]);

  useEffect(() => {
    if (!chartRef.current || !analyticsData?.data) return;

    const labels   = analyticsData.data.map((d) => d.label);
    const rawPHP   = analyticsData.data.map((d) => d.revenue);
    const values   = rawPHP.map((v) => {
      const c = convert(v);
      return Math.round(c * 100) / 100;
    });

    const maxVal = Math.max(...values, 1);

    const bgColors = values.map((v) =>
      v > 0 ? "rgba(13, 148, 136, 0.85)" : (isDark ? "rgba(37,40,54,0.8)" : "rgba(229,231,235,0.6)")
    );
    const hoverColors = values.map((v) =>
      v > 0 ? "rgba(13, 148, 136, 1)" : (isDark ? "rgba(55,65,81,0.8)" : "rgba(209,213,219,0.8)")
    );
    const gridColor = isDark ? "rgba(42,45,62,0.8)" : "rgba(229,231,235,0.5)";

    if (chartInst.current) {
      chartInst.current.destroy();
      chartInst.current = null;
    }

    chartInst.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: `Revenue (${currency})`,
          data: values,
          backgroundColor: bgColors,
          hoverBackgroundColor: hoverColors,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${fmt(rawPHP[ctx.dataIndex])}`,
            },
            backgroundColor: isDark ? "#252836" : "#1f2937",
            titleColor: isDark ? "#6b7280" : "#9ca3af",
            bodyColor: "#f9fafb",
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#9ca3af",
              font: { size: 11 },
              maxRotation: activeTab === "daily" ? 45 : 0,
            },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            max: maxVal * 1.15,
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: "#9ca3af",
              font: { size: 11 },
              callback: (val) => fmt(val),
              maxTicksLimit: 6,
            },
            border: { display: false },
          },
        },
        animation: { duration: 400, easing: "easeOutQuart" },
      },
    });

    return () => {
      if (chartInst.current) {
        chartInst.current.destroy();
        chartInst.current = null;
      }
    };
  }, [analyticsData, currency, fmt, convert, activeTab, isDark]);

  useEffect(() => {
    const handler = () => {};
    window.addEventListener("currencyChange", handler);
    return () => window.removeEventListener("currencyChange", handler);
  }, []);

  const total    = analyticsData?.total || 0;
  const dataRows = analyticsData?.data  || [];
  const peak     = dataRows.reduce((b, d) => (d.revenue > (b?.revenue || 0) ? d : b), null);

  const periodLabel = () => {
    if (!analyticsData) return "";
    if (activeTab === "daily")   return analyticsData.date || "";
    if (activeTab === "weekly")  return `${analyticsData.weekStart} → ${analyticsData.weekEnd}`;
    if (activeTab === "monthly") return `${analyticsData.month} ${analyticsData.year}`;
    if (activeTab === "yearly")  return String(analyticsData.year || "");
    return "";
  };

  const activeTabData = TABS.find((t) => t.key === activeTab);

  return (
    <div className="w-full px-4 space-y-5">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Analytics</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {periodLabel()}
            {lastRefreshed && (
              <span className="ml-2 text-gray-300">
                · {lastRefreshed.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => fetchAnalytics(activeTab)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? "Loading…" : "Refresh"}
          </button>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === t.key
                    ? "bg-white text-arl-dark shadow-sm font-semibold"
                    : "text-gray-500 hover:text-gray-700"
                }`}>
                <t.Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <IconWarning className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => fetchAnalytics(activeTab)} className="text-red-600 font-semibold underline text-xs ml-4">Retry</button>
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Revenue" value={loading ? null : fmt(total)}                                            color="teal" />
        <StatCard label="Peak Period"   value={loading ? null : peak?.revenue > 0 ? peak.label : "—"}                 color="blue" />
        <StatCard label="Peak Amount"   value={loading ? null : peak?.revenue > 0 ? fmt(peak.revenue) : fmt(0)}       color="purple" />
      </div>

      {/* CHART */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 text-sm">
            {activeTabData?.label} Revenue
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-teal-500" />
            <span className="text-xs text-gray-400">{currency}</span>
          </div>
        </div>

        <div className="relative" style={{ height: "300px" }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10">
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 animate-spin text-teal-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="text-xs text-gray-400">Loading chart…</span>
              </div>
            </div>
          )}
          <canvas ref={chartRef} />
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">Breakdown</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full uppercase tracking-wide">
            {activeTabData?.sub}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Period</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Revenue</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Share</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {[1,2,3].map((j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                : dataRows.map((d, i) => {
                    const share = total > 0 ? ((d.revenue / total) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                        <td className="px-5 py-3 text-xs font-medium text-gray-700">{d.label}</td>
                        <td className="px-5 py-3 text-xs font-mono font-semibold text-gray-800">
                          {d.revenue > 0 ? fmt(d.revenue) : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-28 bg-gray-100 rounded-full h-1.5">
                              <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 tabular-nums">{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  const textColors = {
    teal:   "text-teal-600",
    blue:   "text-blue-600",
    purple: "text-purple-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      {value === null
        ? <div className="h-6 w-28 bg-gray-100 rounded animate-pulse" />
        : <p className={`text-lg font-bold ${textColors[color] || "text-gray-800"}`}>{value}</p>
      }
    </div>
  );
}