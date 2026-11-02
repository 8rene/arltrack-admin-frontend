import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import { barRows } from "../../utils/reportTabPdf";
import { Chart as ChartJS, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE & EXPENSE: "Did we make money?"
//
//   Rentals     money received for rentals (deposit + balance), counted on the day the TRIP STARTS (or the day it was paid, if
//               that is later). Money for a trip that has not started yet is NOT revenue yet: it is shown under the cards as
//               "received for upcoming trips". A cancelled booking counts on its cancellation day, so a refunded amount never
//               becomes revenue and only what you keep (a forfeited deposit, a gateway fee kept) does.
//   Penalties   Confirmed penalties that were paid in store or online
//   Returned    refunds + security deposits handed back + discount returns
//   Maintenance Completed maintenance only
//   PayMongo fees  what PayMongo kept on the online payments received (only fees already recorded)
//   Held deposits  security deposits that came in and are still held, minus deposits settled in the period: a held deposit is not
//               revenue yet (a deposit only becomes revenue for the part you keep). Negative = more was settled than came in.
//   Net         Rentals + Penalties - Returned - Held deposits - Maintenance - PayMongo fees
//               (net of the expenses the system records: other costs such as fuel or driver pay are not tracked)
//
// The booking amount includes the refundable security deposit, so a deposit that is still held is not revenue yet:
// it only shows up here when it is kept (a penalty it covered, or a forfeited deposit) because what went back is
// subtracted. Same request as Payments & Transactions (/api/reports/money), but this tab reads `report.revenueBasis`
// (dated by the trip) while that tab reads the cards / series / cars dated by the day the money moved.
// Expected = what has been paid for trips that start on that day but have not started yet: drawn as a striped bar on top of the
// revenue bar and listed in the Expected column; it is never part of Revenue or Net. Expected expenses work the same way on the
// expenses bar: the PayMongo fees already charged on upcoming trips (they become an expense on the trip's start day) plus
// maintenance that is still Scheduled (on its day). PayMongo fees follow the same date as the
// revenue they belong to, so Net compares matching things.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// ─────────────────────────────────────────────────────────────────────────────

export default function RevenueExpense({ period, year, month, week, day, exportRef }) {
  const { report, loading, error } = useReport("/api/reports/money", { period, year, month, week, day });
  return (
    <ReportGate report={report} loading={loading} error={error}>
      <RevenueExpenseView report={report} exportRef={exportRef} />
    </ReportGate>
  );
}

// ── loads /api/reports/money for the selected period (kept for a minute, so the two money tabs share one request) ──
const cache = new Map(); // "endpoint?query" -> { at, data }

function useReport(endpoint, { period, year, month, week, day }) {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const reqRef = useRef(0);
  const token = localStorage.getItem("token");

  const load = useCallback(async ({ force = false } = {}) => {
    const params = new URLSearchParams({ period, year: String(year) });
    if (period === "monthly" || period === "weekly" || period === "daily") params.set("month", String(month));
    if (period === "weekly") params.set("week", String(week));
    if (period === "daily")  params.set("day", String(day));
    const qs = `${endpoint}?${params.toString()}`;

    const hit = cache.get(qs);
    if (!force && hit && Date.now() - hit.at < 60000) {
      reqRef.current += 1;
      setReport(hit.data); setError(null); setLoading(false);
      return;
    }

    const id = ++reqRef.current;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}${qs}`, { headers: { Authorization: `Bearer ${token}` } });
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
  }, [endpoint, token, period, year, month, week, day]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  return { report, loading, error, reload: () => load({ force: true }) };
}


// ── colours and sizes ──

const C_GREEN = "#16a34a";
const C_RED = "#ef4444";
const C_PURPLE = "#8b5cf6";   // PayMongo fees
const PAGE_SIZE = 7;               // rows per page: the graph and the table under it always show the same rows


// ── icons ───────────────────────────────────────────────────────────────────

const Svg = ({ className, children, w = 1.75 }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">{children}</svg>
);
const IconWarning = ({ className = "w-4 h-4" }) => (
  <Svg className={className}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </Svg>
);

const IconClipboard = ({ className = "w-12 h-12" }) => (
  <Svg className={className} w={1.5}>
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" />
  </Svg>
);

const IconCar = ({ className = "w-5 h-5" }) => (
  <Svg className={className}>
    <path d="M3 13l2-5a2 2 0 012-1.4h10A2 2 0 0119 8l2 5v4a1 1 0 01-1 1h-1a1 1 0 01-1-1v-1H6v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-4z" />
    <circle cx="7.5" cy="14" r="1" /><circle cx="16.5" cy="14" r="1" />
  </Svg>
);

const IconPackage = ({ className = "w-5 h-5" }) => (
  <Svg className={className}>
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
  </Svg>
);

const IconCard = ({ className = "w-5 h-5" }) => (<Svg className={className} w={2}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></Svg>);
const IconArrowUp = ({ className = "w-5 h-5" }) => (<Svg className={className} w={2}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>);

const IconTrend = ({ className = "w-5 h-5" }) => (<Svg className={className} w={2}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></Svg>);

// ── wrappers ────────────────────────────────────────────────────────────────


// ── shared pieces (same look as Rentals & Customers) ────────────────────────

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

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>
);

/** Colored icon square on the left, number and title on the right. Give it onClick and it becomes a toggle. */
function StatCard({ title, value, Icon, color, valueClass = "text-gray-800", onClick, off = false }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? !off : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-2xl border border-transparent bg-gray-50 p-4 flex items-center gap-3 transition-all ${clickable ? "cursor-pointer hover:bg-gray-100" : ""} ${off ? "opacity-50" : ""}`}
    >
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className={`text-xl font-bold truncate ${valueClass}`} title={String(value)}>{value}</div>
        <div className="text-xs text-gray-500 truncate" title={title}>{title}</div>
      </div>
    </div>
  );
}

