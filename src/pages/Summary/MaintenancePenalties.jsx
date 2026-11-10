import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../context/CurrencyContext";
import { barRows } from "../../utils/reportTabPdf";
import { money, when } from "../../utils/reportCells";
import { Chart as ChartJS, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE & PENALTIES
//
// Questions this tab answers:  "What did maintenance cost?"  and  "Which penalties were charged, and did they get paid?"
//
// Stat cards on top, then two sections, each a graph with its list under it (10 per page, sortable, searchable). A click on a
// bar searches the list for that customer / vehicle. Each list ends with a Total row, and each row has a View button that
// opens its detail window:
//     Penalties     one row per Confirmed penalty charged in the period: customer, booking, amount, how much was received,
//                   how much a held deposit / discount credit covered (no money moved), and what is still unpaid.
//     Maintenance   one row per job (Completed or Scheduled in the period): its type, status, the booking and customer it is
//                   linked to (routine jobs have none), and how much penalty money on that booking covered it.
//
// Only Confirmed penalties count. "Received in period" is penalty money that came in during the period: the same figure as
// Penalties under Money in on Payments & Transactions. "Covered" is settled from the held deposit or discount credit, so it
// never appears under Money in. "Unpaid now" is everything still owed on any Confirmed penalty, from any period.
// "Covered by penalties" on a repair = what was paid on penalties of the SAME BOOKING, capped at the repair's cost; a repair
// with no booking (routine maintenance) is covered by nothing and is absorbed by the business. Scheduled jobs are expected
// cost, not spent, so they are shown apart and never added to the cost.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// Needs from /api/reports/maintenance-penalties:
//   cards        { totalMaintenance, scheduledMaintenance, maintenanceAbsorbed, penaltiesCharged, penaltiesReceived,
//                  penaltiesCoveredByDeposit, penaltiesCoveredByCredit, penaltiesPending, penaltiesUnpaidAll }
//   penaltyRows  [{ penaltyID, bookingID, maintenanceID, customer, car, createdAt, reason, lineItems, amount, paid, received,
//                  coveredByDeposit, coveredByCredit, pending, paidStatus, lastMethod, lastPaidAt, reference }]
//   jobs         [{ id, bookingID, customer, car, date, basis, status, services, amount, covered, absorbed, penalties[] }]
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


// ── small pieces ────────────────────────────────────────────────────────────

// ── small pieces ────────────────────────────────────────────────────────────

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>
);

