import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import { barRows } from "../../utils/reportTabPdf";
import { money, count } from "../../utils/reportCells";
import { Chart as ChartJS, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE & PENALTIES
//
// Questions this tab answers:  "What did maintenance cost?"  and  "Who was penalized, and did it get paid?"
//
// Same layout as Rentals & Customers: stat cards on top, then a graph with its table right under it, for customers
// and for vehicles. Each bar / row is split in two:
//     Customers   Paid | Unpaid                      (penalties charged to that customer)
//     Vehicles    Recovered | Not recovered          (maintenance cost of that car)
// "View" on a customer row (or a click on its bar) opens the cars they were penalized on; on a car row it opens who was
// penalized on it.
//
// Only Confirmed penalties count. The customer graph lists penalties CHARGED in the period (paid so far / unpaid).
// "Recovered" = what was collected on penalties of the SAME BOOKING a repair is linked to, capped at the repair's cost; a repair that
// is not linked to a booking (routine maintenance) recovers nothing.
// "Collected" = penalty money received in the period (cash by the day it was paid, plus what the held deposit covered, dated by
// the day the penalty was confirmed). "Unpaid now" = everything still owed on Confirmed penalties, from any period.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// Needs from /api/reports/maintenance-penalties:
//   cards        { totalMaintenance, scheduledMaintenance, penaltiesCollected, penaltiesCollectedCash, penaltiesCoveredByDeposit, penaltiesPending, pendingCustomers }
//   cars         [{ carID, name, jobs, total, recovered, absorbed, scheduled }]   scheduled = still-Scheduled jobs in the period, striped, never part of the cost
//   penaltyRows  [{ userID, carID, customer, car, amount, paid, pending }]   one per Confirmed penalty
// ─────────────────────────────────────────────────────────────────────────────

export default function MaintenancePenalties({ period, year, month, week, day, exportRef }) {
  const { report, loading, error } = useMaintenanceReport({ period, year, month, week, day });
  return (
    <ReportGate report={report} loading={loading} error={error}>
      <MaintenancePenaltiesView report={report} exportRef={exportRef} />
    </ReportGate>
  );
}

// ── loads /api/reports/maintenance-penalties for the selected period (kept for a minute so flipping back is instant) ──
const cache = new Map(); // query string -> { at, data }

function useMaintenanceReport({ period, year, month, week, day }) {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const reqRef = useRef(0); // only the newest request may update the page
  const token = localStorage.getItem("token");

  const load = useCallback(async ({ force = false } = {}) => {
    const params = new URLSearchParams({ period, year: String(year) });
    if (period === "monthly" || period === "weekly" || period === "daily") params.set("month", String(month));
    if (period === "weekly") params.set("week", String(week));
    if (period === "daily")  params.set("day", String(day));
    const qs = params.toString();

    const hit = cache.get(qs);
    if (!force && hit && Date.now() - hit.at < 60000) {
      reqRef.current += 1;
      setReport(hit.data); setError(null); setLoading(false);
      return;
    }

    const id = ++reqRef.current;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/reports/maintenance-penalties?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load the report.");
      if (id !== reqRef.current) return;
      cache.set(qs, { at: Date.now(), data: json.data });
      setReport(json.data);
    } catch (e) {
      if (id !== reqRef.current) return;
      setReport(null); setError(e.message);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [token, period, year, month, week, day]);

  // short delay so quick dropdown changes don't each fire a request
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  return { report, loading, error, reload: () => load({ force: true }) };
}

// ── icons ───────────────────────────────────────────────────────────────────

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconClipboard = ({ className = "w-12 h-12" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const IconPackage = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconCreditCard = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
    <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

function ReportGate({ report, loading, error, children }) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
        <IconWarning className="w-4 h-4 shrink-0" />
        {error}
      </div>
    );
  }
  if (!report) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
        <IconClipboard className="w-12 h-12" />
        <p className="text-gray-500 font-semibold">{loading ? "Loading report\u2026" : "No report yet"}</p>
      </div>
    );
  }
  return <div className={`space-y-4 transition-opacity ${loading ? "opacity-50 pointer-events-none" : ""}`}>{children}</div>;
}

