import { useEffect, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useCurrency } from "../context/CurrencyContext";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconRefresh = ({ className = "w-4 h-4", spinning }) => (
  <svg className={`${className} ${spinning ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// ─── DATA ────────────────────────────────────────────────────────────────────

const PERIOD_TABS = [
  { key: "daily",   label: "Daily" },
  { key: "weekly",  label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

// ─── PERIOD LABEL HELPERS ─────────────────────────────────────────────────────

function periodLabel(period, data) {
  if (!data) return "";
  if (period === "daily")   return data.date || "";
  if (period === "weekly")  return `${data.weekStart} → ${data.weekEnd}`;
  if (period === "monthly") return `${data.month} ${data.year}`;
  return "";
}

// ─── TREND CARD (self-contained: own tab state, own fetch, own chart) ────────

function TrendCard({ title, metric, valueKey, formatValue, barColor, barHoverColor, apiBase, token }) {
  const [period, setPeriod]   = useState("daily");
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const chartRef  = useRef(null);
  const chartInst = useRef(null);

  const fetchTrend = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${apiBase}/api/analytics?type=${p}&metric=${metric}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `Failed to load ${title.toLowerCase()}`);
      setData(json.data);
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token, metric, title]);

  useEffect(() => { fetchTrend(period); }, [period, fetchTrend]);

  useEffect(() => {
    if (!chartRef.current || !data?.data) return;

    const labels = data.data.map((d) => d.label);
    const values = data.data.map((d) => d[valueKey] || 0);
    const maxVal = Math.max(...values, 1);

    const bg = values.map((v) => (v > 0 ? barColor : "rgba(229,231,235,0.6)"));
    const hover = values.map((v) => (v > 0 ? barHoverColor : "rgba(209,213,219,0.8)"));

    if (chartInst.current) {
      chartInst.current.destroy();
      chartInst.current = null;
    }

    chartInst.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: bg,
          hoverBackgroundColor: hover,
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
            callbacks: { label: (ctx) => ` ${formatValue(values[ctx.dataIndex])}` },
            backgroundColor: "#1f2937",
            titleColor: "#9ca3af",
            bodyColor: "#f9fafb",
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9ca3af", font: { size: 11 }, maxRotation: period === "daily" ? 45 : 0 },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            max: maxVal * 1.15,
            grid: { color: "rgba(229,231,235,0.5)", drawBorder: false },
            ticks: { color: "#9ca3af", font: { size: 11 }, callback: (val) => formatValue(val), maxTicksLimit: 6 },
            border: { display: false },
          },
        },
        animation: { duration: 400, easing: "easeOutQuart" },
      },
    });

    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null; }
    };
  }, [data, period, valueKey, formatValue, barColor, barHoverColor]);

  const total = data?.total || 0;
  const hasAnyData = (data?.data || []).some((d) => (d[valueKey] || 0) > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
        <button onClick={() => fetchTrend(period)} disabled={loading}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Refresh">
          <IconRefresh spinning={loading} />
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {periodLabel(period, data)}
        {refreshedAt && (
          <span className="ml-2 text-gray-300">
            · {refreshedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}
          </span>
        )}
      </p>

      {/* Daily / Weekly / Monthly pill toggle */}
      <div className="flex gap-2 mb-4">
        {PERIOD_TABS.map((t) => (
          <button key={t.key} onClick={() => setPeriod(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              period === t.key
                ? "bg-blue-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5"><IconWarning className="w-3.5 h-3.5 shrink-0" />{error}</span>
          <button onClick={() => fetchTrend(period)} className="text-red-600 font-semibold underline">Retry</button>
        </div>
      )}

      <div className="relative" style={{ height: "220px" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl z-10">
            <svg className="w-6 h-6 animate-spin text-teal-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        )}
        {!loading && !error && !hasAnyData && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            No data for this period yet.
          </div>
        )}
        <canvas ref={chartRef} />
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Total</span>
        <span className="text-sm font-bold text-gray-800">{formatValue(total)}</span>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Analytics() {
  const { fmt, currency, convert } = useCurrency();
  const token = localStorage.getItem("token");
  const apiBase = process.env.REACT_APP_API_URL;

  const formatRevenue = useCallback((v) => fmt(Math.round(convert(v) * 100) / 100), [fmt, convert]);
  const formatCount    = useCallback((v) => `${Math.round(v)}`, []);

  return (
    <div className="w-full px-4 space-y-5">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Analytics</h1>
          <p className="text-xs text-gray-400 mt-0.5">Revenue and booking trends</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full uppercase tracking-wide">
          {currency}
        </span>
      </div>

      {/* TREND CARDS */}
      <div className="grid md:grid-cols-2 gap-4">
        <TrendCard
          title="Revenue Trend"
          metric="revenue"
          valueKey="revenue"
          formatValue={formatRevenue}
          barColor="rgba(13, 148, 136, 0.85)"
          barHoverColor="rgba(13, 148, 136, 1)"
          apiBase={apiBase}
          token={token}
        />
        <TrendCard
          title="Booking Trend"
          metric="bookings"
          valueKey="count"
          formatValue={formatCount}
          barColor="rgba(34, 197, 94, 0.85)"
          barHoverColor="rgba(34, 197, 94, 1)"
          apiBase={apiBase}
          token={token}
        />
      </div>

    </div>
  );
}