function SectionHead({ title, hint }) {
  return (
    <div className="mb-3 text-center">
      <h2 className="font-sans text-xl font-bold text-arl-dark">{title}</h2>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/** Small colour key above a graph. An item with `line: true` is drawn as a line instead of a square. */
function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mb-3">
      {items.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          {s.line ? <span className="w-3 h-0.5" style={{ background: s.color }} /> : <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />} {s.label}
        </span>
      ))}
    </div>
  );
}

const Empty = ({ children }) => <div className="py-10 text-center text-sm text-gray-400">{children}</div>;

// ── helpers ─────────────────────────────────────────────────────────────────

/** 1250 -> "1.3k", 80 -> "80": short enough to sit inside a bar or under the scale. */
function compact(n) {
  const v = Math.abs(n);
  if (v >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(+n.toFixed(v < 10 ? 1 : 0));
}

function sortRows(rows, { key, dir }) {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name) * sign;
    return ((a[key] || 0) - (b[key] || 0)) * sign || a.name.localeCompare(b.name);
  });
}

// ── table under the graph: same format as the Bookings page ─────────────────

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
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}>
        {label}
        {active ? <IconSortArrow dir={sort.dir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

/** A money cell: "—" when zero, coloured otherwise (red when negative). */
function MoneyCell({ value, color, fmt, negRed = true }) {
  const empty = !value;
  return (
    <td className={`px-4 py-3 whitespace-nowrap ${empty ? "text-gray-300" : "font-semibold"}`}
      style={empty ? undefined : { color: value < 0 && negRed ? C_RED : color }}>
      {empty ? "—" : fmt(value)}
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

/**
 * One row per vehicle, paged with the graph above it (same rows).
 * "View" opens the list of that vehicle's bookings and maintenance in a window, so nothing is ever expanded inline.
 */
function VehicleTable({ rows, fmt, sort, onSort, onView, page, pageCount, count, onPage }) {
  const th = (label, key) => <SortableTh label={label} sortKey={key} sort={sort} onSort={onSort} />;
  return (
    <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              {th("Vehicle", "name")}
              {th("Bookings", "bookings")}
              {th("Revenue", "revenue")}
              {th("Maintenance", "maintenance")}
              {th("PayMongo fees", "fees")}
              {th("Net", "net")}
              {th("Expected", "expected")}
              {th("Expected expenses", "expectedExpenses")}
              <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const net = r.net || 0;
              return (
                <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.bookings || <span className="text-gray-300">—</span>}</td>
                  <MoneyCell value={r.revenue} color={C_GREEN} fmt={fmt} />
                  <MoneyCell value={r.maintenance} color={C_RED} fmt={fmt} />
                  <MoneyCell value={r.fees} color={C_PURPLE} fmt={fmt} />
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-white text-xs font-bold whitespace-nowrap ${net < 0 ? "bg-red-500" : "bg-teal-700"}`}>{fmt(net)}</span>
                  </td>
                  <MoneyCell value={r.expected} color={C_GREEN} fmt={fmt} />
                  <MoneyCell value={r.expectedExpenses} color={C_RED} fmt={fmt} />
                  <td className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">
                    <button onClick={() => onView(r)} className={viewBtn}>View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination page={page} totalPages={pageCount} onChange={onPage} pageSize={PAGE_SIZE} count={count} />
    </div>
  );
}

const MODAL_PAGE_SIZE = 10;   // same page size as the Bookings table

/** A car's bookings (and maintenance jobs) in a window, 10 per page. Backend child names look like "<bookingID> · <customer>". */
function VehicleBookingsModal({ car, fmt, onClose }) {
  const [page, setPage] = useState(1);
  const items = car.children || [];
  const totalPages = Math.max(1, Math.ceil(items.length / MODAL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * MODAL_PAGE_SIZE, safePage * MODAL_PAGE_SIZE);
  const jobs = items.filter((c) => String(c.id).startsWith("m:")).length;
  const net = car.net || 0;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const split = (name) => {
    const i = String(name).indexOf(" · ");
    return i < 0 ? [String(name), ""] : [name.slice(0, i), name.slice(i + 3)];
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-lg text-gray-800 truncate">{car.name}</h2>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 shrink-0"><IconClose /></button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {car.bookings} booking{car.bookings === 1 ? "" : "s"}{jobs > 0 ? ` · ${jobs} maintenance` : ""} ·{" "}
            <span className={net < 0 ? "text-red-500 font-semibold" : "text-teal-700 font-semibold"}>Net {fmt(net)}</span>
          </p>
        </div>

        <div className="overflow-auto flex-1 px-6 py-5">
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                  <tr>
                    {["Booking ID", "Customer"].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}
                    {["Revenue", "Maintenance", "PayMongo fees", "Net", "Expected", "Expected expenses"].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-gray-400 py-12">No bookings or maintenance for this vehicle</td></tr>
                  ) : pageItems.map((c) => {
                    const isJob = String(c.id).startsWith("m:") || String(c.id).startsWith("s:");
                    const [first, rest] = split(c.name);
                    return (
                      <tr key={c.id} className="border-t hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isJob
                            ? <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200">Maintenance</span>
                            : <span className="font-mono text-xs text-gray-600" title={first}>{first}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{rest || <span className="text-gray-300">—</span>}</td>
                        <MoneyCell value={c.revenue} color={C_GREEN} fmt={fmt} />
                        <MoneyCell value={c.maintenance} color={C_RED} fmt={fmt} />
                        <MoneyCell value={c.fees} color={C_PURPLE} fmt={fmt} />
                        <MoneyCell value={c.net} color="#374151" fmt={fmt} />
                        <MoneyCell value={c.expected} color={C_GREEN} fmt={fmt} />
                        <MoneyCell value={c.expectedExpenses} color={C_RED} fmt={fmt} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination page={safePage} totalPages={totalPages} onChange={setPage} pageSize={MODAL_PAGE_SIZE} count={items.length} />
          </div>
        </div>
      </div>
    </div>
  );
}


// what a car's bar is made of: maintenance first (red), then what was left of its revenue (green)
const CAR_SERIES = [
  { key: "maintenance", label: "Maintenance",   color: C_RED },
  { key: "fees",        label: "PayMongo fees", color: C_PURPLE },
  { key: "profit",      label: "Profit",        color: C_GREEN },
];
// paid for trips that start in the period but have not started: striped, on the end of the bar, never part of Profit or Net
const CAR_EXPECTED = { key: "expected", label: "Expected (not revenue yet)", color: "#bbf7d0", hatch: C_GREEN };
// the PayMongo fees already charged on upcoming trips plus Scheduled maintenance: striped red, not an expense yet
const CAR_EXPECTED_COST = { key: "expectedExpenses", label: "Expected expenses (fees + scheduled maintenance)", color: "#fecaca", hatch: C_RED };
const carSeriesFor = (rows) => [
  ...CAR_SERIES,
  ...(rows.some((r) => r.expected > 0) ? [CAR_EXPECTED] : []),
  ...(rows.some((r) => r.expectedExpenses > 0) ? [CAR_EXPECTED_COST] : []),
];
// white-and-green stripes for a Chart.js bar (needs the canvas the chart is drawn on)
const makeHatch = (canvas, color = C_GREEN) => {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 8;
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, 8, 8);
  x.strokeStyle = color; x.lineWidth = 2;
  x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
  return canvas.getContext("2d").createPattern(c, "repeat");
};
// ── graph: revenue against expenses for every day / month (Chart.js) ───

/**
 * Two bars per day (or month): green = revenue, red = expenses (maintenance + PayMongo fees). There is no Net line: Net is already
 * in its card, the tooltip and the table. A bar below zero means more went back to customers than came in. Chart.js draws the axes,
 * the hover tooltip and the resizing; the amounts written on the bars come from a tiny plugin, because Chart.js has no built-in bar labels.
 */
function IncomeExpenseChart({ series }) {
  const { convert, currency, SYMBOLS, fmt } = useCurrency();
  const sym = SYMBOLS?.[currency] || "₱";
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const exp = (b) => b.expenses ?? b.maintenance;
    const n = series.length;
    // amounts on the bars: all when there are 12 or fewer, otherwise only the 3 biggest of each colour
    const biggest = (get) => new Set(series.map((b, i) => [i, get(b)]).filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n <= 12 ? n : 3).map(([i]) => i));
    const show = [biggest((b) => b.revenue), biggest(exp), biggest((b) => b.expected || 0), biggest((b) => b.expectedExpenses || 0)];

    const barLabels = {
      id: "barLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = "600 10px sans-serif";
        ctx.textAlign = "center";
        chart.data.datasets.forEach((ds, di) => {
          ctx.fillStyle = ds.labelColor || ds.backgroundColor;
          chart.getDatasetMeta(di).data.forEach((el, i) => {
            const v = ds.data[i];
            if (!v || !show[di].has(i)) return;
            ctx.fillText(`${sym}${compact(Math.abs(v))}`, el.x, v >= 0 ? el.y - 4 : el.y + 12);
          });
        });
        ctx.restore();
      },
    };

    // white-and-green stripes: what has been paid for trips that start that day but is not revenue yet
    const hatch = (() => {
      const c = document.createElement("canvas");
      c.width = 8; c.height = 8;
      const x = c.getContext("2d");
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, 8, 8);
      x.strokeStyle = C_GREEN; x.lineWidth = 2;
      x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke();
      return canvasRef.current.getContext("2d").createPattern(c, "repeat");
    })();

    const hatchRed = makeHatch(canvasRef.current, C_RED);

    const chart = new ChartJS(canvasRef.current, {
      type: "bar",
      data: {
        labels: series.map((b) => b.short),
        datasets: [
          { label: "Revenue",  data: series.map((b) => (b.revenue === 0 ? null : convert(b.revenue))), backgroundColor: C_GREEN, borderRadius: 3, minBarLength: 3, stack: "revenue" },
          { label: "Expenses", data: series.map((b) => (exp(b) === 0 ? null : convert(exp(b)))), backgroundColor: C_RED, borderRadius: 3, minBarLength: 3, stack: "expenses" },
          // sits on top of the revenue bar of the same day; never part of Revenue or Net
          { label: "Expected", data: series.map((b) => (!b.expected ? null : convert(b.expected))), backgroundColor: hatch, labelColor: C_GREEN, borderColor: C_GREEN, borderWidth: 1, borderRadius: 3, minBarLength: 3, stack: "revenue" },
          // PayMongo fees already charged on upcoming trips + Scheduled maintenance: sits on top of the expenses bar, not an expense yet
          { label: "Expected expenses", data: series.map((b) => (!b.expectedExpenses ? null : convert(b.expectedExpenses))), backgroundColor: hatchRed, labelColor: C_RED, borderColor: C_RED, borderWidth: 1, borderRadius: 3, minBarLength: 3, stack: "expenses" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        categoryPercentage: 0.75,
        barPercentage: 0.9,
        layout: { padding: { top: 16 } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: "#9ca3af", font: { size: 10 }, autoSkip: true, maxTicksLimit: 15, maxRotation: 0 } },
          y: { stacked: true, beginAtZero: true, grid: { color: "#f3f4f6" }, border: { display: false }, ticks: { color: "#9ca3af", font: { size: 10 }, callback: (v) => `${sym}${compact(v)}` } },
        },
        plugins: {
          legend: { display: false },   // the Legend above the graph already says which colour is which
          tooltip: {
            callbacks: {
              title: (items) => series[items[0].dataIndex].label,
              label: (item) => {
                const b = series[item.dataIndex];
                if (item.datasetIndex === 3) return `Expected expenses: ${fmt(b.expectedExpenses)} (not an expense yet)`;
                if (item.datasetIndex === 2) return `Expected: ${fmt(b.expected)} (not revenue yet)`;
                if (item.datasetIndex === 0) return `Revenue: ${fmt(b.revenue)}`;
                const pct = b.revenue > 0 ? ` (${Math.round((exp(b) / b.revenue) * 100)}% of revenue)` : "";
                return `Expenses: ${fmt(exp(b))}${pct}`;
              },
              afterBody: (items) => {
                const b = series[items[0].dataIndex];
                if (items[0].datasetIndex === 3) return [`  PayMongo fees on upcoming trips: ${fmt(b.expectedFees || 0)}`, `  Scheduled maintenance: ${fmt(b.expectedMaintenance || 0)}`, "  They count as expenses on the trip's start day / the maintenance day."];
                if (items[0].datasetIndex === 2) return ["  Paid for trips that start this day.", "  It counts as revenue when the trip starts", "  and can still be cancelled."];
                return [`  Maintenance: ${fmt(b.maintenance)}`, `  PayMongo fees: ${fmt(b.fees || 0)}`, `Net: ${fmt(b.net)}`];
              },
            },
          },
        },
      },
      plugins: [barLabels],
    });
    return () => chart.destroy();
  }, [series, convert, currency, SYMBOLS, fmt, sym]);

  return (
    <div className="relative w-full" style={{ height: 250 }}>
      <canvas ref={canvasRef} role="img" aria-label="Revenue against expenses over the period" />
    </div>
  );
}

// ── graph: one stacked bar per vehicle (Chart.js) ───

/**
 * One horizontal bar per vehicle on this page of the table, split into maintenance (red), PayMongo fees (purple) and what was left of
 * its revenue (green). Bar length is what the car brought in, so a car that cost more than it earned shows no green.
 */
function VehicleChart({ rows }) {
  const { convert, currency, SYMBOLS, fmt } = useCurrency();
  const sym = SYMBOLS?.[currency] || "₱";
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const carSeries = carSeriesFor(rows);

    // what the car brought in, written at the end of each bar (after the striped part, if it has one)
    const totals = {
      id: "barTotals",
      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        ctx.save();
        ctx.font = "600 10px sans-serif";
        ctx.fillStyle = "#6b7280";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        rows.forEach((r, i) => ctx.fillText(`${sym}${compact(convert(r.total))}`, scales.x.getPixelForValue(convert(r.total + (r.expected || 0) + (r.expectedExpenses || 0))) + 6, scales.y.getPixelForValue(i)));
        ctx.restore();
      },
    };

    const chart = new ChartJS(canvasRef.current, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.name),
        datasets: carSeries.map((s) => ({
          label: s.label,
          data: rows.map((r) => (r[s.key] > 0 ? convert(r[s.key]) : null)),
          backgroundColor: s.hatch ? makeHatch(canvasRef.current, s.hatch) : s.color,
          ...(s.hatch ? { borderColor: s.hatch, borderWidth: 1 } : {}),
          borderRadius: 2,
          maxBarThickness: 26,
        })),
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { right: 48 } },
        interaction: { mode: "index", axis: "y", intersect: false },
        scales: {
          x: { stacked: true, beginAtZero: true, grid: { color: "#f3f4f6" }, border: { display: false }, ticks: { color: "#9ca3af", font: { size: 10 }, callback: (v) => `${sym}${compact(v)}` } },
          y: { stacked: true, grid: { display: false }, ticks: { color: "#374151", font: { size: 11 } } },
        },
        plugins: {
          legend: { display: false },   // the Legend above the graph already says which colour is which
          tooltip: {
            callbacks: {
              title: (items) => rows[items[0].dataIndex].name,
              label: (item) => `${item.dataset.label}: ${fmt(rows[item.dataIndex][carSeries[item.datasetIndex].key])}`,
              afterBody: (items) => {
                const r = rows[items[0].dataIndex];
                return [`Revenue: ${fmt(r.revenue)}`, `Net: ${fmt(r.net)}`];
              },
            },
          },
        },
      },
      plugins: [totals],
    });
    return () => chart.destroy();
  }, [rows, convert, currency, SYMBOLS, fmt, sym]);

  return (
    <div className="relative w-full" style={{ height: Math.max(140, rows.length * 38 + 50) }}>
      <canvas ref={canvasRef} role="img" aria-label="Revenue, maintenance and fees by vehicle" />
    </div>
  );
}

// ── table under the graph: one row per day / month that had activity ────────────

function PeriodTable({ series }) {
  const { fmt } = useCurrency();
  const [page, setPage] = useState(1);
  const PAGE = 10;
  const rows = useMemo(() => series.filter((b) => b.rentals || b.penalties || b.returned || b.deposits || b.maintenance || b.fees || b.expected || b.expectedExpenses), [series]);
  useEffect(() => { setPage(1); }, [series]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageNo = Math.min(page, pages);
  const shown = rows.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const sum = (k) => rows.reduce((s, b) => s + (b[k] || 0), 0);
  if (rows.length === 0) return null;
  const heads = ["Period", "Rentals", "Penalties", "Returned", "Held deposits", "Maintenance", "PayMongo fees", "Net", "Expected", "Expected expenses"];
  const totalNet = sum("net");
  return (
    <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              {heads.map((h) => <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.key} className="border-t hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{b.label}</td>
                <MoneyCell value={b.rentals} color={C_GREEN} fmt={fmt} />
                <MoneyCell value={b.penalties} color={C_GREEN} fmt={fmt} />
                <MoneyCell value={b.returned} color={C_RED} fmt={fmt} />
                <MoneyCell value={b.deposits} color="#d97706" fmt={fmt} negRed={false} />
                <MoneyCell value={b.maintenance} color={C_RED} fmt={fmt} />
                <MoneyCell value={b.fees} color={C_PURPLE} fmt={fmt} />
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-white text-xs font-bold whitespace-nowrap ${b.net < 0 ? "bg-red-500" : "bg-teal-700"}`}>{fmt(b.net)}</span>
                </td>
                <MoneyCell value={b.expected} color={C_GREEN} fmt={fmt} />
                <MoneyCell value={b.expectedExpenses} color={C_RED} fmt={fmt} />
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50/70">
            <tr className="font-bold text-gray-700">
              <td className="px-4 py-3 text-gray-800">Total</td>
              {["rentals", "penalties", "returned", "deposits", "maintenance", "fees"].map((k) => (
                <td key={k} className="px-4 py-3 whitespace-nowrap">{fmt(sum(k))}</td>
              ))}
              <td className={`px-4 py-3 whitespace-nowrap ${totalNet < 0 ? "text-red-500" : "text-gray-800"}`}>{fmt(totalNet)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmt(sum("expected"))}</td>
              <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmt(sum("expectedExpenses"))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <TablePagination page={pageNo} totalPages={pages} onChange={setPage} pageSize={PAGE} count={rows.length} />
    </div>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────

function RevenueExpenseView({ report, exportRef }) {
  const { fmt, currency } = useCurrency();
  const [sort, setSort] = useState({ key: "revenue", dir: "desc" });
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);   // the car whose bookings window is open
  const closeView = useCallback(() => setViewing(null), []);

  // Revenue is dated by the trip (see the header comment); older responses without it fall back to the by-payment-date figures.
  const basis = report.revenueBasis || report;
  const cards = basis.cards || {};
  const series = useMemo(() => basis.series || [], [basis]);
  const expectedExpenses = (cards.expectedFeesInPeriod || 0) + (cards.expectedMaintenanceInPeriod || 0);
  const upcomingReceived = cards.upcomingReceived || 0;
  const upcomingCount = cards.upcomingCount || 0;
  const upcomingNote = upcomingReceived > 0
    ? `${upcomingCount} upcoming trip${upcomingCount === 1 ? "" : "s"} ${upcomingCount === 1 ? "has" : "have"} ${fmt(upcomingReceived)} paid so far. It is not counted as revenue until the trip starts, because the booking can still be cancelled.`
    : null;
  const expectedExpensesNote = expectedExpenses > 0
    ? `Also expected in ${report.label}: ${fmt(cards.expectedFeesInPeriod || 0)} PayMongo fees on upcoming trips and ${fmt(cards.expectedMaintenanceInPeriod || 0)} scheduled maintenance. They count as expenses on the trip's start day or the maintenance day.`
    : null;

  // bar length = revenue when the car earned more than it cost, otherwise the maintenance cost
  const rows = useMemo(() => sortRows(
    (basis.cars || []).map((c) => {
      const fees = c.fees || 0;
      const profit = Math.max(0, c.revenue - c.maintenance - fees);
      return { ...c, fees, profit, total: c.maintenance + fees + profit };
    }).filter((c) => c.revenue !== 0 || c.maintenance !== 0 || c.fees || c.expected || c.expectedExpenses),
    sort,
  ), [basis, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageNo = Math.min(page, pages);
  const pageRows = rows.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [report]);

  const nothing = !cards.moneyIn && !cards.returned && !cards.maintenance && !cards.gatewayFees && !cards.expectedInPeriod && !expectedExpenses;
  const net = cards.net ?? 0;

  // ── the PDF: what is on screen, but every row (no paging) ──
  const buildPdf = () => {
    const periodRows = series.filter((b) => b.rentals || b.penalties || b.returned || b.deposits || b.maintenance || b.fees || b.expected || b.expectedExpenses);
    const sumOf = (k) => periodRows.reduce((s2, b) => s2 + (b[k] || 0), 0);
    const exp = (b) => b.expenses ?? b.maintenance;
    const carRows = rows.slice().sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
    return {
      subtitle: report.label,
      currency,
      sections: [
        { type: "stats", items: [
          { label: "Rentals", value: fmt(cards.rentals ?? 0) },
          { label: "Penalties", value: fmt(cards.penalties ?? 0) },
          { label: "Returned", value: fmt(cards.returned ?? 0) },
          { label: "Maintenance", value: fmt(cards.maintenance ?? 0) },
          { label: "PayMongo fees", value: fmt(cards.gatewayFees ?? 0) },
          { label: net < 0 ? "Net loss" : "Net", value: fmt(net), color: net < 0 ? C_RED : undefined },
        ] },
        ...(upcomingNote ? [{ type: "note", text: upcomingNote }] : []),
        ...(expectedExpensesNote ? [{ type: "note", text: expectedExpensesNote }] : []),
        ...(nothing ? [{ type: "empty", text: `No trip started, no money was kept from a cancellation and no maintenance was completed in ${report.label}.` }] : [
          { type: "title", text: "Revenue and Expense" },
          { type: "legend", items: [{ label: "Revenue", color: C_GREEN }, { label: "Expenses (maintenance + PayMongo fees)", color: C_RED }, ...(cards.expectedInPeriod > 0 ? [{ label: "Expected (not revenue yet)", color: "#bbf7d0" }] : []), ...(expectedExpenses > 0 ? [{ label: "Expected expenses (not expenses yet)", color: "#fecaca" }] : [])] },
          { type: "grouped", rows: series.map((b) => ({ name: b.label, bars: [
            { value: b.revenue, color: C_GREEN, text: fmt(b.revenue) },
            { value: exp(b), color: C_RED, text: fmt(exp(b)) },
            ...(cards.expectedInPeriod > 0 ? [{ value: b.expected || 0, color: "#bbf7d0", text: fmt(b.expected || 0) }] : []),
            ...(expectedExpenses > 0 ? [{ value: b.expectedExpenses || 0, color: "#fecaca", text: fmt(b.expectedExpenses || 0) }] : []),
          ] })) },
          ...(cards.gatewayFeesUnrecorded > 0 ? [{ type: "note", text: `${cards.gatewayFeesUnrecorded} online payment${cards.gatewayFeesUnrecorded === 1 ? "" : "s"} in this period ${cards.gatewayFeesUnrecorded === 1 ? "has" : "have"} no PayMongo fee recorded yet, so the fees and Net are slightly off until ${cards.gatewayFeesUnrecorded === 1 ? "it is" : "they are"} filled in.` }] : []),
          ...(periodRows.length === 0 ? [] : [{ type: "table",
            head: ["Period", "Rentals", "Penalties", "Returned", "Held deposits", "Maintenance", "PayMongo fees", "Net", "Expected", "Expected expenses"],
            align: ["left", "right", "right", "right", "right", "right", "right", "right", "right", "right"],
            body: periodRows.map((b) => [b.label, fmt(b.rentals), fmt(b.penalties), fmt(b.returned), fmt(b.deposits), fmt(b.maintenance), fmt(b.fees), fmt(b.net), fmt(b.expected || 0), fmt(b.expectedExpenses || 0)]),
            foot: ["Total", ...["rentals", "penalties", "returned", "deposits", "maintenance", "fees"].map((k) => fmt(sumOf(k))), fmt(sumOf("net")), fmt(sumOf("expected")), fmt(sumOf("expectedExpenses"))] }]),

          { type: "title", text: "Vehicles" },
          ...(carRows.length === 0 ? [{ type: "empty", text: `No bookings or maintenance by vehicle in ${report.label}.` }] : [
            { type: "legend", items: carSeriesFor(carRows) },
            { type: "bars", rows: barRows(carRows, carSeriesFor(carRows), { text: (r) => fmt(r.net) }) },
            { type: "table",
              head: ["Vehicle", "Bookings", "Revenue", "Maintenance", "PayMongo fees", "Net", "Expected", "Expected expenses"],
              align: ["left", "right", "right", "right", "right", "right", "right", "right"],
              body: carRows.map((r) => [r.name, r.bookings ?? "-", fmt(r.revenue), fmt(r.maintenance), fmt(r.fees), fmt(r.net), fmt(r.expected || 0), fmt(r.expectedExpenses || 0)]) },
          ]),
        ]),
      ],
    };
  };
  // The Download PDF button in Reports.jsx asks for this: the current page, as the sections the PDF builder draws.
  useEffect(() => { if (exportRef) exportRef.current = buildPdf; });                  // every render, so it is always the newest
  useEffect(() => () => { if (exportRef) exportRef.current = null; }, [exportRef]);   // a tab that closes has nothing to export


  return (
    <div className="space-y-4">

      <Card>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 p-4">
          <StatCard title="Rentals" value={fmt(cards.rentals ?? 0)} Icon={IconCar} color="bg-green-600 text-white" />
          <StatCard title="Penalties" value={fmt(cards.penalties ?? 0)} Icon={IconWarning} color="bg-green-600 text-white" />
          <StatCard title="Returned" value={fmt(cards.returned ?? 0)} Icon={IconArrowUp} color="bg-red-500 text-white" />
          <StatCard title="Maintenance" value={fmt(cards.maintenance ?? 0)} Icon={IconPackage} color="bg-orange-500 text-white" />
          <StatCard title="PayMongo fees" value={fmt(cards.gatewayFees ?? 0)} Icon={IconCard} color="bg-purple-500 text-white" />
          <StatCard title={net < 0 ? "Net loss" : "Net"} value={fmt(net)} Icon={IconTrend}
            color={net < 0 ? "bg-red-500 text-white" : "bg-teal-600 text-white"} valueClass={net < 0 ? "text-red-500" : "text-gray-800"} />
        </div>
        {upcomingNote && <p className="px-4 pb-1 -mt-1 text-xs text-gray-500">{upcomingNote}</p>}
        {expectedExpensesNote && <p className="px-4 pb-4 text-xs text-gray-500">{expectedExpensesNote}</p>}
        {!expectedExpensesNote && upcomingNote && <div className="pb-3" />}
      </Card>

      {nothing ? (
        <Card><Empty>No trip started, no money was kept from a cancellation and no maintenance was completed in {report.label}. Try another period.</Empty></Card>
      ) : (
        <>
          <Card className="p-4">
            <SectionHead title="Revenue and Expense" />
            <Legend items={[{ key: "r", label: "Revenue", color: C_GREEN }, { key: "m", label: "Expenses (maintenance + PayMongo fees)", color: C_RED }, ...(cards.expectedInPeriod > 0 ? [{ key: "e", label: "Expected: paid for trips that have not started (not revenue yet)", color: "#bbf7d0" }] : []), ...(expectedExpenses > 0 ? [{ key: "x", label: "Expected expenses: PayMongo fees on upcoming trips + scheduled maintenance (not expenses yet)", color: "#fecaca" }] : [])]} />
            <IncomeExpenseChart series={series} />
            {cards.gatewayFeesUnrecorded > 0 && (
              <p className="mt-2 text-xs text-amber-600">{cards.gatewayFeesUnrecorded} online payment{cards.gatewayFeesUnrecorded === 1 ? "" : "s"} in this period {cards.gatewayFeesUnrecorded === 1 ? "has" : "have"} no PayMongo fee recorded yet, so the fees and Net are slightly off until {cards.gatewayFeesUnrecorded === 1 ? "it is" : "they are"} filled in.</p>
            )}
            <PeriodTable series={series} />
          </Card>

          <Card className="p-4">
            <SectionHead title="Vehicles" />
            {rows.length === 0 ? (
              <Empty>No bookings or maintenance by vehicle in {report.label}.</Empty>
            ) : (
              <>
                <Legend items={carSeriesFor(rows)} />
                <VehicleChart rows={pageRows} />
                <VehicleTable rows={pageRows} fmt={fmt} sort={sort} onSort={(next) => { setSort(next); setPage(1); }}
                  onView={setViewing} page={pageNo} pageCount={pages} count={rows.length} onPage={setPage} />
              </>
            )}
          </Card>
        </>
      )}

      {viewing && <VehicleBookingsModal car={viewing} fmt={fmt} onClose={closeView} />}
    </div>
  );
}