// ── what each bar is split into ─────────────────────────────────────────────

const C_GREEN = "#16a34a", C_RED = "#ef4444";

const CUSTOMER_SERIES = [
  { key: "paid",   label: "Paid",   color: C_GREEN },
  { key: "unpaid", label: "Unpaid", color: C_RED },
];
const CAR_SERIES = [
  { key: "recovered", label: "Recovered",     color: C_GREEN },
  { key: "absorbed",  label: "Not recovered", color: C_RED },
];
// maintenance that is still Scheduled in the period: striped, on the end of the bar, never part of the cost
const C_ORANGE = "#f97316";
const CAR_SCHEDULED = { key: "scheduled", label: "Scheduled (not done yet)", color: "#fed7aa", textColor: C_ORANGE, hatch: C_ORANGE };
const carSeriesFor = (rows) => (rows.some((r) => r.scheduled > 0) ? [...CAR_SERIES, CAR_SCHEDULED] : CAR_SERIES);
// white-and-colour stripes for a Chart.js bar (needs the canvas the chart is drawn on)
const makeHatch = (canvas, color) => {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 8;
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, 8, 8);
  x.strokeStyle = color; x.lineWidth = 2;
  x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
  return canvas.getContext("2d").createPattern(c, "repeat");
};
// the length of a bar: what was spent plus what is scheduled
const barLen = (r) => r.total + (r.scheduled || 0);

const PAGE_SIZE = 7;             // rows per page: the graph and the table under it always show the same rows
const MODAL_PAGE_SIZE = 10;      // same page size as the Bookings table

// ── grouping + sorting ──────────────────────────────────────────────────────

/** One row per customer with paid / unpaid amounts, plus `children`: the same split per car they were penalized on. */
function buildCustomerRows(penaltyRows) {
  const map = new Map();
  const add = (target, p) => {
    target.paid += p.paid;
    target.unpaid += p.pending;
    target.total = target.paid + target.unpaid;
    target.count += 1;
  };
  for (const p of penaltyRows) {
    if (p.paid + p.pending <= 0) continue;

    const id = p.userID || "unknown";
    if (!map.has(id)) map.set(id, { id, name: p.customer || "Unknown", paid: 0, unpaid: 0, total: 0, count: 0, subs: new Map() });
    const row = map.get(id);
    add(row, p);

    const sid = p.carID || "unknown";
    if (!row.subs.has(sid)) row.subs.set(sid, { id: sid, name: p.car || "Unknown Vehicle", paid: 0, unpaid: 0, total: 0, count: 0 });
    add(row.subs.get(sid), p);
  }
  return [...map.values()].map(({ subs, ...row }) => ({
    ...row,
    children: [...subs.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
  }));
}

/**
 * One row per car that had completed maintenance: recovered / not recovered, plus `children`: the customers who
 * were penalized on that car (all Confirmed penalties, whatever their paid status).
 */
function buildCarRows(cars, penaltyRows) {
  const byCar = new Map();
  for (const p of penaltyRows) {
    if (!p.carID) continue;
    if (!byCar.has(p.carID)) byCar.set(p.carID, new Map());
    const m = byCar.get(p.carID);
    const uid = p.userID || "unknown";
    if (!m.has(uid)) m.set(uid, { id: uid, name: p.customer || "Unknown", count: 0, paid: 0, unpaid: 0, total: 0 });
    const c = m.get(uid);
    c.count += 1; c.paid += p.paid; c.unpaid += p.pending; c.total += p.amount;
  }
  return cars
    .map((c) => ({
      id: c.carID || c.name,
      name: c.name,
      recovered: c.recovered, absorbed: c.absorbed,
      scheduled: c.scheduled || 0,
      total: c.recovered + c.absorbed,
      count: c.jobs ?? 0,
      children: [...(byCar.get(c.carID)?.values() || [])].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    }))
    .filter((r) => r.total > 0 || r.scheduled > 0);
}

function sortRows(rows, { key, dir }) {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name) * sign;
    return (a[key] - b[key]) * sign || a.name.localeCompare(b.name);
  });
}

