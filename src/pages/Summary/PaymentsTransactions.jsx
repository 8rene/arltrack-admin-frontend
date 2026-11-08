import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../context/CurrencyContext";
import { barRows } from "../../utils/reportTabPdf";
import { money, count, when, whenTime } from "../../utils/reportCells";
import { Chart as ChartJS, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS & TRANSACTIONS: "Where did the cash go?"
//
//   Money in         by how it was paid (Cash, GCash ...), split into rentals and penalties. A striped orange part
//                    is the unpaid balance still expected under that method (it is not money received yet).
//                    A second card splits the same money by what it was FOR: rental, service fee, gateway fee,
//                    the refundable deposit, penalties (a booking's fees are split in proportion when it is part-paid).
//   Money out        refunds, security deposits handed back, discount returns, and the fees PayMongo kept
//   Unpaid balances  every payment that still owes money, from ANY period (a balance left from last month is still owed), as of today, biggest first
//
// Money in / out are dated by the day the money MOVED (paymentEntries.settledAt), not the day the booking was made.
// Deposits held is a snapshot of right now. Deposits kept = forfeited deposits + deposits used to cover penalties.
// Same data as Revenue & Expense: both tabs read /api/reports/money.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// ─────────────────────────────────────────────────────────────────────────────

export default function PaymentsTransactions({ period, year, month, week, day, exportRef }) {
  const { report, loading, error } = useReport("/api/reports/money", { period, year, month, week, day });
  return (
    <ReportGate report={report} loading={loading} error={error}>
      <PaymentsTransactionsView report={report} exportRef={exportRef} />
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

const C_RED = "#ef4444";
const C_TEAL = "#0d9488";
const C_AMBER = "#f59e0b";      // = the Unpaid balances card: orange means "still owed", nothing else
const C_INDIGO = "#6366f1";     // penalties
const C_BLUE = "#2563eb";
const C_PURPLE = "#7c3aed";
const C_SKY = "#0ea5e9";       // service fee
const C_PINK = "#ec4899";      // gateway fee
const C_LIME = "#84cc16";      // deposit (and a deposit returned)
const C_ORANGE = "#ea580c";    // refunds
const C_FUCHSIA = "#c026d3";   // discounts returned
const PAGE_SIZE = 7;               // rows per page: the graph and the table under it always show the same rows
const NONE = new Set();


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

const IconArrowDown = ({ className = "w-5 h-5" }) => (<Svg className={className} w={2}><path d="M12 5v14M19 12l-7 7-7-7" /></Svg>);

const IconArrowUp = ({ className = "w-5 h-5" }) => (<Svg className={className} w={2}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>);

const IconLock = ({ className = "w-5 h-5" }) => (<Svg className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></Svg>);

const IconClock = ({ className = "w-5 h-5" }) => (<Svg className={className} w={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></Svg>);


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

function SectionHead({ title }) {
  return (
    <div className="mb-3 text-center">
      <h2 className="font-sans text-xl font-bold text-arl-dark">{title}</h2>
    </div>
  );
}

/** Small colour key above a graph. An item with `line: true` is drawn as a line, `hatched: true` as a striped square. */
function Legend({ items }) {
  const stripes = (c) => `repeating-linear-gradient(45deg, ${c}, ${c} 3px, ${c}b3 3px, ${c}b3 6px)`;
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mb-3">
      {items.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          {s.line ? <span className="w-3 h-0.5" style={{ background: s.color }} /> : <span className="w-3 h-3 rounded-sm" style={{ background: s.hatched ? stripes(s.color) : s.color }} />} {s.label}
        </span>
      ))}
    </div>
  );
}

const Empty = ({ children }) => <div className="py-10 text-center text-sm text-gray-400">{children}</div>;

// ── helpers ─────────────────────────────────────────────────────────────────

/** A round step (1, 2, 5, 10, 20 ...) so a scale has about five whole-number marks. */
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

function sortRows(rows, { key, dir }) {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name) * sign;
    return ((a[key] || 0) - (b[key] || 0)) * sign || a.name.localeCompare(b.name);
  });
}

function paged(list, p, size = PAGE_SIZE) {
  const count = Math.max(1, Math.ceil(list.length / size));
  const no = Math.min(p, count);
  return { count, no, rows: list.slice((no - 1) * size, no * size) };
}

// ── graph: one stacked bar per row (Chart.js) ───────────────────────────────

const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

/** A solid fill, or (for a striped series) a diagonal-stripe pattern, in the given opacity. Cached per colour. */
function paint(s, alpha, cache) {
  const k = `${s.color}|${alpha}|${s.hatched ? 1 : 0}`;
  if (cache.has(k)) return cache.get(k);
  let fill = hexA(s.color, alpha);
  if (s.hatched) {
    const tile = document.createElement("canvas");
    tile.width = 10; tile.height = 10;
    const x = tile.getContext("2d");
    x.fillStyle = fill; x.fillRect(0, 0, 10, 10);
    x.strokeStyle = "rgba(255,255,255,0.45)"; x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-5, 5); x.lineTo(5, -5); x.moveTo(0, 10); x.lineTo(10, 0); x.moveTo(5, 15); x.lineTo(15, 5);
    x.stroke();
    fill = x.createPattern(tile, "repeat") || fill;
  }
  cache.set(k, fill);
  return fill;
}

/**
 * Y = the methods, X = the amount along the bottom. Each bar is split by `series`; a series is skipped when it is in `hidden`
 * or when its value is 0 or less. `sourceSeries` adds a thin second bar per row. Clicking a bar opens the same window as the
 * View button of its table row. The scale is taken from `scaleMax` so bars compare across pages.
 * Chart.js draws the axes, the hover tooltip and the resizing; the numbers inside the segments come from a tiny plugin.
 */