// Same stat card as the Rentals tab: colored icon square on the left, number and title on the right.
function StatCard({ title, value, Icon, color, note }) {
  return (
    <div className="rounded-2xl border border-transparent bg-gray-50 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-gray-800 truncate" title={String(value)}>{value}</div>
        <div className="text-xs text-gray-500 truncate" title={title}>{title}</div>
        {note && <div className="text-[11px] text-gray-400 truncate mt-0.5" title={note}>{note}</div>}
      </div>
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
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${n === page ? "bg-arl-primary text-white shadow" : "border text-gray-600 hover:bg-white"}`}>{n}</button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );
}

const viewBtn = "px-3.5 py-1 rounded-lg text-xs font-semibold bg-arl-primary text-white hover:bg-[#16526a] transition-colors";
const THEAD = "bg-gray-50 text-gray-400 text-xs uppercase tracking-wide";

// ── colours, paging, sorting ────────────────────────────────────────────────

const C_GREEN = "#16a34a", C_RED = "#ef4444", C_AMBER = "#d97706", C_ORANGE = "#f97316", C_PURPLE = "#7c3aed";
const PAGE_SIZE = 10;            // rows per page, same as the Bookings table
const MODAL_PAGE_SIZE = 10;

const dayText = (iso) => (iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "—");

function paged(list, p, size = PAGE_SIZE) {
  const countPages = Math.max(1, Math.ceil(list.length / size));
  const no = Math.min(Math.max(1, p), countPages);
  return { rows: list.slice((no - 1) * size, no * size), no, count: countPages };
}

/** Sorts a copy of `rows` by `sort.key` (numbers high to low, text A to Z, dates by their ISO text). */
function sortRows(rows, { key, dir }) {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const x = a[key], y = b[key];
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x ?? "").localeCompare(String(y ?? "")) * sign;
  });
}

const sumOf = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

// ── graphs: one stacked bar per customer / vehicle (Chart.js) ───────────────

const PEN_SERIES = [
  { key: "received", label: "Received",           color: C_GREEN },
  { key: "covered",  label: "Covered by deposit / credit", color: C_PURPLE },
  { key: "unpaid",   label: "Unpaid",             color: C_RED },
];
const JOB_SERIES = [
  { key: "covered",  label: "Covered by penalties",   color: C_GREEN },
  { key: "absorbed", label: "Absorbed by business",   color: C_RED },
];
// maintenance that is still Scheduled: striped, on the end of the bar, never part of the cost
const JOB_SCHEDULED = { key: "scheduled", label: "Scheduled (not done yet)", color: "#fed7aa", textColor: C_ORANGE, hatch: C_ORANGE };
const jobSeriesFor = (rows) => (rows.some((r) => r.scheduled > 0) ? [...JOB_SERIES, JOB_SCHEDULED] : JOB_SERIES);
const GRAPH_PAGE = 7;            // bars per page, same as the other tabs

/** One bar per customer: what they were charged, split into received / covered / unpaid. */
function penaltyBars(list) {
  const map = new Map();
  list.forEach((p) => {
    const id = p.userID || "unknown";
    const r = map.get(id) || { id, name: p.customer || "Unknown", received: 0, covered: 0, unpaid: 0, total: 0, count: 0 };
    r.received += p.received; r.covered += p.coveredByDeposit + p.coveredByCredit; r.unpaid += p.pending; r.total += p.amount; r.count += 1;
    map.set(id, r);
  });
  return [...map.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** One bar per vehicle: its maintenance cost, split into covered by penalties / absorbed, with scheduled jobs striped at the end. */
function jobBars(list) {
  const map = new Map();
  list.forEach((j) => {
    const id = j.carID || j.car || "unknown";
    const r = map.get(id) || { id, name: j.car || "Unknown Vehicle", covered: 0, absorbed: 0, scheduled: 0, total: 0, count: 0 };
    if (j.status === "Completed") { r.covered += j.covered; r.absorbed += j.absorbed; r.total += j.amount; r.count += 1; }
    else r.scheduled += j.amount;
    map.set(id, r);
  });
  return [...map.values()].filter((r) => r.total + r.scheduled > 0).sort((a, b) => (b.total + b.scheduled) - (a.total + a.scheduled) || a.name.localeCompare(b.name));
}

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

/** 1250 -> "1.3k", 80 -> "80": short enough to sit inside a bar or under the scale. */
function compact(n) {
  const v = Math.abs(n);
  if (v >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(+n.toFixed(v < 10 ? 1 : 0));
}

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

// ── small pieces for this tab ───────────────────────────────────────────────

const TAG_TONE = {
  "Paid": "bg-green-50 text-green-700 border-green-200",
  "Partly paid": "bg-amber-50 text-amber-700 border-amber-200",
  "Unpaid": "bg-red-50 text-red-700 border-red-200",
  "Completed": "bg-green-50 text-green-700 border-green-200",
  "Scheduled": "bg-orange-50 text-orange-700 border-orange-200",
};

function Tag({ label }) {
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${TAG_TONE[label] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{label}</span>;
}

const inputCls = "px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-200";

/** A plain (not sortable) column heading. */
const Th = ({ children, right }) => <th className={`px-4 py-3 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{children}</th>;

/** A text cell that shows a dash when empty. */
const Txt = ({ children, mono, muted }) => (
  <td className={`px-4 py-3 whitespace-nowrap ${mono ? "font-mono text-xs" : ""} ${muted ? "text-gray-500" : "text-gray-700"}`}>
    {children || <span className="text-gray-300">—</span>}
  </td>
);

/** A window over the page: title, a one-line summary and the content. Escape or a click outside closes it. */
function Modal({ title, subtitle, onClose, children }) {
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
            <h2 className="font-bold text-lg text-gray-800 truncate">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0"><IconClose /></button>
          </div>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="overflow-auto flex-1 px-6 py-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** A row of small figure boxes inside a window. */
function Figures({ items, fmt }) {
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.filter(Boolean).map((f) => (
        <div key={f.label} className="rounded-xl bg-gray-50 px-3 py-2.5">
          <div className="text-[11px] text-gray-500">{f.label}</div>
          <div className="text-base font-bold" style={{ color: f.value ? f.color : "#9ca3af" }}>{fmt(f.value || 0)}</div>
        </div>
      ))}
    </div>
  );
}

/** "label: value" lines inside a window. */
function Facts({ rows }) {
  return (
    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 text-sm">
      {rows.filter(Boolean).map((r) => (
        <div key={r.label} className="flex items-start gap-4 px-4 py-2.5">
          <div className="w-36 shrink-0 text-gray-400 text-xs uppercase tracking-wide pt-0.5">{r.label}</div>
          <div className="text-gray-700 min-w-0 break-words">{r.value || <span className="text-gray-300">—</span>}</div>
        </div>
      ))}
    </div>
  );
}

function OpenBookingButton({ id, onOpen }) {
  if (!id) return null;
  return <button onClick={() => onOpen(id)} className={`${viewBtn} ml-2 align-middle`}>Open booking</button>;
}

// ── penalty window ──────────────────────────────────────────────────────────

function PenaltyModal({ p, fmt, onClose, onOpen }) {
  const covered = p.coveredByDeposit + p.coveredByCredit;
  const how = [
    p.received > 0 ? `${fmt(p.received)} received${p.lastMethod ? ` by ${p.lastMethod}` : ""}${p.lastPaidAt ? ` on ${dayText(p.lastPaidAt)}` : ""}` : null,
    p.coveredByDeposit > 0 ? `${fmt(p.coveredByDeposit)} covered by the held deposit` : null,
    p.coveredByCredit > 0 ? `${fmt(p.coveredByCredit)} covered by the held discount credit` : null,
  ].filter(Boolean);
  return (
    <Modal title={p.customer} onClose={onClose}
      subtitle={<>Penalty charged {dayText(p.createdAt)} · <Tag label={p.paidStatus} /></>}>
      <Figures fmt={fmt} items={[
        { label: "Charged", value: p.amount, color: "#374151" },
        { label: "Received", value: p.received, color: C_GREEN },
        { label: "Covered by deposit", value: p.coveredByDeposit, color: C_PURPLE },
        { label: "Covered by discount credit", value: p.coveredByCredit, color: C_PURPLE },
        { label: "Unpaid", value: p.pending, color: C_RED },
      ]} />
      <Facts rows={[
        { label: "Booking", value: p.bookingID ? <><span className="font-mono text-xs">{p.bookingID}</span><OpenBookingButton id={p.bookingID} onOpen={onOpen} /></> : null },
        { label: "Vehicle", value: p.car },
        { label: "Reason", value: p.reason },
        { label: "How it was paid", value: how.length ? how.join(" · ") : (p.pending > 0 ? "Nothing paid yet" : null) },
        p.reference ? { label: "Reference", value: p.reference } : null,
        covered > 0 ? { label: "Note", value: "Covered amounts moved no money: they were taken from what the customer already held with you, so they are not under Money in." } : null,
        p.maintenanceID ? { label: "Linked repair", value: p.maintenanceID } : null,
      ]} />
      {p.lineItems?.length > 0 && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className={THEAD}><tr><Th>Charge</Th><Th right>Amount</Th></tr></thead>
            <tbody>
              {p.lineItems.map((li, i) => (
                <tr key={i} className="border-t">
                  <Txt>{li.description}</Txt>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700 whitespace-nowrap">{fmt(li.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ── maintenance window ──────────────────────────────────────────────────────

function JobModal({ j, fmt, onClose, onOpen }) {
  const [page, setPage] = useState(1);
  const pens = j.penalties || [];
  const pg = paged(pens, page, MODAL_PAGE_SIZE);
  const done = j.status === "Completed";
  return (
    <Modal title={j.car} onClose={onClose}
      subtitle={<>{j.basis || "Maintenance"} · {dayText(j.date)} · <Tag label={j.status} /></>}>
      <Figures fmt={fmt} items={[
        { label: done ? "Cost" : "Expected cost", value: j.amount, color: done ? C_ORANGE : C_AMBER },
        done ? { label: "Covered by penalties", value: j.covered, color: C_GREEN } : null,
        done ? { label: "Absorbed by business", value: j.absorbed, color: C_RED } : null,
      ]} />
      <Facts rows={[
        { label: "Work done", value: j.services },
        { label: "Booking", value: j.bookingID ? <><span className="font-mono text-xs">{j.bookingID}</span><OpenBookingButton id={j.bookingID} onOpen={onOpen} /></> : "Routine maintenance, not linked to a booking" },
        j.bookingID ? { label: "Customer", value: j.customer } : null,
        !done ? { label: "Note", value: "Not done yet. It is expected cost and is not counted in the maintenance total." } : null,
      ]} />
      {j.bookingID && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50">Penalties charged on this booking</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={THEAD}>
                <tr><Th>Charged</Th><Th right>Amount</Th><Th right>Received</Th><Th right>Covered</Th><Th right>Unpaid</Th></tr>
              </thead>
              <tbody>
                {pg.rows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-10">No penalty was charged on this booking, so the business absorbs the cost.</td></tr>
                ) : pg.rows.map((p) => (
                  <tr key={p.penaltyID} className="border-t hover:bg-gray-50 transition-colors">
                    <Txt>{dayText(p.createdAt)}</Txt>
                    <MoneyCell value={p.amount} color="#374151" fmt={fmt} />
                    <MoneyCell value={p.received} color={C_GREEN} fmt={fmt} />
                    <MoneyCell value={p.deposit + p.credit} color={C_PURPLE} fmt={fmt} />
                    <MoneyCell value={p.pending} color={C_RED} fmt={fmt} />
                  </tr>
                ))}
              </tbody>
              {pens.length > 0 && (
                <tfoot className="border-t border-gray-200 bg-gray-50/70">
                  <tr className="font-bold text-gray-700">
                    <td className="px-4 py-3 text-gray-800">Total</td>
                    {["amount", "received"].map((k) => <td key={k} className="px-4 py-3 whitespace-nowrap">{fmt(sumOf(pens, k))}</td>)}
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(sumOf(pens, "deposit") + sumOf(pens, "credit"))}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(sumOf(pens, "pending"))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <TablePagination page={pg.no} totalPages={pg.count} onChange={setPage} pageSize={MODAL_PAGE_SIZE} count={pens.length} />
        </div>
      )}
    </Modal>
  );
}

// ── the penalties list ──────────────────────────────────────────────────────

function PenaltiesList({ rows, fmt, label, onView }) {
  const [sort, setSort] = useState({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows
      .map((p) => ({ ...p, covered: p.coveredByDeposit + p.coveredByCredit }))
      .filter((p) => (status === "all" || p.paidStatus === status)
        && (!needle || [p.customer, p.bookingID, p.car, p.penaltyID, p.reason].some((v) => String(v || "").toLowerCase().includes(needle))));
    return sortRows(list, sort);
  }, [rows, q, status, sort]);
  const pg = paged(shown, page);
  const onSort = (s) => { setSort(s); setPage(1); };
  const bars = useMemo(() => penaltyBars(shown), [shown]);
  const [gPage, setGPage] = useState(1);
  useEffect(() => { setGPage(1); }, [q, status]);
  const gp = paged(bars, gPage, GRAPH_PAGE);
  const heads = [["Customer", "customer"], ["Booking", "bookingID"], ["Vehicle", "car"], ["Charged", "createdAt"], ["Amount", "amount"], ["Received", "received"], ["Covered", "covered"], ["Unpaid", "pending"], ["Status", "paidStatus"]];

  return (
    <Card className="p-4">
      <SectionHead title="Penalties" />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search customer, booking, vehicle or reason" className={`${inputCls} flex-1 min-w-[220px]`} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCls}>
          <option value="all">All statuses</option>
          <option value="Paid">Paid</option>
          <option value="Partly paid">Partly paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
      </div>
      {rows.length > 0 && bars.length > 0 && (
        <div className="mb-4">
          <Legend items={PEN_SERIES} />
          <SplitBars rows={gp.rows} scaleMax={Math.max(0, ...bars.map((r) => r.total))} series={PEN_SERIES} onOpen={(r) => { setQ(r.name); setPage(1); }} money={fmt} />
          {bars.length > GRAPH_PAGE && (
            <div className="mt-2 rounded-xl border border-gray-100 overflow-hidden">
              <TablePagination page={gp.no} totalPages={gp.count} onChange={setGPage} pageSize={GRAPH_PAGE} count={bars.length} />
            </div>
          )}
        </div>
      )}
      {rows.length === 0 ? <Empty>No penalties were charged in {label}.</Empty> : (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={THEAD}>
                <tr>
                  {heads.map(([h, k]) => <SortableTh key={k} label={h} sortKey={k} sort={sort} onSort={onSort} />)}
                  <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.length === 0 ? (
                  <tr><td colSpan={heads.length + 1} className="text-center text-gray-400 py-12">No penalty matches this search.</td></tr>
                ) : pg.rows.map((p) => (
                  <tr key={p.penaltyID} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{p.customer}</td>
                    <Txt mono muted>{p.bookingID}</Txt>
                    <Txt>{p.car}</Txt>
                    <Txt muted>{dayText(p.createdAt)}</Txt>
                    <MoneyCell value={p.amount} color="#374151" fmt={fmt} />
                    <MoneyCell value={p.received} color={C_GREEN} fmt={fmt} />
                    <MoneyCell value={p.covered} color={C_PURPLE} fmt={fmt} />
                    <MoneyCell value={p.pending} color={C_RED} fmt={fmt} />
                    <td className="px-4 py-3"><Tag label={p.paidStatus} /></td>
                    <td className="pl-4 pr-8 py-3 text-right"><button onClick={() => onView(p)} className={viewBtn}>View</button></td>
                  </tr>
                ))}
              </tbody>
              {shown.length > 0 && (
                <tfoot className="border-t border-gray-200 bg-gray-50/70">
                  <tr className="font-bold text-gray-700">
                    <td className="px-4 py-3 text-gray-800">Total</td>
                    <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap" colSpan={3}>{shown.length} penalt{shown.length === 1 ? "y" : "ies"}</td>
                    {["amount", "received", "covered", "pending"].map((k) => <td key={k} className="px-4 py-3 whitespace-nowrap">{fmt(sumOf(shown, k))}</td>)}
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <TablePagination page={pg.no} totalPages={pg.count} onChange={setPage} pageSize={PAGE_SIZE} count={shown.length} />
        </div>
      )}
    </Card>
  );
}

// ── the maintenance list ────────────────────────────────────────────────────

function JobsList({ rows, fmt, label, onView }) {
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [link, setLink] = useState("all");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows
      .map((j) => ({
        ...j,
        type: [j.basis, j.services].filter(Boolean).join(" · "),
        done: j.status === "Completed" ? j.amount : 0,
        expected: j.status === "Scheduled" ? j.amount : 0,
        bookingKey: j.bookingID || "",
      }))
      .filter((j) => (status === "all" || j.status === status)
        && (link === "all" || (link === "booking" ? !!j.bookingID : !j.bookingID))
        && (!needle || [j.car, j.type, j.bookingID, j.customer].some((v) => String(v || "").toLowerCase().includes(needle))));
    return sortRows(list, sort);
  }, [rows, q, status, link, sort]);
  const pg = paged(shown, page);
  const onSort = (s) => { setSort(s); setPage(1); };
  const bars = useMemo(() => jobBars(shown), [shown]);
  const barSeries = jobSeriesFor(bars);
  const [gPage, setGPage] = useState(1);
  useEffect(() => { setGPage(1); }, [q, status, link]);
  const gp = paged(bars, gPage, GRAPH_PAGE);
  const heads = [["Date", "date"], ["Vehicle", "car"], ["Type", "type"], ["Status", "status"], ["Booking", "bookingKey"], ["Customer", "customer"], ["Cost", "done"], ["Scheduled", "expected"], ["Covered", "covered"], ["Absorbed", "absorbed"]];
  const completed = shown.filter((j) => j.status === "Completed");

  return (
    <Card className="p-4">
      <SectionHead title="Maintenance" />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search vehicle, type, booking or customer" className={`${inputCls} flex-1 min-w-[220px]`} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCls}>
          <option value="all">All statuses</option>
          <option value="Completed">Completed</option>
          <option value="Scheduled">Scheduled</option>
        </select>
        <select value={link} onChange={(e) => { setLink(e.target.value); setPage(1); }} className={inputCls}>
          <option value="all">With or without a booking</option>
          <option value="booking">Linked to a booking</option>
          <option value="routine">Routine (no booking)</option>
        </select>
      </div>
      {rows.length > 0 && bars.length > 0 && (
        <div className="mb-4">
          <Legend items={barSeries} />
          <SplitBars rows={gp.rows} scaleMax={Math.max(0, ...bars.map(barLen))} series={barSeries} onOpen={(r) => { setQ(r.name); setPage(1); }} money={fmt} />
          {bars.length > GRAPH_PAGE && (
            <div className="mt-2 rounded-xl border border-gray-100 overflow-hidden">
              <TablePagination page={gp.no} totalPages={gp.count} onChange={setGPage} pageSize={GRAPH_PAGE} count={bars.length} />
            </div>
          )}
        </div>
      )}
      {rows.length === 0 ? <Empty>No maintenance was completed or scheduled in {label}.</Empty> : (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={THEAD}>
                <tr>
                  {heads.map(([h, k]) => <SortableTh key={k} label={h} sortKey={k} sort={sort} onSort={onSort} />)}
                  <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.length === 0 ? (
                  <tr><td colSpan={heads.length + 1} className="text-center text-gray-400 py-12">No maintenance matches this search.</td></tr>
                ) : pg.rows.map((j) => (
                  <tr key={j.id} className="border-t hover:bg-gray-50 transition-colors">
                    <Txt muted>{dayText(j.date)}</Txt>
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{j.car}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate" title={j.type}>{j.type || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3"><Tag label={j.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">{j.bookingID ? <span className="font-mono text-xs text-gray-500">{j.bookingID}</span> : <span className="text-xs text-gray-400">Routine</span>}</td>
                    <Txt>{j.customer}</Txt>
                    <MoneyCell value={j.done} color={C_ORANGE} fmt={fmt} />
                    <MoneyCell value={j.expected} color={C_AMBER} fmt={fmt} />
                    {j.status === "Completed" ? <MoneyCell value={j.covered} color={C_GREEN} fmt={fmt} /> : <td className="px-4 py-3 text-gray-300">—</td>}
                    {j.status === "Completed" ? <MoneyCell value={j.absorbed} color={C_RED} fmt={fmt} /> : <td className="px-4 py-3 text-gray-300">—</td>}
                    <td className="pl-4 pr-8 py-3 text-right"><button onClick={() => onView(j)} className={viewBtn}>View</button></td>
                  </tr>
                ))}
              </tbody>
              {shown.length > 0 && (
                <tfoot className="border-t border-gray-200 bg-gray-50/70">
                  <tr className="font-bold text-gray-700">
                    <td className="px-4 py-3 text-gray-800">Total</td>
                    <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap" colSpan={5}>{completed.length} completed · {shown.length - completed.length} scheduled</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(sumOf(shown, "done"))}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmt(sumOf(shown, "expected"))}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(sumOf(completed, "covered"))}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(sumOf(completed, "absorbed"))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <TablePagination page={pg.no} totalPages={pg.count} onChange={setPage} pageSize={PAGE_SIZE} count={shown.length} />
        </div>
      )}
    </Card>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────

function MaintenancePenaltiesView({ report, exportRef }) {
  const { fmt, currency, convert } = useCurrency();
  const navigate = useNavigate();
  const penaltyRows = useMemo(() => report.penaltyRows || [], [report]);
  const jobs = useMemo(() => report.jobs || [], [report]);
  const [viewPenalty, setViewPenalty] = useState(null);
  const [viewJob, setViewJob] = useState(null);
  const closePenalty = useCallback(() => setViewPenalty(null), []);
  const closeJob = useCallback(() => setViewJob(null), []);
  const openBooking = (id) => navigate(`/bookings?open=${encodeURIComponent(id)}`);

  const c = report.cards || {};
  const charged = c.penaltiesCharged ?? sumOf(penaltyRows, "amount");
  const byDeposit = c.penaltiesCoveredByDeposit ?? 0;
  const byCredit = c.penaltiesCoveredByCredit ?? 0;
  const covered = byDeposit + byCredit;
  const unpaidNow = c.penaltiesUnpaidAll ?? sumOf(penaltyRows, "pending");   // older backend: this period's unpaid
  const nothing = jobs.length === 0 && penaltyRows.length === 0;

  // ── the PDF and the Excel file: every row (no paging, no filters) with a Total row on each table ──
  const buildPdf = () => {
    const S = (label, n, accent) => ({ label, value: fmt(n), n, t: "money", accent });   // a key figure: text for the PDF, a number for Excel; accent = the card's colour
    const cov = (p) => p.coveredByDeposit + p.coveredByCredit;
    const done = jobs.filter((j) => j.status === "Completed");
    const penBody = penaltyRows.map((p) => [p.customer, p.bookingID || "—", p.car, when(p.createdAt), money(p.amount), money(p.received), money(cov(p)), money(p.pending), p.paidStatus]);
    const jobBody = jobs.map((j) => [when(j.date), j.car, [j.basis, j.services].filter(Boolean).join(" · ") || "—", j.status, j.bookingID || "Routine", j.customer || "—",
      money(j.status === "Completed" ? j.amount : 0), money(j.status === "Scheduled" ? j.amount : 0), money(j.status === "Completed" ? j.covered : 0), money(j.status === "Completed" ? j.absorbed : 0)]);
    return {
      subtitle: report.label,
      currency, fmt, convert,
      sections: [
        { type: "stats", items: [
          S("Total maintenance", c.totalMaintenance ?? 0, "#f97316"),
          S("Total penalties", charged, "#0d9488"),
          S("Covered penalties", covered, "#7c3aed"),
          S("Unpaid now (all periods)", unpaidNow, "#f59e0b"),
        ] },
        ...(nothing ? [{ type: "empty", text: `No maintenance or penalties in ${report.label}.` }] : [
          { type: "title", text: "Penalties", graph: "Penalties Graph", table: "Penalties Table" },
          ...(penaltyRows.length === 0 ? [{ type: "empty", text: `No penalties were charged in ${report.label}.` }] : [
            { type: "legend", items: PEN_SERIES },
            { type: "bars", rows: barRows(penaltyBars(penaltyRows), PEN_SERIES, { text: (r) => fmt(r.total) }) },
            { type: "table", name: "Penalties",
              head: ["Customer", "Booking", "Vehicle", "Charged", "Amount", "Received", "Covered", "Unpaid", "Status"],
              align: ["left", "left", "left", "left", "right", "right", "right", "right", "left"],
              body: penBody,
              foot: ["Total", `${penaltyRows.length} penalties`, "", "", money(sumOf(penaltyRows, "amount")), money(sumOf(penaltyRows, "received")), money(penaltyRows.reduce((s, p) => s + cov(p), 0)), money(sumOf(penaltyRows, "pending")), ""] },
          ]),
          { type: "title", text: "Maintenance", graph: "Maintenance Graph", table: "Maintenance Table" },
          ...(jobs.length === 0 ? [{ type: "empty", text: `No maintenance was completed or scheduled in ${report.label}.` }] : [
            { type: "legend", items: jobSeriesFor(jobBars(jobs)) },
            { type: "bars", rows: barRows(jobBars(jobs), jobSeriesFor(jobBars(jobs)), { text: (r) => fmt(r.total) }) },
            { type: "note", text: "Scheduled maintenance is expected cost, not spent, so it is shown apart and is not part of the Cost total." },
            { type: "table", name: "Maintenance",
              head: ["Date", "Vehicle", "Type", "Status", "Booking", "Customer", "Cost", "Scheduled", "Covered", "Absorbed"],
              align: ["left", "left", "left", "left", "left", "left", "right", "right", "right", "right"],
              body: jobBody,
              foot: ["Total", `${done.length} completed`, "", "", "", "", money(sumOf(done, "amount")), money(jobs.filter((j) => j.status === "Scheduled").reduce((s, j) => s + j.amount, 0)), money(sumOf(done, "covered")), money(sumOf(done, "absorbed"))] },
          ]),
        ]),
      ],
      sheets: nothing ? [] : [
        { name: "Penalty details", desc: "Every confirmed penalty charged in the period, with how it was settled: money received, covered by the held deposit or discount credit, and what is still unpaid",
          head: ["Penalty ID", "Customer", "Booking ID", "Vehicle", "Charged", "Reason", "Amount", "Received", "Covered by deposit", "Covered by credit", "Unpaid", "Status", "Last method", "Last paid", "Reference"],
          body: penaltyRows.map((p) => [p.penaltyID, p.customer, p.bookingID || "", p.car, when(p.createdAt), p.reason || "", money(p.amount), money(p.received), money(p.coveredByDeposit), money(p.coveredByCredit), money(p.pending), p.paidStatus, p.lastMethod || "", p.lastPaidAt ? when(p.lastPaidAt) : "", p.reference || ""]) },
        { name: "Maintenance details", desc: "Every maintenance job completed or scheduled in the period, with its booking and customer (routine jobs have none) and how much penalty money on that booking covered it",
          head: ["Date", "Vehicle", "Basis", "Work done", "Status", "Booking ID", "Customer", "Cost", "Covered by penalties", "Absorbed by business"],
          body: jobs.map((j) => [when(j.date), j.car, j.basis || "", j.services || "", j.status, j.bookingID || "", j.customer || "", money(j.amount), j.status === "Completed" ? money(j.covered) : "", j.status === "Completed" ? money(j.absorbed) : ""]) },
        { name: "Penalties on repairs", desc: "The penalties charged on the booking each repair is linked to: what was charged, received, covered and is still unpaid",
          head: ["Vehicle", "Booking ID", "Repair date", "Penalty charged", "Amount", "Received", "Covered", "Unpaid"],
          body: jobs.flatMap((j) => (j.penalties || []).map((p) => [j.car, j.bookingID || "", when(j.date), when(p.createdAt), money(p.amount), money(p.received), money(p.deposit + p.credit), money(p.pending)])) },
      ],
    };
  };
  // The Download PDF button in Reports.jsx asks for this: the current page, as the sections the PDF builder draws.
  useEffect(() => { if (exportRef) exportRef.current = buildPdf; });                  // every render, so it is always the newest
  useEffect(() => () => { if (exportRef) exportRef.current = null; }, [exportRef]);   // a tab that closes has nothing to export

  // An older backend doesn't send the per-penalty and per-job rows yet.
  if (report.penaltyRows === undefined || report.jobs === undefined) {
    return <Card className="p-6 text-center text-sm text-amber-600">This tab needs the updated reports.service.js on the backend (penaltyRows and jobs).</Card>;
  }

  return (
    <div className="space-y-4">

      <Card>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 p-4">
          <StatCard title="Total maintenance" value={fmt(c.totalMaintenance ?? 0)} Icon={IconPackage} color="bg-orange-500 text-white" />
          <StatCard title="Total penalties" value={fmt(charged)} Icon={IconCreditCard} color="bg-teal-600 text-white" />
          <StatCard title="Covered penalties" value={fmt(covered)} Icon={IconCreditCard} color="bg-purple-600 text-white" />
          <StatCard title="Unpaid now (all periods)" value={fmt(unpaidNow)} Icon={IconWarning} color="bg-amber-500 text-white" />
        </div>
      </Card>

      {nothing ? (
        <Card><Empty>No maintenance or penalties in {report.label}. Try another period.</Empty></Card>
      ) : (
        <>
          <PenaltiesList rows={penaltyRows} fmt={fmt} label={report.label} onView={setViewPenalty} />
          <JobsList rows={jobs} fmt={fmt} label={report.label} onView={setViewJob} />
        </>
      )}

      {viewPenalty && <PenaltyModal p={viewPenalty} fmt={fmt} onClose={closePenalty} onOpen={openBooking} />}
      {viewJob && <JobModal j={viewJob} fmt={fmt} onClose={closeJob} onOpen={openBooking} />}
    </div>
  );
}