function paged(list, p, size = PAGE_SIZE) {
  const count = Math.max(1, Math.ceil(list.length / size));
  const no = Math.min(p, count);
  return { count, no, rows: list.slice((no - 1) * size, no * size) };
}

// ── small pieces ────────────────────────────────────────────────────────────

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>
);

// Same stat card as the Rentals tab: colored icon square on the left, number and title on the right.
function StatCard({ title, value, Icon, color }) {
  return (
    <div className="rounded-2xl border border-transparent bg-gray-50 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-gray-800 truncate" title={String(value)}>{value}</div>
        <div className="text-xs text-gray-500 truncate" title={title}>{title}</div>
      </div>
    </div>
  );
}

/** Small colour key above a graph. */
function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mb-3">
      {items.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} /> {s.label}
        </span>
      ))}
    </div>
  );
}

function Empty({ children }) {
  return <div className="py-10 text-center text-sm text-gray-400">{children}</div>;
}

function SectionHead({ title }) {
  return (
    <div className="mb-3 text-center">
      <h2 className="font-sans text-xl font-bold text-arl-dark">{title}</h2>
    </div>
  );
}

/** A round step (1, 2, 5, 10, 20 ...) so the bottom scale has about five whole-number marks. */
function niceStep(max) {
  const raw = Math.max(1, max) / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return Math.max(1, Math.round(m * pow));
}

/** 1250 -> "1.3k", 80 -> "80": short enough to sit inside a bar or under the scale. */
function compact(n) {
  const v = Math.abs(n);
  if (v >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(+n.toFixed(v < 10 ? 1 : 0));
}

// ── graph: one stacked bar per customer / car, split in two (Chart.js) ──────

/**
 * Y = the customers (or cars), X = the amount along the bottom (converted to the chosen currency). Each bar is split by
 * `series`. Clicking a bar opens the same window as the View button of its table row. The scale is taken from `scaleMax`,
 * so bars compare across pages.
 * Chart.js draws the axes, the hover tooltip and the resizing; the amounts inside the segments come from a tiny plugin.
 */
function SplitBars({ rows, scaleMax = 0, series, onOpen, money }) {
  const { convert, currency, SYMBOLS } = useCurrency();
  const sym = SYMBOLS?.[currency] || "₱";
  const canvasRef = useRef(null);
  const live = useRef({});
  live.current = { onOpen, money };   // the newest callbacks, so the chart is not rebuilt on every render

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const maxTotal = Math.max(1, convert(scaleMax), ...rows.map((r) => convert(barLen(r))));
    const step = niceStep(maxTotal);
    const axisMax = Math.max(step, Math.ceil(maxTotal / step) * step);

    const datasets = series.map((s) => ({
      label: s.label, key: s.key,
      data: rows.map((r) => (r[s.key] > 0 ? convert(r[s.key]) : null)),
      backgroundColor: s.hatch ? makeHatch(canvasRef.current, s.hatch) : s.color,
      ...(s.hatch ? { borderColor: s.hatch, borderWidth: 1, labelColor: s.textColor } : {}),
      borderSkipped: false,
      barPercentage: 0.9,
    }));

    // the amount written inside a segment, only when the segment is wide enough to hold it
    const segLabels = {
      id: "segLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = "600 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        chart.data.datasets.forEach((ds, di) => {
          ctx.fillStyle = ds.labelColor || "#fff";
          chart.getDatasetMeta(di).data.forEach((el, i) => {
            const v = ds.data[i];
            if (v == null) return;
            const txt = compact(v);
            if (Math.abs(el.x - el.base) < txt.length * 6 + 10) return;
            ctx.fillText(txt, (el.x + el.base) / 2, el.y);
          });
        });
        ctx.restore();
      },
    };

    const chart = new ChartJS(canvasRef.current, {
      type: "bar",
      data: { labels: rows.map((r) => r.name), datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        categoryPercentage: 0.9,
        layout: { padding: { right: 8 } },
        interaction: { mode: "nearest", axis: "y", intersect: true },
        onHover: (_e, els, c) => { c.canvas.style.cursor = els.length ? "pointer" : "default"; },
        onClick: (_e, els) => { if (els.length) live.current.onOpen(rows[els[0].index]); },
        scales: {
          x: {
            stacked: true, min: 0, max: axisMax,
            grid: { color: "#f3f4f6" }, border: { display: false },
            ticks: { stepSize: step, color: "#9ca3af", font: { size: 10 }, callback: (v) => `${sym}${compact(v)}` },
            title: { display: true, text: `Amount (${currency})`, color: "#9ca3af", font: { size: 11, weight: "normal" } },
          },
          y: {
            stacked: true,
            grid: { display: false }, border: { color: "#d1d5db" },
            ticks: {
              autoSkip: false, color: "#374151", font: { size: 11, weight: "600" },
              callback(value) { const l = this.getLabelForValue(value); return l.length > 24 ? `${l.slice(0, 23)}…` : l; },
            },
          },
        },
        plugins: {
          legend: { display: false },   // the Legend above the graph already says which colour is which
          tooltip: {
            callbacks: {
              title: (items) => rows[items[0].dataIndex].name,
              label: (item) => `${item.dataset.label}: ${live.current.money(rows[item.dataIndex][item.dataset.key])}`,
              footer: (items) => `Total: ${live.current.money(rows[items[0].dataIndex].total)}`,
            },
          },
        },
      },
      plugins: [segLabels],
    });
    return () => chart.destroy();
  }, [rows, scaleMax, series, convert, currency, sym]);

  return (
    <div className="relative w-full" style={{ height: Math.max(130, rows.length * 32 + 64) }}>
      <canvas ref={canvasRef} role="img" aria-label="Amounts by customer or vehicle" />
    </div>
  );
}

