import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Chart as ChartJS, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

// ─────────────────────────────────────────────────────────────────────────────
// RENTALS & CUSTOMERS
//
// Question this tab answers:  "Who booked, and how many times?"
//
// A graph + a table for customers, vehicles and service types. Each bar / row is split by booking status
// (Completed, Ongoing, Upcoming, Cancelled). "View" on a row (or a click on its bar) opens the cars a customer booked,
// the customers who booked a car, or the cars booked under a service type. No booking details (fees, dates,
// locations): those are on the Bookings page.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// Each row of report.bookings needs:
//   carID, carName, userID, customerName, displayStatus
//   serviceTypeID, serviceTypeName   (for the Service types graph; "Unspecified" when a booking has none)
//   modeOfDriving   "With Chauffeur" | "Self Drive"   (for the Driving dropdown, and the thin bar + columns under "All bookings")
// ─────────────────────────────────────────────────────────────────────────────

export default function RentalsCustomers({ period, year, month, week, day }) {
  const { report, loading, error } = useReport({ period, year, month, week, day });
  return (
    <ReportGate report={report} loading={loading} error={error}>
      <RentalsCustomersView report={report} />
    </ReportGate>
  );
}

// ── loads /api/reports for the selected period (kept for a minute so flipping back is instant) ──
// Loads /api/reports for the selected period. Shared by the Revenue, Rentals and Vehicles sections.
// Results are kept for a minute (module-level), so flipping between those tabs doesn't refetch.
const cache = new Map(); // query string -> { at, data }

