import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { useCurrency } from "../context/CurrencyContext";

const PERIODS = [
  { key: "daily",   label: "Daily",   icon: "📆", desc: "Today's report" },
  { key: "weekly",  label: "Weekly",  icon: "🗓",  desc: "This week" },
  { key: "monthly", label: "Monthly", icon: "📅", desc: "This month" },
  { key: "yearly",  label: "Yearly",  icon: "📊", desc: "This year" },
];

const STATUS_COLORS = {
  Approved: "bg-green-100 text-green-700",
  Pending:  "bg-yellow-100 text-yellow-700",
  Rejected: "bg-red-100 text-red-600",
  Cancelled:"bg-gray-100 text-gray-500",
  confirmed:"bg-green-100 text-green-700",
  pending:  "bg-yellow-100 text-yellow-700",
  cancelled:"bg-gray-100 text-gray-500",
  completed:"bg-blue-100 text-blue-700",
};

function fmt2(n) {
  return Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export default function Reports() {
  const { fmt, currency } = useCurrency();
  const [period, setPeriod]     = useState("monthly");
  const [report, setReport]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const printRef = useRef(null);
  const token = localStorage.getItem("token");

  const generate = useCallback(async (p) => {
    setLoading(true); setError(null); setReport(null);
    try {
      const res  = await fetch(`/api/reports?period=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to generate report.");
      setReport(json.data);
      setActiveTab("summary");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  /* ── Excel Export ── */
  const exportCSV = () => {
    if (!report) return;
    const wb = XLSX.utils.book_new();

    // ── Helper: auto-fit column widths based on content ──
    const autoWidth = (ws, rows) => {
      const maxLens = [];
      rows.forEach((row) => {
        row.forEach((cell, ci) => {
          const len = String(cell ?? "").length;
          if (!maxLens[ci] || len > maxLens[ci]) maxLens[ci] = len;
        });
      });
      ws["!cols"] = maxLens.map((w) => ({ wch: Math.min(Math.max(w + 2, 8), 60) }));
    };

    // ── Sheet 1: Summary ──
    const summaryRows = [
      ["Report Period", report.label],
      ["Generated At",  fmtDateTime(report.generatedAt)],
      ["Currency",      currency],
      [],
      ["Metric", "Value"],
      ["Total Revenue",           fmt(report.summary.totalRevenue)],
      ["Amount Collected",        fmt(report.summary.totalPaid)],
      ["Outstanding Balance",     fmt(report.summary.totalBalance)],
      ["Total Payments",          report.summary.totalPayments],
      ["Total Bookings",          report.summary.totalBookings],
      ["Avg Revenue per Booking", fmt(report.summary.avgRevenuePerBooking)],
      [],
      ["Payments by Status"],
      ["Status", "Count"],
      ...Object.entries(report.paymentsByStatus).map(([k, v]) => [k, v]),
      [],
      ["Revenue by Gateway"],
      ["Gateway", "Amount"],
      ...Object.entries(report.paymentsByGateway).map(([k, v]) => [k, fmt(v)]),
      [],
      ["Bookings by Status"],
      ["Status", "Count"],
      ...Object.entries(report.bookingsByStatus).map(([k, v]) => [k, v]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    autoWidth(wsSummary, summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // ── Sheet 2: Payments ──
    const payHeaders = ["Payment ID","Booking ID","Total Fee","Amount Paid","Balance","Status","Payment Type","Gateway","Reference #","Date"];
    const payRows = report.payments.map((p) => [
      p.paymentID, p.bookingID,
      Number(p.amount), Number(p.amountPaid), Number(p.balance),
      p.status, p.methodOfPayment, p.paymentMethod, p.referenceNumber,
      fmtDate(p.createdAt),
    ]);
    const wsPayments = XLSX.utils.aoa_to_sheet([payHeaders, ...payRows]);
    autoWidth(wsPayments, [payHeaders, ...payRows]);
    XLSX.utils.book_append_sheet(wb, wsPayments, "Payments");

    // ── Sheet 3: Bookings ──
    const bookHeaders = ["Booking ID","Status","Location","Total Fee","Days","Start Date","End Date","Created At"];
    const bookRows = report.bookings.map((b) => [
      b.bookingID, b.status, b.location,
      Number(b.totalFee), b.totalDays,
      fmtDate(b.startDate), fmtDate(b.endDate), fmtDate(b.createdAt),
    ]);
    const wsBookings = XLSX.utils.aoa_to_sheet([bookHeaders, ...bookRows]);
    autoWidth(wsBookings, [bookHeaders, ...bookRows]);
    XLSX.utils.book_append_sheet(wb, wsBookings, "Bookings");

    // ── Download ──
    XLSX.writeFile(wb, `report-${report.period}-${report.label.replace(/[\s/–→]/g, "-")}.xlsx`);
  };

  /* ── Print / PDF ── */
  const printReport = () => {
    const printContent = printRef.current?.querySelector(".report-printable");
    if (!printContent) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Report – ${report?.label || ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
    body { padding: 32px; color: #111; font-size: 12px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .sub { color: #6b7280; font-size: 11px; margin-bottom: 24px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; margin: 20px 0 8px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
    .card-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; }
    .card-value { font-size: 16px; font-weight: 700; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; color: #9ca3af; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
    td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid #f3f4f6; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; background: #f3f4f6; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  ${printContent.innerHTML}
</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;left:-9999px;top:-9999px;";
    document.body.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();
    iframe.contentWindow.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    };
  };

  const s = report?.summary;

  return (
    <div className="w-full px-4 space-y-5" ref={printRef}>

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-arl-dark">Reports</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {report ? `${report.label} · Generated ${fmtDateTime(report.generatedAt)}` : "Select a period and generate a report"}
          </p>
        </div>
        {report && (
          <div className="flex gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
              <span>⬇️</span> Export Excel
            </button>
            <button onClick={printReport}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90">
              <span>🖨️</span> Print / PDF
            </button>
          </div>
        )}
      </div>

      {/* PERIOD SELECTOR */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Select Report Period</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`flex flex-col items-center gap-1 px-4 py-4 rounded-xl border-2 transition-all ${
                period === p.key
                  ? "border-arl-dark bg-arl-dark text-white"
                  : "border-gray-100 hover:border-gray-300 text-gray-600"
              }`}>
              <span className="text-2xl">{p.icon}</span>
              <span className="font-semibold text-sm">{p.label}</span>
              <span className={`text-xs ${period === p.key ? "text-white/70" : "text-gray-400"}`}>{p.desc}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => generate(period)} disabled={loading}
            className="px-6 py-2.5 bg-arl-dark text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {loading ? (
              <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg> Generating…</>
            ) : "Generate Report →"}
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">⚠️ {error}</div>
      )}

      {/* REPORT OUTPUT */}
      {report && (
        <>
          {/* TABS */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {[
              { key: "summary",  label: "📋 Summary" },
              { key: "payments", label: "💳 Payments" },
              { key: "bookings", label: "📦 Bookings" },
            ].map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === t.key ? "bg-white text-arl-dark shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* SUMMARY TAB */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <BigStat label="Total Revenue"           value={fmt(s.totalRevenue)}           sub="Gross amount" color="teal" />
                <BigStat label="Amount Collected"        value={fmt(s.totalPaid)}              sub="Payments received" color="green" />
                <BigStat label="Outstanding Balance"     value={fmt(s.totalBalance)}           sub="Still due" color="orange" />
                <BigStat label="Total Payments"          value={s.totalPayments}               sub="Transactions" color="blue" />
                <BigStat label="Total Bookings"          value={s.totalBookings}               sub="Reservations" color="purple" />
                <BigStat label="Avg Revenue / Booking"   value={fmt(s.avgRevenuePerBooking)}   sub="Per reservation" color="pink" />
              </div>

              {/* Breakdown charts */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Payment status breakdown */}
                <BreakdownCard title="Payments by Status" data={report.paymentsByStatus}
                  colorFn={(k) => STATUS_COLORS[k] || "bg-gray-100 text-gray-600"} />
                {/* Gateway breakdown */}
                <BreakdownCard title="Revenue by Gateway" data={report.paymentsByGateway}
                  isCurrency fmt={fmt}
                  colorFn={() => "bg-teal-100 text-teal-700"} />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Booking status */}
                <BreakdownCard title="Bookings by Status" data={report.bookingsByStatus}
                  colorFn={(k) => STATUS_COLORS[k] || "bg-gray-100 text-gray-600"} />
              </div>
            </div>
          )}

          {/* PAYMENTS TAB */}
          {activeTab === "payments" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 text-sm">
                  Payment Records <span className="text-gray-400 font-normal">({report.payments.length})</span>
                </h2>
                <span className="text-xs text-gray-400">{report.label}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[750px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      {["Payment ID","Total","Paid","Balance","Status","Type","Gateway","Ref #","Date"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.payments.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No payment records in this period.</td></tr>
                    ) : report.payments.map((p, i) => (
                      <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${i%2===1?"bg-gray-50/30":""}`}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-[130px]">{p.paymentID}</td>
                        <td className="px-4 py-3 text-xs font-semibold">{fmt(p.amount)}</td>
                        <td className="px-4 py-3 text-xs text-green-700 font-semibold">{fmt(p.amountPaid)}</td>
                        <td className={`px-4 py-3 text-xs font-semibold ${p.balance > 0 ? "text-red-500" : "text-green-600"}`}>{fmt(p.balance)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[p.status]||"bg-gray-100 text-gray-500"}`}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{p.methodOfPayment}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{p.paymentMethod}</td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{p.referenceNumber}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BOOKINGS TAB */}
          {activeTab === "bookings" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 text-sm">
                  Booking Records <span className="text-gray-400 font-normal">({report.bookings.length})</span>
                </h2>
                <span className="text-xs text-gray-400">{report.label}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      {["Booking ID","Status","Location","Total Fee","Days","Start","End","Created"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.bookings.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No booking records in this period.</td></tr>
                    ) : report.bookings.map((b, i) => (
                      <tr key={b.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 ${i%2===1?"bg-gray-50/30":""}`}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-[130px]">{b.bookingID}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status]||"bg-gray-100 text-gray-500"}`}>{b.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">{b.location}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-800">{fmt(b.totalFee)}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{b.totalDays}d</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.startDate)}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.endDate)}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!report && !loading && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-5xl">📋</div>
          <p className="text-gray-500 font-semibold">No report generated yet</p>
          <p className="text-gray-400 text-sm">Pick a period above and click Generate Report</p>
        </div>
      )}

    </div>
  );
}

/* ── Sub-components ── */

function BigStat({ label, value, sub, color }) {
  const colors = {
    teal:   "text-teal-600   bg-teal-50",
    green:  "text-green-600  bg-green-50",
    orange: "text-orange-500 bg-orange-50",
    blue:   "text-blue-600   bg-blue-50",
    purple: "text-purple-600 bg-purple-50",
    pink:   "text-pink-600   bg-pink-50",
  };
  const [textC, bgC] = (colors[color] || "text-gray-800 bg-gray-50").split(" ");
  return (
    <div className={`rounded-2xl border border-gray-100 shadow-soft p-4 ${bgC}`}>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${textC}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function BreakdownCard({ title, data, colorFn, isCurrency, fmt: fmtFn }) {
  const entries = Object.entries(data || {});
  const total   = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No data</p>
      ) : (
        <div className="space-y-2">
          {entries.sort((a,b)=>b[1]-a[1]).map(([key, val]) => {
            const pct = total > 0 ? ((val / total) * 100).toFixed(0) : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold min-w-[80px] text-center ${colorFn(key)}`}>
                  {key}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-teal-500 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-24 text-right">
                  {isCurrency ? fmtFn(val) : val}
                </span>
                <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