function SplitBars({ rows, scaleMax = 0, series, sourceSeries, sourceLabel = "Received from", hidden = NONE, simple = false, onOpen, money }) {
  const { convert, currency, SYMBOLS } = useCurrency();
  const sym = SYMBOLS?.[currency] || "₱";
  const canvasRef = useRef(null);
  const live = useRef({});
  live.current = { onOpen, money };   // the newest callbacks, so the chart is not rebuilt on every render
  const hasSrc = !!sourceSeries && rows.some((r) => r.online > 0 || r.inPerson > 0);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const cache = new Map();
    const cols = series.filter((s) => !hidden.has(s.key));

    const maxTotal = Math.max(1, convert(scaleMax), ...rows.map((r) => convert(simple ? r.total : (r.barTotal ?? r.total))));
    const step = niceStep(maxTotal);
    const axisMax = Math.max(step, Math.ceil(maxTotal / step) * step);

    const dataset = (s, stack) => ({
      label: s.label,
      key: s.key,
      stack,
      data: rows.map((r) => (r[s.key] > 0 ? convert(r[s.key]) : null)),
      backgroundColor: paint(s, 1, cache),
      borderSkipped: false,
      barPercentage: stack === "src" ? 0.4 : 0.9,
    });
    const datasets = [
      ...cols.map((s) => dataset(s, "main")),
      ...(hasSrc ? sourceSeries.map((s) => dataset(s, "src")) : []),
    ];

    // the amount written inside a segment, only when the segment is wide enough to hold it
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
              label: (item) => {
                const raw = rows[item.dataIndex][item.dataset.key];
                const txt = live.current.money ? live.current.money(raw) : raw;
                return item.dataset.stack === "src" ? `${sourceLabel} · ${item.dataset.label}: ${txt}` : `${item.dataset.label}: ${txt}`;
              },
              footer: (items) => {
                if (simple) return "";
                const r = rows[items[0].dataIndex];
                return `Total: ${live.current.money ? live.current.money(r.total) : r.total}`;
              },
            },
          },
        },
      },
      plugins: [segLabels],
    });
    return () => chart.destroy();
  }, [rows, scaleMax, series, sourceSeries, sourceLabel, hidden, simple, convert, currency, sym, hasSrc]);

  return (
    <div className="relative w-full" style={{ height: Math.max(130, rows.length * (hasSrc ? 44 : 32) + 64) }}>
      <canvas ref={canvasRef} role="img" aria-label="Amount by method, split by what it was for" />
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

/** A money cell: "—" when zero, coloured otherwise (red when negative). */
function MoneyCell({ value, color, fmt }) {
  const empty = !value;
  return (
    <td className={`px-4 py-3 whitespace-nowrap ${empty ? "text-gray-300" : "font-semibold"}`}
      style={empty ? undefined : { color: value < 0 ? C_RED : color }}>
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
const TH = "px-4 py-3 text-left font-semibold whitespace-nowrap";
const THEAD = "bg-gray-50 text-gray-400 text-xs uppercase tracking-wide";

/** One row per method (Money in / Money out), paged with the graph above it. "View" opens that method's breakdown in a window. */
function MethodTable({ rows, allRows, nameLabel, columns, hidden = NONE, sort, onSort, onView, page, pageCount, count, onPage, fmt }) {
  const cols = columns.filter((c) => !hidden.has(c.key));
  const th = (label, key) => <SortableTh key={key} label={label} sortKey={key} sort={sort} onSort={onSort} />;
  return (
    <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={THEAD}>
            <tr>
              {th(nameLabel, "name")}
              {cols.map((c) => th(c.label, c.key))}
              {th("Total", "total")}
              <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.name}</td>
                {cols.map((c) => c.key === "count"
                  ? <td key={c.key} className="px-4 py-3 text-gray-600">{r.count || <span className="text-gray-300">—</span>}</td>
                  : <MoneyCell key={c.key} value={r[c.key]} color={c.color} fmt={fmt} />)}
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-white text-xs font-bold whitespace-nowrap ${(r.total || 0) < 0 ? "bg-red-500" : "bg-teal-700"}`}>{fmt(r.total || 0)}</span>
                </td>
                <td className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">
                  <button onClick={() => onView(r)} className={viewBtn}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
          {(allRows || rows).length > 0 && (() => {
            const all = allRows || rows;                                   // every row, not only this page
            const sum = (k) => all.reduce((s, r) => s + (Number(r[k]) || 0), 0);
            const EXPECTED = new Set(["unpaid", "expected"]);              // expected amounts, not money moved: shown apart
            return (
              <tfoot className="border-t border-gray-200 bg-gray-50/70">
                <tr className="font-bold text-gray-700">
                  <td className="px-4 py-3 text-gray-800">Total</td>
                  {cols.map((c) => (
                    <td key={c.key} className={`px-4 py-3 whitespace-nowrap ${EXPECTED.has(c.key) ? "text-gray-500" : ""}`}>{c.key === "count" ? sum("count") : fmt(sum(c.key))}</td>
                  ))}
                  <td className="px-4 py-3 whitespace-nowrap">{fmt(sum("total"))}</td>
                  <td />
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
      <TablePagination page={page} totalPages={pageCount} onChange={onPage} pageSize={PAGE_SIZE} count={count} />
    </div>
  );
}

const MODAL_PAGE_SIZE = 10;   // same page size as the Bookings table

/** A window with a title, a one-line summary and a paged table. `renderRow(item)` returns a <tr>. */
function RowsModal({ title, subtitle, heads, items, renderRow, emptyText, onClose, top, footer }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / MODAL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * MODAL_PAGE_SIZE, safePage * MODAL_PAGE_SIZE);

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
        <div className="overflow-auto flex-1 px-6 py-5">
          {top}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={THEAD}>
                  <tr>{heads.map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {pageItems.length === 0
                    ? <tr><td colSpan={heads.length} className="text-center text-gray-400 py-12">{emptyText}</td></tr>
                    : pageItems.map(renderRow)}
                </tbody>
                {footer && items.length > 0 && <tfoot className="border-t border-gray-200 bg-gray-50/70">{footer}</tfoot>}
              </table>
            </div>
            <TablePagination page={safePage} totalPages={totalPages} onChange={setPage} pageSize={MODAL_PAGE_SIZE} count={items.length} />
          </div>
        </div>
      </div>
    </div>
  );
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—");


// Money in is split by what the money was FOR, so one bar answers both "how was it paid" and "what was it for".
const IN_SERIES = [
  { key: "rental",    label: "Rental & other fees",  color: C_TEAL },
  { key: "service",   label: "Service fee",          color: C_SKY },
  { key: "gateway",   label: "Gateway fee",          color: C_PINK },
  { key: "deposit",   label: "Deposit (refundable)", color: C_LIME },
  { key: "penalties", label: "Penalties",            color: C_INDIGO },
  { key: "unpaid",    label: "Unpaid (expected)",    color: C_AMBER, hatched: true },
];
// the thin bar under each method in Money in: the same money, by where it was received
const SRC_SERIES = [
  { key: "online",   label: "Online (PayMongo)", color: C_BLUE },
  { key: "inPerson", label: "In person", color: C_PURPLE },
];
// Channel dropdown: when Online or In person is picked, the thin bar and the Online / In person columns are redundant, and
// unpaid and could-go-back amounts have no channel yet, so they are left out.
const FILTER_HIDE = new Set(["online", "inPerson", "unpaid", "expected", "pendRefund", "pendDeposit", "pendDiscount"]);
const OUT_KIND_KEY = { "Refund": "refund", "Deposit return": "depositReturn", "Discount return": "discountReturn" };

// Money out is laid out like Money in: a row per method, split by the reason the money left. The thin bar under it is the
// same money by where it went (SRC_SERIES, shared with Money in).
const OUT_SERIES = [
  { key: "refund",         label: "Refunds",                 color: C_ORANGE },
  { key: "depositReturn",  label: "Deposits returned",       color: C_LIME },
  { key: "discountReturn", label: "Discounts returned",      color: C_FUCHSIA },
  // striped = could still go back, nothing has moved yet (same look as Unpaid on Money in)
  { key: "pendRefund",     label: "Scheduled return",        color: C_ORANGE,      hatched: true },
  { key: "pendDeposit",    label: "Deposit held",            color: C_LIME,        hatched: true },
  { key: "pendDiscount",   label: "Discount held",           color: C_FUCHSIA,     hatched: true },
];

// Simplified view: one bar per method, just the total (no split by what it was for, no thin bar).
const IN_TOTAL  = [{ key: "total", label: "Total money in",  color: C_TEAL }];
const OUT_TOTAL = [{ key: "total", label: "Total money out", color: C_RED }];

// same labels as the Payments page
const STAGE_STYLE = {
  Pending:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  Partial:      "bg-blue-50 text-blue-700 border-blue-200",
  Completed:    "bg-green-50 text-green-700 border-green-200",
  "For Refund": "bg-orange-50 text-orange-700 border-orange-200",
  Refunded:     "bg-purple-50 text-purple-700 border-purple-200",
  Cancelled:    "bg-red-50 text-red-700 border-red-200",
  Failed:       "bg-red-50 text-red-700 border-red-200",
};
const Stage = ({ stage }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${STAGE_STYLE[stage] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{stage}</span>
);


/** "Booking · Customer" -> ["Booking", "Customer"] */
const splitName = (name) => {
  const i = String(name).indexOf(" · ");
  return i < 0 ? [String(name), ""] : [name.slice(0, i), name.slice(i + 3)];
};

/** Simplified | Detailed: same look as the tab switcher at the top of the page. */
function DetailToggle({ detailed, onChange }) {
  const opts = [{ on: false, label: "Simplified" }, { on: true, label: "Detailed" }];
  return (
    <div role="group" aria-label="Level of detail" className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 w-fit">
      {opts.map((o) => (
        <button key={o.label} type="button" onClick={() => onChange(o.on)} aria-pressed={detailed === o.on}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            detailed === o.on ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A smaller title for a group inside a card (Unpaid balances under Money in, Possible return under Money out). */
function SubGroup({ title, children }) {
  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <h3 className="font-sans text-lg font-bold text-arl-dark text-center mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PaymentsTransactionsView({ report, exportRef }) {
  const { fmt, currency, convert } = useCurrency();
  const navigate = useNavigate();
  const cards = report.cards || {};
  const methods = useMemo(() => report.methods || [], [report.methods]);
  const unpaid = useMemo(() => report.unpaid || [], [report.unpaid]);
  const outflows = useMemo(() => report.outflows || [], [report.outflows]);
  const possible = useMemo(() => report.possible || { total: 0, byKind: {}, items: [] }, [report.possible]);

  // money in
  const [inSort, setInSort] = useState({ key: "total", dir: "desc" });
  const [inPage, setInPage] = useState(1);
  const [viewIn, setViewIn] = useState(null);       // the method whose window is open
  // unpaid (under money in)
  const [unpaidPage, setUnpaidPage] = useState(1);
  // money out
  const [outSort, setOutSort] = useState({ key: "total", dir: "desc" });
  const [outPage, setOutPage] = useState(1);
  const [viewOut, setViewOut] = useState(null);
  // possible to return (under money out)
  const [possPage, setPossPage] = useState(1);
  // channel: overall (online + in person side by side) | online only | in person only. Applies to Money in and Money out.
  const [channel, setChannel] = useState("all");
  const [detailed, setDetailed] = useState(true);   // Simplified: one total bar per method + slim table. Detailed: the full split, thin bar and every column
  const byChannel = channel !== "all";
  const hide = byChannel ? FILTER_HIDE : NONE;
  const chName = channel === "online" ? "Online" : channel === "inPerson" ? "In person" : "";
  const chWord = channel === "online" ? " online" : channel === "inPerson" ? " in person" : "";
  useEffect(() => { setInPage(1); setOutPage(1); setUnpaidPage(1); setPossPage(1); }, [report]);
  const closeIn = useCallback(() => setViewIn(null), []);
  const closeOut = useCallback(() => setViewOut(null), []);

  // ── channel filter ──
  // Money in: each method already carries one child per channel with the full split, so a channel is just that child.
  const inScoped = useMemo(() => {
    if (channel === "all") return methods;
    return methods.map((m) => {
      const kid = (m.children || []).find((c) => c[channel] > 0);
      return kid ? { ...m, ...kid, id: m.id, name: m.name, unpaid: 0, barTotal: kid.total, children: [kid] } : null;
    }).filter(Boolean);
  }, [methods, channel]);
  // Money out: keep the transactions that went through the channel and rebuild each method's numbers from them.
  // Money that could still go back has no channel yet (nothing was paid), so it drops out.
  const outScoped = useMemo(() => {
    if (channel === "all") return outflows;
    return outflows.map((o) => {
      const kids = o.children.filter((c) => c[channel] > 0);
      if (!kids.length) return null;
      const row = { ...o, count: kids.length, refund: 0, depositReturn: 0, discountReturn: 0, pendRefund: 0, pendDeposit: 0, pendDiscount: 0, expected: 0, online: 0, inPerson: 0, total: 0, children: kids };
      kids.forEach((c) => {
        const k = OUT_KIND_KEY[c.kindLabel];
        if (k) row[k] += c.total;
        row.online += c.online; row.inPerson += c.inPerson; row.total += c.total;
      });
      row.barTotal = row.total;
      return row;
    }).filter(Boolean);
  }, [outflows, channel]);
  const onChannel = (v) => { setChannel(v); setInPage(1); setOutPage(1); };

  // ── graphs + tables: money in / money out ──
  const inRows = useMemo(() => sortRows(inScoped, inSort), [inScoped, inSort]);
  const outRows = useMemo(() => sortRows(outScoped, outSort), [outScoped, outSort]);
  const inP = useMemo(() => paged(inRows, inPage), [inRows, inPage]);
  const outP = useMemo(() => paged(outRows, outPage), [outRows, outPage]);

  const unpaidP = useMemo(() => paged(unpaid, unpaidPage, PAGE_SIZE), [unpaid, unpaidPage]);
  const possP = useMemo(() => paged(possible.items, possPage, PAGE_SIZE), [possible.items, possPage]);
  const POSS_KINDS = [
    { key: "refund",   label: "Scheduled return", color: C_ORANGE },
    { key: "deposit",  label: "Deposits held", color: C_LIME },
    { key: "discount", label: "Discounts held", color: C_FUCHSIA },
  ];

  const inColumns = [
    { key: "count",     label: "Payments" },
    { key: "rental",    label: "Rental",    color: C_TEAL },
    { key: "service",   label: "Service",   color: C_SKY },
    { key: "gateway",   label: "Gateway",   color: C_PINK },
    { key: "deposit",   label: "Deposit",   color: C_LIME },
    { key: "penalties", label: "Penalties", color: C_INDIGO },
    { key: "unpaid",    label: "Unpaid",    color: C_AMBER },
    { key: "online",    label: "Online",    color: C_BLUE },
    { key: "inPerson",  label: "In person", color: C_PURPLE },
  ];
  const outColumns = [
    { key: "count",          label: "Transactions" },
    { key: "refund",         label: "Refunds",   color: C_ORANGE },
    { key: "depositReturn",  label: "Deposits",  color: C_LIME },
    { key: "discountReturn", label: "Discounts", color: C_FUCHSIA },
    { key: "expected",       label: "Possible return", color: C_AMBER },
    { key: "online",         label: "Online",    color: C_BLUE },
    { key: "inPerson",       label: "In person", color: C_PURPLE },
  ];

  const moneyInValue = byChannel ? inRows.reduce((sum, r) => sum + r.total, 0) : (cards.moneyIn ?? 0);
  const moneyOutValue = byChannel ? outRows.reduce((sum, r) => sum + r.total, 0) : (cards.returned ?? 0);

  // the windows
  const inCols = inColumns.filter((c) => c.key !== "online" && c.key !== "inPerson" && !hide.has(c.key));
  const goBooking = (id) => navigate(`/bookings?open=${encodeURIComponent(id)}`);
  // Money in window: one row per payment received (the same entries the totals are made of). The channel filter applies.
  const inTx = viewIn?.transactions ? viewIn.transactions.filter((x) => !byChannel || x.channel === chName) : [];
  const inTxTotal = inTx.reduce((s, x) => s + x.amount, 0);
  // Money out window: one row per transaction; money still on its way (pending) is shown apart from what has gone out.
  const outTx = viewOut?.children || [];
  const outDone = outTx.filter((x) => !x.pending).reduce((s, x) => s + (x.total || 0), 0);
  const outWaiting = outTx.filter((x) => x.pending).reduce((s, x) => s + (x.expected || 0), 0);
  const statusCls = (s) => (s === "Pending" ? "text-amber-600" : "text-green-700");

  // ── the PDF and the Excel file: every row (no paging) and every column, plus the records behind each "View" window and the
  //    raw payment records. The file is always the full report (the Simplified / Detailed switch only changes the screen);
  //    the channel filter does apply. ──
  const buildPdf = () => {
    const srcOk = !byChannel;
    const S = (label, n, accent) => ({ label, value: fmt(n), n, t: "money", accent });   // a key figure: text for the PDF, a number for Excel; accent = the card's colour
    const cellOf = (r, c) => (c.key === "count" ? count(r.count, { dash: true }) : money(r[c.key], { dash: true }));
    const methodTable = (name, rows, cols) => ({
      type: "table", name,
      head: ["Method", ...cols.map((c) => c.label), "Total"],
      align: ["left", ...cols.map(() => "right"), "right"],
      body: rows.map((r) => [r.name, ...cols.map((c) => cellOf(r, c)), money(r.total || 0)]),
      foot: rows.length === 0 ? undefined : ["Total",
        ...cols.map((c) => (c.key === "count" ? count(rows.reduce((s, r) => s + (r.count || 0), 0)) : money(rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)))),
        money(rows.reduce((s, r) => s + (r.total || 0), 0))],
    });
    const group = (title, tableName, rows, empty, detail, cols) => [
      { type: "title", text: title, graph: `${title} Graph`, table: `${title} Table` },
      ...(rows.length === 0 ? [{ type: "empty", text: empty }] : [
        { type: "legend", items: [...detail, ...SRC_SERIES].filter((x) => !hide.has(x.key)) },
        { type: "bars", rows: barRows(rows, detail.filter((x) => !hide.has(x.key)), { text: (r) => fmt(r.total || 0), sub: srcOk ? SRC_SERIES : undefined }) },
        methodTable(tableName, rows, cols.filter((c) => !hide.has(c.key))),
      ]),
    ];

    // the windows, flattened: one row per transaction (money out)
    const outFlat = outRows.flatMap((o) => (o.children || []).map((c) => {
      const [id, who] = splitName(c.name);
      return [o.name, c.bookingID || id, c.customer || who || "", when(c.date), c.kindLabel || "", c.pending ? "" : c.online > 0 ? "Online" : "In person", c.pending ? "Pending" : "Done", money(c.pending ? c.expected : c.total), c.reference || ""];
    }));
    // the raw payment records of the period (not narrowed by the channel filter) and each step of them
    const records = report.payments || [];
    const recordRows = records.map((r) => [r.bookingID, r.customer, r.car, r.method, r.stage, money(r.total), money(r.paid), money(r.balance), money(r.refunded), r.reference, whenTime(r.createdAt), when(r.tripStart)]);
    // money in, one row per payment received (the same layout as Money out transactions). A step's channel is its `source`
    // when the record carries one; otherwise cash is in person and anything else is left blank rather than guessed.
    const METHOD_LABEL = { gcash: "GCash", maya: "Maya", paymaya: "Maya", qrph: "QR Ph", cash: "Cash", bank_transfer: "Bank transfer" };
    const IN_TYPE = { deposit: "Deposit paid", balance: "Balance paid", penalty: "Penalty payment" };
    const stepChannel = (st) => (st.source === "in_person" ? "In person" : st.source ? "Online" : String(st.method || "").toLowerCase() === "cash" ? "In person" : "");
    const inFlatFromRecords = records
      .flatMap((r) => (r.steps || [])
        .filter((st) => st.direction === "in" && (st.status === "success" || st.status === "pending"))
        .map((st) => ({ r, st, method: METHOD_LABEL[String(st.method || "").toLowerCase()] || st.method || "-", channel: stepChannel(st) })))
      .filter((x) => !byChannel || x.channel === chName)       // the channel filter applies, as it does to Money out
      .sort((a, b) => a.method.localeCompare(b.method) || String(a.st.date || "").localeCompare(String(b.st.date || "")))
      .map(({ r, st, method, channel }) => [method, r.bookingID, r.customer || "", whenTime(st.date), IN_TYPE[st.phase] || "Payment", channel, st.status === "pending" ? "Pending" : "Done", money(st.amount), st.reference || ""]);
    // Preferred: the payments behind each method's total (same entries as the Money in table, so the file adds up to the screen).
    const hasTx = inScoped.some((m) => Array.isArray(m.transactions));
    const inFlat = hasTx
      ? inScoped.flatMap((m) => (m.transactions || [])
          .filter((x) => !byChannel || x.channel === chName)
          .map((x) => [m.name, x.bookingID || "", x.customer || "", whenTime(x.date), x.type, x.channel, x.status, money(x.amount), x.reference || ""]))
      : inFlatFromRecords;
    const stepRows = records.flatMap((r) => (r.steps || []).map((st) => [r.bookingID, r.customer, st.phase || "", st.direction || "", st.method, money(st.amount), st.status || "", st.reference, whenTime(st.date)]));

    return {
      subtitle: report.label,
      filters: [["Channel", byChannel ? `${chName} only` : "All (online + in person)"]],
      currency, fmt, convert,
      sections: [
        { type: "stats", items: [
          S(byChannel ? `Money in · ${chName}` : "Money in", moneyInValue, "#16a34a"),
          S(byChannel ? `Money out · ${chName}` : "Money out", moneyOutValue, "#ef4444"),
          S("Unpaid (all periods)", cards.unpaid ?? 0, "#f59e0b"),
          S("Deposits held", cards.depositsHeld ?? 0, "#2563eb"),
          S("Possible return", cards.possibleReturn ?? 0, "#f59e0b"),
        ] },

        ...group("Money In", "Money in", inRows, `No money was received${chWord} in ${report.label}.`, IN_SERIES, inColumns),
        { type: "title", text: "Unpaid balances (all periods)", level: 2 },
        unpaid.length === 0
          ? { type: "empty", text: "Nothing is owed on any payment." }
          : { type: "table", name: "Unpaid balances",
              head: ["Booking", "Customer", "Vehicle", "Status", "Trip date", "Total", "Paid", "Balance"],
              align: ["left", "left", "left", "left", "left", "right", "right", "right"],
              body: unpaid.map((r) => [r.bookingID, r.customer, r.car, r.stage, when(r.tripStart), money(r.total), money(r.paid, { dash: true }), money(r.balance)]),
              foot: ["Total", `${unpaid.length} payments`, "", "", "", money(unpaid.reduce((s, r) => s + (r.total || 0), 0)), money(unpaid.reduce((s, r) => s + (r.paid || 0), 0)), money(unpaid.reduce((s, r) => s + (r.balance || 0), 0))] },

        ...group("Money Out", "Money out", outRows, `No money went out${chWord} in ${report.label}.`, OUT_SERIES, outColumns),
        ...(byChannel ? [] : [
          { type: "title", text: "Possible return", level: 2 },
          ...(possible.items.length === 0 ? [{ type: "empty", text: "Nothing is waiting to be returned." }] : [
            { type: "note", text: POSS_KINDS.map((k) => `${k.label}: ${fmt(possible.byKind?.[k.key] || 0)}`).join("     ") },
            { type: "table", name: "Possible return",
              head: ["Booking", "Customer", "Type", "Method", "Amount"],
              align: ["left", "left", "left", "left", "right"],
              body: possible.items.map((r) => { const [id, who] = splitName(r.name); return [id, who || "-", r.kindLabel, r.method, money(r.amount)]; }),
              foot: ["Total", `${possible.items.length} items`, "", "", money(possible.total || 0)] },
          ]),
        ]),
      ],
      sheets: [
        { name: "Money in transactions", desc: "Every payment received behind each money-in method (deposits, balances and penalties), with its booking, customer, date, channel and status",
          head: ["Method", "Booking ID", "Customer", "Date", "Type", "Channel", "Status", "Amount", "Reference"], body: inFlat },
        { name: "Money out transactions", desc: "Every refund, deposit return and discount return behind each money-out method, plus what is still pending",
          head: ["Method", "Booking ID", "Customer", "Date", "Type", "Channel", "Status", "Amount", "Reference"], body: outFlat },
        { name: "Payment records", desc: "Every payment created in the period, with its total, paid, balance and refunded amounts (not narrowed by the channel filter)",
          head: ["Booking ID", "Customer", "Vehicle", "Method", "Stage", "Total", "Paid", "Balance", "Refunded", "Reference", "Created", "Trip start"], body: recordRows },
        { name: "Payment steps", desc: "Each deposit, balance, refund and return transaction of those payments",
          head: ["Booking ID", "Customer", "Phase", "Direction", "Method", "Amount", "Status", "Reference", "Date"], body: stepRows },
      ],
    };
  };
  // The Download PDF button in Reports.jsx asks for this: the current page, as the sections the PDF builder draws.
  useEffect(() => { if (exportRef) exportRef.current = buildPdf; });                  // every render, so it is always the newest
  useEffect(() => () => { if (exportRef) exportRef.current = null; }, [exportRef]);   // a tab that closes has nothing to export


  return (
    <div className="space-y-4">

      <Card>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5 p-4">
          <StatCard title={byChannel ? `Money in · ${chName}` : "Money in"} value={fmt(moneyInValue)} Icon={IconArrowDown} color="bg-green-600 text-white" />
          <StatCard title={byChannel ? `Money out · ${chName}` : "Money out"} value={fmt(moneyOutValue)} Icon={IconArrowUp} color="bg-red-500 text-white" />
          <StatCard title="Unpaid (all periods)" value={fmt(cards.unpaid ?? 0)} Icon={IconWarning} color="bg-amber-500 text-white" />
          <StatCard title="Deposits held" value={fmt(cards.depositsHeld ?? 0)} Icon={IconLock} color="bg-blue-600 text-white" />
          <StatCard title="Possible return" value={fmt(cards.possibleReturn ?? 0)} Icon={IconClock} color="bg-amber-500 text-white" />
        </div>

        {/* Left: Simplified | Detailed. Then Filter By: the channel dropdown. Overall shows online and in person side by side in
            Detailed (thin bar + columns); the others narrow Money in and Money out. */}
        <div className="border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <DetailToggle detailed={detailed} onChange={setDetailed} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor="channel-filter" className="text-gray-400 font-semibold">Filter By:</label>
              <select
                id="channel-filter"
                value={channel}
                onChange={(e) => onChannel(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="all">Overall (online + in person)</option>
                <option value="online">Online only</option>
                <option value="inPerson">In person only</option>
              </select>
              {byChannel && (
                <span className="text-gray-400">
                  Applies to Money in and Money out. Unpaid balances, deposits and PayMongo fees are not split by channel, and the striped "possible return" amounts are hidden because nothing has been paid yet, so they have no channel.
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Money in, with the unpaid balances that are still expected */}
      <Card className="p-4">
        <SectionHead title="Money in" />
        {inRows.length === 0 ? (
          <Empty>No money was received{chWord} in {report.label}.</Empty>
        ) : (
          <>
            <Legend items={detailed ? [...IN_SERIES, ...SRC_SERIES].filter((x) => !hide.has(x.key)) : IN_TOTAL} />
            <SplitBars sourceLabel="Received from" rows={inP.rows} scaleMax={Math.max(0, ...inRows.map((r) => (detailed ? (r.barTotal ?? r.total) : r.total)))} series={detailed ? IN_SERIES : IN_TOTAL} sourceSeries={byChannel || !detailed ? undefined : SRC_SERIES} hidden={hide} simple={!detailed}
              onOpen={setViewIn} money={fmt} />
            <MethodTable allRows={inRows} rows={inP.rows} nameLabel="Method" columns={detailed ? inColumns : []} hidden={hide} sort={inSort} onSort={(s) => { setInSort(s); setInPage(1); }}
              onView={setViewIn} page={inP.no} pageCount={inP.count} count={inRows.length} onPage={setInPage} fmt={fmt} />
          </>
        )}

        <SubGroup title="Unpaid balances (all periods)">
          {unpaid.length === 0 ? (
            <Empty>Nothing is owed on any payment.</Empty>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={THEAD}>
                    <tr>
                      {["Booking", "Customer", "Vehicle", "Status", "Trip date", "Total", "Paid", "Balance"].map((h) => <th key={h} className={TH}>{h}</th>)}
                      <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidP.rows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{r.bookingID}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.customer}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.car}</td>
                        <td className="px-4 py-3"><Stage stage={r.stage} /></td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.tripStart)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(r.total)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.paid ? fmt(r.paid) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">{fmt(r.balance)}</span>
                        </td>
                        <td className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">
                          <button onClick={() => goBooking(r.bookingID)} className={viewBtn}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 bg-gray-50/70">
                    <tr className="font-bold text-gray-700">
                      <td className="px-4 py-3 text-gray-800">Total</td>
                      <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap" colSpan={4}>{unpaid.length} payment{unpaid.length === 1 ? "" : "s"} still owing</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt(unpaid.reduce((s, r) => s + (r.total || 0), 0))}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt(unpaid.reduce((s, r) => s + (r.paid || 0), 0))}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmt(unpaid.reduce((s, r) => s + (r.balance || 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <TablePagination page={unpaidP.no} totalPages={unpaidP.count} onChange={setUnpaidPage} pageSize={PAGE_SIZE} count={unpaid.length} />
            </div>
          )}
        </SubGroup>
      </Card>

      {/* Money out, with what could still go back */}
      <Card className="p-4">
        <SectionHead title="Money out" />
        {outRows.length === 0 ? (
          <Empty>No money went out{chWord} in {report.label}.</Empty>
        ) : (
          <>
            <Legend items={detailed ? [...OUT_SERIES, ...SRC_SERIES].filter((x) => !hide.has(x.key)) : OUT_TOTAL} />
            <SplitBars sourceLabel="Paid out through" rows={outP.rows} scaleMax={Math.max(0, ...outRows.map((r) => (detailed ? (r.barTotal ?? r.total) : r.total)))} series={detailed ? OUT_SERIES : OUT_TOTAL} sourceSeries={byChannel || !detailed ? undefined : SRC_SERIES} hidden={hide} simple={!detailed}
              onOpen={setViewOut} money={fmt} />
            <MethodTable allRows={outRows} rows={outP.rows} nameLabel="Method" columns={detailed ? outColumns : []} hidden={hide} sort={outSort} onSort={(s) => { setOutSort(s); setOutPage(1); }}
              onView={setViewOut} page={outP.no} pageCount={outP.count} count={outRows.length} onPage={setOutPage} fmt={fmt} />
          </>
        )}

        {!byChannel && (
          <SubGroup title="Possible return">
            {possible.items.length === 0 ? (
              <Empty>Nothing is waiting to be returned.</Empty>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-3 text-xs text-gray-600">
                  {POSS_KINDS.map((k) => (
                    <span key={k.key} className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ background: `repeating-linear-gradient(45deg, ${k.color}, ${k.color} 3px, ${k.color}b3 3px, ${k.color}b3 6px)` }} />
                      {k.label} <span className="font-semibold text-gray-800">{fmt(possible.byKind?.[k.key] || 0)}</span>
                    </span>
                  ))}
                </div>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={THEAD}>
                        <tr>
                          {["Booking", "Customer", "Type", "Method", "Amount"].map((h) => <th key={h} className={TH}>{h}</th>)}
                          <th className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {possP.rows.map((r) => {
                          const [bookingID, customer] = splitName(r.name);
                          return (
                            <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{bookingID}</td>
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{customer || <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.kindLabel}</td>
                              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.method}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">{fmt(r.amount)}</span>
                              </td>
                              <td className="pl-4 pr-8 py-3 text-right w-px whitespace-nowrap">
                                {bookingID !== "—" && <button onClick={() => goBooking(bookingID)} className={viewBtn}>View</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-gray-200 bg-gray-50/70">
                        <tr className="font-bold text-gray-700">
                          <td className="px-4 py-3 text-gray-800">Total</td>
                          <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap" colSpan={3}>{possible.items.length} item{possible.items.length === 1 ? "" : "s"} · expected, not paid yet</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmt(possible.total || 0)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <TablePagination page={possP.no} totalPages={possP.count} onChange={setPossPage} pageSize={PAGE_SIZE} count={possible.items.length} />
                </div>
              </>
            )}
          </SubGroup>
        )}
      </Card>

      {/* Money in: every payment received through one method */}
      {viewIn && (viewIn.transactions ? (
        <RowsModal
          title={viewIn.name}
          subtitle={<>{inTx.length} payment{inTx.length === 1 ? "" : "s"} · <span className="text-teal-700 font-semibold">Total {fmt(inTxTotal)}</span>{viewIn.unpaid > 0 && !byChannel ? <> · <span className="text-amber-600 font-semibold">Unpaid {fmt(viewIn.unpaid)}</span></> : null}</>}
          heads={["Booking ID", "Customer", "Date", "Type", "Channel", "Status", "Amount", "Reference", "Action"]}
          items={inTx}
          emptyText="No payments for this method"
          onClose={closeIn}
          top={inTx.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-gray-600">
              <span>Online (PayMongo) <span className="font-semibold text-gray-800">{fmt(inTx.filter((x) => x.channel === "Online").reduce((s, x) => s + x.amount, 0))}</span></span>
              <span>In person <span className="font-semibold text-gray-800">{fmt(inTx.filter((x) => x.channel !== "Online").reduce((s, x) => s + x.amount, 0))}</span></span>
              <span className="text-gray-400">Penalty payments here are money that moved. Penalties covered by a held deposit or discount credit moved no money, so they are on the Maintenance &amp; Penalties tab.</span>
            </div>
          )}
          footer={(
            <tr className="font-bold text-gray-700">
              <td className="px-4 py-3 text-gray-800">Total</td>
              <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap" colSpan={5}>{inTx.length} payment{inTx.length === 1 ? "" : "s"}</td>
              <td className="px-4 py-3 whitespace-nowrap">{fmt(inTxTotal)}</td>
              <td colSpan={2} />
            </tr>
          )}
          renderRow={(x) => (
            <tr key={x.id} className="border-t hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-xs text-gray-600">{x.bookingID || "—"}</span></td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{x.customer || <span className="text-gray-300">—</span>}</td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{x.date ? fmtDate(x.date) : <span className="text-gray-300">—</span>}</td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{x.type}</td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{x.channel}</td>
              <td className={`px-4 py-3 whitespace-nowrap font-medium ${statusCls(x.status)}`}>{x.status}</td>
              <MoneyCell value={x.amount} color="#374151" fmt={fmt} />
              <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{x.reference || <span className="text-gray-300">—</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{x.bookingID && <button onClick={() => goBooking(x.bookingID)} className={viewBtn}>View</button>}</td>
            </tr>
          )}
        />
      ) : (
        <RowsModal
          title={viewIn.name}
          subtitle={<>{viewIn.count} payment{viewIn.count === 1 ? "" : "s"} · <span className="text-teal-700 font-semibold">Total {fmt(viewIn.total)}</span></>}
          heads={["Channel", ...inCols.map((c) => c.label), "Total"]}
          items={viewIn.children || []}
          emptyText="No breakdown for this method"
          onClose={closeIn}
          renderRow={(c) => (
            <tr key={c.id} className="border-t hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{c.name}</td>
              {inCols.map((col) => col.key === "count"
                ? <td key={col.key} className="px-4 py-3 text-gray-600">{c.count || <span className="text-gray-300">—</span>}</td>
                : <MoneyCell key={col.key} value={c[col.key]} color={col.color} fmt={fmt} />)}
              <MoneyCell value={c.total} color="#374151" fmt={fmt} />
            </tr>
          )}
        />
      ))}

      {/* Money out: every transaction through one method */}
      {viewOut && (
        <RowsModal
          title={viewOut.name}
          subtitle={<>{outTx.filter((x) => !x.pending).length} transaction{outTx.filter((x) => !x.pending).length === 1 ? "" : "s"} · <span className="text-red-500 font-semibold">Total {fmt(outDone)}</span>{outWaiting > 0 ? <> · <span className="text-amber-600 font-semibold">Possible return {fmt(outWaiting)}</span></> : null}</>}
          heads={["Booking ID", "Customer", "Date", "Type", "Channel", "Status", "Amount", "Reference", "Action"]}
          items={outTx}
          emptyText="No transactions for this method"
          onClose={closeOut}
          footer={(
            <tr className="font-bold text-gray-700">
              <td className="px-4 py-3 text-gray-800">Total</td>
              <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap" colSpan={5}>{outTx.filter((x) => !x.pending).length} paid out{outWaiting > 0 ? ` · ${outTx.filter((x) => x.pending).length} still pending (shown apart)` : ""}</td>
              <td className="px-4 py-3 whitespace-nowrap">{fmt(outDone)}{outWaiting > 0 && <span className="ml-2 font-semibold text-gray-500">+ {fmt(outWaiting)} pending</span>}</td>
              <td colSpan={2} />
            </tr>
          )}
          renderRow={(c) => {
            const [first, rest] = splitName(c.name);
            const bookingID = c.bookingID || (first && first !== "—" ? first : null);
            const status = c.status || (c.pending ? "Pending" : "Done");
            return (
              <tr key={c.id} className="border-t hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-xs text-gray-600">{bookingID || "—"}</span></td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{c.customer || rest || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.date ? fmtDate(c.date) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{c.kindLabel || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.pending ? <span className="text-gray-300">—</span> : c.online > 0 ? "Online" : "In person"}</td>
                <td className={`px-4 py-3 whitespace-nowrap font-medium ${statusCls(status)}`}>{status}</td>
                {c.pending
                  ? <MoneyCell value={c.expected} color={C_AMBER} fmt={fmt} />
                  : <MoneyCell value={c.total} color="#374151" fmt={fmt} />}
                <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{c.reference || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">{bookingID && <button onClick={() => goBooking(bookingID)} className={viewBtn}>View</button>}</td>
              </tr>
            );
          }}
        />
      )}

    </div>
  );
}