function useReport({ period, year, month, week, day }) {
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
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/reports?${qs}`, {
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


const STATUSES = [
  { key: "completed", label: "Completed", color: "#16a34a" },
  { key: "ongoing",   label: "Ongoing",   color: "#2563eb" },
  { key: "upcoming",  label: "Upcoming",  color: "#eab308" },
  { key: "cancelled", label: "Cancelled", color: "#ef4444" },
];

// The thin bar under each row (and the two columns before Total): the same bookings split by driving mode.
const MODES = [
  { key: "chauffeur",  label: "With chauffeur", color: "#7c3aed" },
  { key: "selfDrive",  label: "Self-drive",     color: "#06b6d4" },
  { key: "unrecorded", label: "Not recorded",   color: "#d1d5db" },   // bookings with no mode saved
];

const IconGrid = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconActivity = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12h4l3 8 4-16 3 8h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconUsers = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2.5 20a6.5 6.5 0 0113 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.2A6.5 6.5 0 0121.5 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

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

// Same stat card as the Users page (flat style): colored icon square on the left, number and title on the right.
function StatCard({ title, value, Icon, color }) {
  return (
    <div className="rounded-2xl border border-transparent bg-gray-50 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500 truncate">{title}</div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 7;             // rows per page: the graph and the table under it always show the same rows
const MODAL_PAGE_SIZE = 10;      // same page size as the Bookings table

// ── grouping + sorting ──────────────────────────────────────────────────────

const zeroCounts = () => ({ completed: 0, ongoing: 0, upcoming: 0, cancelled: 0, total: 0, chauffeur: 0, selfDrive: 0, unrecorded: 0 });

function bumpMode(row, b) {
  if (b.modeOfDriving === "With Chauffeur") row.chauffeur += 1;
  else if (b.modeOfDriving === "Self Drive") row.selfDrive += 1;
  else row.unrecorded += 1;
}

/**
 * One row per customer / car / service type with a count for each status, plus `children`: the same counts split by the
 * other side (a customer's cars, or a car's customers).
 */
function groupRows(bookings, idKey, nameKey, subIdKey, subNameKey) {
  const map = new Map();
  for (const b of bookings) {
    const st = b.displayStatus;
    if (!st) continue;
    const id = b[idKey] || "unknown";
    if (!map.has(id)) map.set(id, { id, name: b[nameKey] || "Unknown", ...zeroCounts(), subs: new Map() });
    const row = map.get(id);
    row[st] += 1;
    row.total += 1;
    bumpMode(row, b);

    const sid = b[subIdKey] || "unknown";
    if (!row.subs.has(sid)) row.subs.set(sid, { id: sid, name: b[subNameKey] || "Unknown", ...zeroCounts() });
    const sub = row.subs.get(sid);
    sub[st] += 1;
    sub.total += 1;
    bumpMode(sub, b);
  }
  return [...map.values()].map(({ subs, ...row }) => ({
    ...row,
    children: [...subs.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
  }));
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

/** A round step (1, 2, 5, 10, 20 ...) so the bottom scale has about five whole-number marks. */
function niceStep(max) {
  const raw = Math.max(1, max) / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return Math.max(1, Math.round(m * pow));
}

// ── graph: one stacked bar per customer / car / service type, split by status (Chart.js) ──

/**
 * Y = the customers (or cars), X = number of bookings along the bottom. Each bar is split by status; with `showMode` a thin
 * second bar under it splits the same bookings by driving mode. Clicking a bar opens the same window as the View button of its
 * table row. The scale is taken from `scaleMax`, so bars compare across pages.
 * Chart.js draws the axes, the hover tooltip and the resizing; the numbers inside the segments come from a tiny plugin.
 */
function StatusBars({ rows, scaleMax = 0, showMode = false, onOpen }) {
  const canvasRef = useRef(null);
  const live = useRef({});
  live.current = { onOpen };   // the newest callback, so the chart is not rebuilt on every render

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const maxTotal = Math.max(1, scaleMax, ...rows.map((r) => r.total));
    const step = niceStep(maxTotal);
    const axisMax = Math.max(step, Math.ceil(maxTotal / step) * step);

    const dataset = (s, stack) => ({
      label: s.label, key: s.key, stack,
      data: rows.map((r) => (r[s.key] > 0 ? r[s.key] : null)),
      backgroundColor: s.color,
      borderSkipped: false,
      barPercentage: stack === "src" ? 0.4 : 0.9,
    });
    const datasets = [
      ...STATUSES.map((s) => dataset(s, "main")),
      ...(showMode ? MODES.map((m) => dataset(m, "src")) : []),
    ];

    // the count written inside a segment, only when the segment is wide enough to hold it
    const segLabels = {
      id: "segLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = "600 10px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        chart.data.datasets.forEach((ds, di) => {
          if (ds.stack === "src") return;
          chart.getDatasetMeta(di).data.forEach((el, i) => {
            const v = ds.data[i];
            if (v == null || Math.abs(el.x - el.base) < String(v).length * 6 + 10) return;
            ctx.fillText(String(v), (el.x + el.base) / 2, el.y);
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
            ticks: { stepSize: step, color: "#9ca3af", font: { size: 10 }, callback: (v) => (Number.isInteger(v) ? v : "") },
            title: { display: true, text: "Number of bookings", color: "#9ca3af", font: { size: 11, weight: "normal" } },
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
              label: (item) => {
                const v = rows[item.dataIndex][item.dataset.key];
                return item.dataset.stack === "src" ? `Driving · ${item.dataset.label}: ${v}` : `${item.dataset.label}: ${v}`;
              },
              footer: (items) => `Total: ${rows[items[0].dataIndex].total}`,
            },
          },
        },
      },
      plugins: [segLabels],
    });
    return () => chart.destroy();
  }, [rows, scaleMax, showMode]);

  return (
    <div className="relative w-full" style={{ height: Math.max(130, rows.length * (showMode ? 44 : 32) + 64) }}>
      <canvas ref={canvasRef} role="img" aria-label="Bookings by status" />
    </div>
  );
}

// ── tables: same format as the Bookings page and Revenue & Expense ───────────

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

/** A count cell: "—" when zero, coloured otherwise. */
function CountCell({ value, color }) {
  return (
    <td className={`px-4 py-3 whitespace-nowrap ${value ? "font-semibold" : "text-gray-300"}`} style={value ? { color } : undefined}>
      {value || "—"}
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

/** A window with a title, a one-line summary and a paged table of the rows behind one bar / table row. */
function BreakdownModal({ row, childLabel, showMode, onClose }) {
  const [page, setPage] = useState(1);
  const items = row.children || [];
  const p = paged(items, page, MODAL_PAGE_SIZE);
  const modeCols = showMode ? MODES.slice(0, 2) : [];

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const heads = [childLabel, ...STATUSES.map((s) => s.label), ...modeCols.map((m) => m.label), "Total"];
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-lg text-gray-800 truncate">{row.name}</h2>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0"><IconClose /></button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{row.total} booking{row.total === 1 ? "" : "s"}</p>
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
                    <tr><td colSpan={heads.length} className="text-center text-gray-400 py-12">Nothing to show</td></tr>
                  ) : p.rows.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{c.name}</td>
                      {STATUSES.map((s) => <CountCell key={s.key} value={c[s.key]} color={s.color} />)}
                      {modeCols.map((m) => <CountCell key={m.key} value={c[m.key]} color={m.color} />)}
                      <td className="px-4 py-3 font-semibold text-gray-700">{c.total}</td>
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
 * belong to the card, so the three cards (customers, vehicles, service types) share this one piece.
 */
function GroupCard({ title, nameLabel, childLabel, rows, showMode, legend }) {
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);
  const closeView = useCallback(() => setView(null), []);

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pg = useMemo(() => paged(sorted, page), [sorted, page]);
  const max = useMemo(() => Math.max(0, ...rows.map((r) => r.total)), [rows]);
  useEffect(() => { setPage(1); }, [rows]);

  const modeCols = showMode ? MODES.slice(0, 2) : [];   // With chauffeur, Self-drive (the gray "not recorded" part only shows in the thin bar)
  const th = (label, key) => <SortableTh key={key} label={label} sortKey={key} sort={sort} onSort={(s) => { setSort(s); setPage(1); }} />;

  return (
    <Card className="p-4">
      <SectionHead title={title} />
      <Legend items={legend} />
      <StatusBars rows={pg.rows} scaleMax={max} showMode={showMode} onOpen={setView} />

      <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={THEAD}>
              <tr>
                {th(nameLabel, "name")}
                {STATUSES.map((s) => th(s.label, s.key))}
                {modeCols.map((m) => th(m.label, m.key))}
                {th("Total", "total")}
                <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.name}</td>
                  {STATUSES.map((s) => <CountCell key={s.key} value={r[s.key]} color={s.color} />)}
                  {modeCols.map((m) => <CountCell key={m.key} value={r[m.key]} color={m.color} />)}
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-teal-700 text-white text-xs font-bold whitespace-nowrap">{r.total}</span>
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

      {view && <BreakdownModal row={view} childLabel={childLabel} showMode={showMode} onClose={closeView} />}
    </Card>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────

function RentalsCustomersView({ report }) {
  const [drive, setDrive] = useState("all");               // all | chauffeur | self : filters the whole tab
  const bookings = useMemo(() => report.bookings || [], [report]);

  // The driving filter: every number, bar and table below only counts the bookings that match it.
  const scoped = useMemo(() => {
    if (drive === "chauffeur") return bookings.filter((b) => b.modeOfDriving === "With Chauffeur");
    if (drive === "self") return bookings.filter((b) => b.modeOfDriving === "Self Drive");
    return bookings;
  }, [bookings, drive]);

  const counts = useMemo(() => {
    const c = { completed: 0, ongoing: 0, upcoming: 0, cancelled: 0 };
    scoped.forEach((b) => { if (b.displayStatus) c[b.displayStatus] += 1; });
    return c;
  }, [scoped]);
  const totalBookings = STATUSES.reduce((sum, x) => sum + counts[x.key], 0);
  // customers with at least one booking that was not cancelled
  const activeCustomers = useMemo(() => new Set(scoped.filter((b) => b.displayStatus && b.displayStatus !== "cancelled" && b.userID).map((b) => b.userID)).size, [scoped]);

  const custRows = useMemo(() => groupRows(scoped, "userID", "customerName", "carID", "carName"), [scoped]);
  const fleetRows = useMemo(() => groupRows(scoped, "carID", "carName", "userID", "customerName"), [scoped]);
  const svcRows = useMemo(() => groupRows(scoped, "serviceTypeName", "serviceTypeName", "carID", "carName"), [scoped]);
  const svcSupported = bookings.length === 0 || bookings.some((b) => b.serviceTypeName !== undefined);   // false = backend not updated yet

  // How many bookings come with a chauffeur and how many are self-drive.
  const driving = useMemo(() => {
    if (!bookings.some((b) => b.modeOfDriving !== undefined)) return null;     // backend not updated yet
    const visible = bookings.filter((b) => b.displayStatus);
    const chauffeur = visible.filter((b) => b.modeOfDriving === "With Chauffeur").length;
    const selfDrive = visible.filter((b) => b.modeOfDriving === "Self Drive").length;
    return { all: visible.length, chauffeur, selfDrive, other: visible.length - chauffeur - selfDrive };
  }, [bookings]);

  // "All bookings" shows both modes side by side (thin bar + columns); picking one mode narrows the whole tab instead.
  const showMode = drive === "all" && driving !== null;
  const legend = [...STATUSES, ...(showMode ? MODES.filter((m) => m.key !== "unrecorded" || driving.other > 0) : [])];

  // Booking rows from an older backend have no displayStatus / names yet.
  if (bookings.length > 0 && bookings.every((b) => b.displayStatus === undefined)) {
    return <Card className="p-6 text-center text-sm text-amber-600">This tab needs the updated reports.service.js on the backend (booking rows with car name, customer name and status).</Card>;
  }

  return (
    <div className="space-y-4">

      {/* One white group, same layout as the Users page: stat cards on top, a divider, then the filter row. */}
      <Card>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 p-4">
          <StatCard title="Active Customers" value={activeCustomers} Icon={IconUsers} color="bg-teal-600 text-white" />
          <StatCard title="Total Bookings" value={totalBookings} Icon={IconGrid} color="bg-green-600 text-white" />
          <StatCard title="Upcoming Bookings" value={counts.upcoming} Icon={IconClock} color="bg-yellow-500 text-white" />
          <StatCard title="Ongoing Bookings" value={counts.ongoing} Icon={IconActivity} color="bg-blue-600 text-white" />
        </div>

        {/* Driving dropdown. "All bookings" keeps both modes visible (thin bar under each row + two columns);
            "With chauffeur" / "Self-drive" narrow everything on this tab to that mode. */}
        <div className="border-t px-4 py-3">
          {driving ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              <label htmlFor="driving-filter" className="text-gray-400 font-semibold">Driving</label>
              <select
                id="driving-filter"
                value={drive}
                onChange={(e) => setDrive(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="all">All bookings ({driving.all})</option>
                <option value="chauffeur">With chauffeur only ({driving.chauffeur})</option>
                <option value="self">Self-drive only ({driving.selfDrive})</option>
              </select>
              {!showMode && driving.other > 0 && <span className="text-gray-400">{driving.other} not recorded (shown under All bookings only)</span>}
            </div>
          ) : (
            <p className="text-xs text-amber-600">The driving dropdown needs the updated reports.service.js (booking rows with modeOfDriving).</p>
          )}
        </div>
      </Card>

      {totalBookings === 0 ? (
        <Card><Empty>{drive === "all" ? `No bookings started in ${report.label}. Try another period.` : `No ${drive === "chauffeur" ? "chauffeur" : "self-drive"} bookings in ${report.label}. Switch Driving to All bookings to see the rest.`}</Empty></Card>
      ) : (
        <>
          <GroupCard title="Customers" nameLabel="Customer" childLabel="Vehicle" rows={custRows} showMode={showMode} legend={legend} />
          <GroupCard title="Vehicles" nameLabel="Vehicle" childLabel="Customer" rows={fleetRows} showMode={showMode} legend={legend} />
          {svcSupported ? (
            <GroupCard title="Service types" nameLabel="Service type" childLabel="Vehicle" rows={svcRows} showMode={showMode} legend={legend} />
          ) : (
            <Card className="p-4">
              <SectionHead title="Service types" />
              <p className="text-xs text-amber-600 text-center">This graph needs the updated reports.service.js (booking rows with serviceTypeName).</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}