// ── tables: same format as the Bookings page and Revenue & Expense ───────────

const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconClose = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Clickable header cell, same look as the Bookings table. `sort` is { key, dir }; onSort receives the next one. */
function SortableTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  const click = () => onSort({ key: sortKey, dir: active ? (sort.dir === "asc" ? "desc" : "asc") : sortKey === "name" ? "asc" : "desc" });
  return (
    <th className="px-4 py-3 text-left select-none">
      <button onClick={click}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors whitespace-nowrap ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}>
        {label}
        {active ? <IconSortArrow dir={sort.dir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

/** A money cell: "—" when zero, coloured otherwise. */
function MoneyCell({ value, color, fmt }) {
  return (
    <td className={`px-4 py-3 whitespace-nowrap ${value ? "font-semibold" : "text-gray-300"}`} style={value ? { color } : undefined}>
      {value ? fmt(value) : "—"}
    </td>
  );
}

/** "Showing 1–10 of 23" with Prev / page numbers / Next: the footer of the Bookings table. */
function TablePagination({ page, totalPages, onChange, pageSize, count }) {
  if (count === 0) return null;
  const start = (page - 1) * pageSize;
  const rangeEnd = Math.min(start + pageSize, count);
  const nums = [1];
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) nums.push(n);
  if (totalPages > 1) nums.push(totalPages);
  const dedup = [...new Set(nums)].sort((x, y) => x - y);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
      <p className="text-xs text-gray-400">Showing {start + 1}–{rangeEnd} of {count}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
        {dedup.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - dedup[i - 1] > 1 && <span className="px-1.5 text-gray-300 text-xs">…</span>}
            <button onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${n === page ? "bg-teal-600 text-white shadow" : "border text-gray-600 hover:bg-white"}`}>{n}</button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );
}

const viewBtn = "px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors";
const TH = "px-4 py-3 text-left font-semibold whitespace-nowrap";
const THEAD = "bg-gray-50 text-gray-400 text-xs uppercase tracking-wide";

/** A window with a title, a one-line summary and a paged table of what is behind one bar / table row (penalties paid / unpaid). */
function BreakdownModal({ row, subtitle, childLabel, emptyText, fmt, onClose }) {
  const [page, setPage] = useState(1);
  const items = row.children || [];
  const p = paged(items, page, MODAL_PAGE_SIZE);
  const heads = [childLabel, "Penalties", "Paid", "Unpaid", "Total"];

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-lg text-gray-800 truncate">{row.name}</h2>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0"><IconClose /></button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="overflow-auto flex-1 px-6 py-5">
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={THEAD}>
                  <tr>{heads.map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {p.rows.length === 0 ? (
                    <tr><td colSpan={heads.length} className="text-center text-gray-400 py-12">{emptyText}</td></tr>
                  ) : p.rows.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-3 text-gray-600">{c.count || <span className="text-gray-300">—</span>}</td>
                      <MoneyCell value={c.paid} color={C_GREEN} fmt={fmt} />
                      <MoneyCell value={c.unpaid} color={C_RED} fmt={fmt} />
                      <MoneyCell value={c.total} color="#374151" fmt={fmt} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={p.no} totalPages={p.count} onChange={setPage} pageSize={MODAL_PAGE_SIZE} count={items.length} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One card: title, legend, graph and the table under it (same rows, paged together). Sorting, paging and the View window
 * belong to the card, so Customers and Vehicles share this one piece.
 *   countLabel   the plain count column after the name (Penalties / Records)
 *   totalLabel   what the row's Total means in the window's summary line
 */
function GroupCard({ title, nameLabel, countLabel, childLabel, totalLabel, series, rows, emptyText, emptyChild }) {
  const { fmt } = useCurrency();
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);
  const closeView = useCallback(() => setView(null), []);

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pg = useMemo(() => paged(sorted, page), [sorted, page]);
  const max = useMemo(() => Math.max(0, ...rows.map(barLen)), [rows]);
  useEffect(() => { setPage(1); }, [rows]);

  const th = (label, key) => <SortableTh key={key} label={label} sortKey={key} sort={sort} onSort={(s) => { setSort(s); setPage(1); }} />;

  return (
    <Card className="p-4">
      <SectionHead title={title} />
      {rows.length === 0 ? (
        <Empty>{emptyText}</Empty>
      ) : (
        <>
          <Legend items={series} />
          <SplitBars rows={pg.rows} scaleMax={max} series={series} onOpen={setView} money={fmt} />

          <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={THEAD}>
                  <tr>
                    {th(nameLabel, "name")}
                    {th(countLabel, "count")}
                    {series.map((s) => th(s.label, s.key))}
                    {th("Total", "total")}
                    <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.name}</td>
                      <td className="px-4 py-3 text-gray-600">{r.count || <span className="text-gray-300">—</span>}</td>
                      {series.map((s) => <MoneyCell key={s.key} value={r[s.key]} color={s.textColor || s.color} fmt={fmt} />)}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-teal-700 text-white text-xs font-bold whitespace-nowrap">{fmt(r.total)}</span>
                      </td>
                      <td className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">
                        <button onClick={() => setView(r)} className={viewBtn}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={pg.no} totalPages={pg.count} onChange={setPage} pageSize={PAGE_SIZE} count={rows.length} />
          </div>
        </>
      )}

      {view && (
        <BreakdownModal row={view} childLabel={childLabel} fmt={fmt} onClose={closeView} emptyText={emptyChild}
          subtitle={<>{view.count} {countLabel.toLowerCase()} · <span className="text-teal-700 font-semibold">{totalLabel} {fmt(view.total)}</span></>} />
      )}
    </Card>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────

function MaintenancePenaltiesView({ report, exportRef }) {
  const { fmt, currency, convert } = useCurrency();
  const cars = useMemo(() => report.cars || [], [report]);
  const penaltyRows = useMemo(() => report.penaltyRows || [], [report]);

  const totals = useMemo(() => ({
    paid: penaltyRows.reduce((s, p) => s + p.paid, 0),
    unpaid: penaltyRows.reduce((s, p) => s + p.pending, 0),
  }), [penaltyRows]);

  const custRows = useMemo(() => buildCustomerRows(penaltyRows), [penaltyRows]);
  const carRows = useMemo(() => buildCarRows(cars, penaltyRows), [cars, penaltyRows]);

  const nothing = cars.length === 0 && penaltyRows.length === 0;
  const carSeries = carSeriesFor(carRows);
  const scheduledTotal = report.cards?.scheduledMaintenance ?? 0;
  const collected = report.cards?.penaltiesCollected;      // undefined on an older backend: the cards are simply left out
  const pendingAll = report.cards?.penaltiesPending;
  const deposit = report.cards?.penaltiesCoveredByDeposit ?? 0;

  // ── the PDF and the Excel file: every row (no paging), plus every penalty and maintenance record behind the totals and the
  //    customer / vehicle pairs behind each "View" window ──
  const buildPdf = () => {
    const S = (label, n, accent) => ({ label, value: fmt(n), n, t: "money", accent });   // a key figure: text for the PDF, a number for Excel; accent = the card's colour
    const bySize = (rows) => rows.slice().sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const group = (title, nameLabel, countLabel, series, rows, empty) => {
      const sorted = bySize(rows);
      return [
        { type: "title", text: title, graph: `${title} Graph`, table: `${title} Table` },
        ...(sorted.length === 0 ? [{ type: "empty", text: empty }] : [
          { type: "legend", items: series },
          { type: "bars", rows: barRows(sorted, series, { text: (r) => fmt(r.total) }) },
          { type: "table", name: title,
            head: [nameLabel, countLabel, ...series.map((s) => s.label), "Total"],
            align: ["left", "right", ...series.map(() => "right"), "right"],
            body: sorted.map((r) => [r.name, count(r.count, { dash: true }), ...series.map((s) => money(r[s.key], { dash: true })), money(r.total)]) },
        ]),
      ];
    };
    // the "View" windows, flattened: one row per customer + vehicle pair
    const penaltyPairs = (rows) => bySize(rows).flatMap((r) => (r.children || []).map((c) => [r.name, c.name, count(c.count), money(c.paid), money(c.unpaid), money(c.total)]));
    return {
      subtitle: report.label,
      currency, fmt, convert,
      sections: [
        { type: "stats", items: [
          S("Total maintenance", report.cards?.totalMaintenance ?? 0, "#f97316"),
          ...(scheduledTotal > 0 ? [S("Scheduled maintenance", scheduledTotal, "#fdba74")] : []),
          S("Total penalties", totals.paid + totals.unpaid, "#0d9488"),
          S("Penalties unpaid", totals.unpaid, "#ef4444"),
          ...(collected !== undefined ? [S("Collected in period", collected, "#16a34a")] : []),
          ...(pendingAll !== undefined ? [S("Unpaid now (all periods)", pendingAll, "#f59e0b")] : []),
        ] },
        ...(nothing ? [{ type: "empty", text: `No completed maintenance or penalties in ${report.label}.` }] : [
          ...group("Customers' Penalties", "Customer", "Penalties", CUSTOMER_SERIES, custRows, `No penalties in ${report.label}.`),
          ...group("Vehicles Maintenance", "Vehicle", "Records", carSeries, carRows, cars.length === 0 ? `No completed maintenance in ${report.label}.` : "Nothing to show."),
        ]),
      ],
      sheets: nothing ? [] : [
        { name: "Penalties", desc: "Every confirmed penalty in the period, with what was paid and what is still unpaid",
          head: ["Customer", "Vehicle", "Amount", "Paid", "Unpaid"],
          body: penaltyRows.map((p) => [p.customer, p.car, money(p.amount), money(p.paid), money(p.pending)]) },
        { name: "Maintenance by vehicle", desc: "Completed maintenance per vehicle: what was recovered from penalties on the same booking, what was not, and routine maintenance with no booking",
          head: ["Vehicle", "Records", "Total cost", "Recovered", "Not recovered", "Routine (no booking)", "Scheduled"],
          body: bySize(carRows).map((c) => [c.name, count(c.count), money(c.total), money(c.recovered), money(c.absorbed), money(cars.find((x) => (x.carID || x.name) === c.id)?.unlinked || 0), money(c.scheduled)]) },
        { name: "Penalties by customer", desc: "Each customer's penalties split by vehicle: the Customers View window",
          head: ["Customer", "Vehicle", "Penalties", "Paid", "Unpaid", "Total"], body: penaltyPairs(custRows) },
        { name: "Penalties by vehicle", desc: "Each vehicle's penalties split by customer: the Vehicles View window",
          head: ["Vehicle", "Customer", "Penalties", "Paid", "Unpaid", "Total"], body: penaltyPairs(carRows) },
      ],
    };
  };
  // The Download PDF button in Reports.jsx asks for this: the current page, as the sections the PDF builder draws.
  useEffect(() => { if (exportRef) exportRef.current = buildPdf; });                  // every render, so it is always the newest
  useEffect(() => () => { if (exportRef) exportRef.current = null; }, [exportRef]);   // a tab that closes has nothing to export

  // An older backend doesn't send the per-penalty rows yet.
  if (report.penaltyRows === undefined) {
    return <Card className="p-6 text-center text-sm text-amber-600">This tab needs the updated reports.service.js on the backend (penaltyRows and cars with a jobs count).</Card>;
  }

  return (
    <div className="space-y-4">

      <Card>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 p-4">
          <StatCard title="Total maintenance" value={fmt(report.cards?.totalMaintenance ?? 0)} Icon={IconPackage} color="bg-orange-500 text-white" />
          {scheduledTotal > 0 && <StatCard title="Scheduled maintenance" value={fmt(scheduledTotal)} Icon={IconPackage} color="bg-orange-300 text-white" />}
          <StatCard title="Total penalties" value={fmt(totals.paid + totals.unpaid)} Icon={IconCreditCard} color="bg-teal-600 text-white" />
          <StatCard title="Penalties unpaid" value={fmt(totals.unpaid)} Icon={IconWarning} color="bg-red-500 text-white" />
          {collected !== undefined && <StatCard title="Collected in period" value={fmt(collected)} Icon={IconCreditCard} color="bg-green-600 text-white" />}
          {pendingAll !== undefined && <StatCard title="Unpaid now (all periods)" value={fmt(pendingAll)} Icon={IconWarning} color="bg-amber-500 text-white" />}
        </div>
        <p className="px-4 pb-3 -mt-1 text-xs text-gray-500">
          The graphs show penalties charged in this period. Collected is penalty money received in the period (cash by the day it was paid
          {deposit > 0 ? `, plus ${fmt(deposit)} covered by the held deposit, dated by the day the penalty was confirmed` : ""}). Unpaid now is everything still owed, from any period.
        </p>
      </Card>

      {nothing ? (
        <Card><Empty>No completed maintenance or penalties in {report.label}. Try another period.</Empty></Card>
      ) : (
        <>
          <GroupCard title="Customers' Penalties" nameLabel="Customer" countLabel="Penalties" childLabel="Vehicle" totalLabel="Total penalties"
            series={CUSTOMER_SERIES} rows={custRows} emptyText={`No penalties in ${report.label}.`} emptyChild="No penalties for this customer." />
          <GroupCard title="Vehicles Maintenance" nameLabel="Vehicle" countLabel="Records" childLabel="Customer" totalLabel="Maintenance cost"
            series={carSeries} rows={carRows} emptyText={cars.length === 0 ? `No completed maintenance in ${report.label}.` : "Nothing to show."} emptyChild="No penalties on this car in this period." />
        </>
      )}
    </div>
  );
}