import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../../context/CurrencyContext";

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS & TRANSACTIONS: "Where did the cash go?"
//
//   Money in         by how it was paid (Cash, GCash ...), split into rentals and penalties. A striped orange part
//                    is the unpaid balance still expected under that method (it is not money received yet).
//                    A second card splits the same money by what it was FOR: rental, service fee, gateway fee,
//                    the refundable deposit, penalties (a booking's fees are split in proportion when it is part-paid).
//   Money out        refunds, security deposits handed back, discount returns, and the fees PayMongo kept
//   Unpaid balances  payments made in the period that still owe money, biggest first
//
// Money in / out are dated by the day the money MOVED (paymentEntries.settledAt), not the day the booking was made.
// Deposits held is a snapshot of right now. Deposits kept = forfeited deposits + deposits used to cover penalties.
// Same data as Revenue & Expense: both tabs read /api/reports/money.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// ─────────────────────────────────────────────────────────────────────────────

export default function PaymentsTransactions({ period, year, month, week, day }) {
  const { report, loading, error } = useReport("/api/reports/money", { period, year, month, week, day });
  return (
    <ReportGate report={report} loading={loading} error={error}>
      <PaymentsTransactionsView report={report} />
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
const C_SLATE = "#64748b";      // PayMongo fees
const C_BLUE = "#2563eb";
const C_PURPLE = "#7c3aed";
const C_SKY = "#0ea5e9";       // service fee
const C_PINK = "#ec4899";      // gateway fee
const C_LIME = "#84cc16";      // deposit (and a deposit returned)
const C_ORANGE = "#ea580c";    // refunds
const C_FUCHSIA = "#c026d3";   // discounts returned
const PAGE_SIZE = 7;               // rows per page: the graph and the table under it always show the same rows
const NONE = new Set();
const LABEL_W = "w-44";                   // width of the name column; the grid lines are offset by the same amount
const GAP_LEFT = "11.75rem";              // name column (w-44) + gap-3: where the bars start


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

const IconCheck = ({ className = "w-5 h-5" }) => (<Svg className={className} w={2}><path d="M20 6L9 17l-5-5" /></Svg>);


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
    <div className="mb-3">
      <h2 className="text-base font-bold text-arl-dark">{title}</h2>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/** Small colour key above a graph. An item with `line: true` is drawn as a line instead of a square. */
function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
      {items.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          {s.line ? <span className="w-3 h-0.5" style={{ background: s.color }} /> : <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />} {s.label}
        </span>
      ))}
    </div>
  );
}

const Empty = ({ children }) => <div className="py-10 text-center text-sm text-gray-400">{children}</div>;

// ── pager ───────────────────────────────────────────────────────────────────

function pageList(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const nums = [...new Set([1, count, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= count).sort((x, y) => x - y);
  const out = [];
  nums.forEach((n, i) => { if (i > 0 && n - nums[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

/** "Showing 1–7 of 23" with Prev / page numbers / Next. The buttons only appear when there is more than one page. */
function Pager({ page, pageCount, total, onPage, pageSize = PAGE_SIZE }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "min-w-[1.75rem] h-7 px-2 rounded-lg border text-xs font-semibold transition-colors";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-gray-500">
        Showing <span className="font-semibold text-gray-700">{from}–{to}</span> of <span className="font-semibold text-gray-700">{total}</span>
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1}
            className={`${btn} border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent`}>Prev</button>
          {pageList(page, pageCount).map((n, i) => n === "…" ? (
            <span key={`gap${i}`} className="px-1 text-xs text-gray-400">…</span>
          ) : (
            <button key={n} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
              className={`${btn} ${n === page ? "bg-teal-700 border-teal-700 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{n}</button>
          ))}
          <button onClick={() => onPage(page + 1)} disabled={page >= pageCount}
            className={`${btn} border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent`}>Next</button>
        </div>
      )}
    </div>
  );
}

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

/** The selected row goes to the front of the list (graph and table); the rest keep their sort order. */
function pinSelected(rows, selectedId) {
  const sel = rows.find((r) => r.id === selectedId);
  return sel ? [sel, ...rows.filter((r) => r.id !== selectedId)] : rows;
}

// ── graph: one stacked bar per row ──────────────────────────────────────────

/**
 * Y = the rows, X = the amount (or a count) along the bottom. Each bar is split by `series`; a series is skipped
 * when it is in `hidden` or when its value is 0 or less. Clicking a bar selects it: the table highlights the same
 * row and thin bars appear under it for its children (drawn with `childSeries`, else the same series).
 *   axis   "money" (default: pesos, converted to the chosen currency) or "count"
 * A row's `total` is the bar length; the scale is taken from `scaleMax` so bars compare across pages.
 */
function SplitBars({ rows, scaleMax = 0, series, childSeries, sourceSeries, sourceLabel = "Received from", hidden = NONE, selectedId, onSelect, money, axis = "money", axisLabel }) {
  const { convert, currency, SYMBOLS } = useCurrency();
  const isMoney = axis === "money";
  const sym = isMoney ? (SYMBOLS?.[currency] || "₱") : "";
  const cols = series.filter((s) => !hidden.has(s.key));
  const kidCols = childSeries || cols;
  const show = (v) => (isMoney ? compact(convert(v)) : String(v));

  const maxTotal = Math.max(1, scaleMax, ...rows.map((r) => r.barTotal ?? r.total));
  const step = niceStep(maxTotal);
  const axisMax = Math.max(step, Math.ceil(maxTotal / step) * step);
  const ticks = [];
  for (let t = 0; t <= axisMax; t += step) ticks.push(t);
  const fill = (s) => (s.hatched ? `repeating-linear-gradient(45deg, ${s.color}, ${s.color} 5px, ${s.color}b3 5px, ${s.color}b3 10px)` : s.color);

  const segLabel = (v) => (v / axisMax >= 0.07 ? show(v) : "");   // a number sits inside its segment only when it fits
  const tip = (s, v) => `${s.label}: ${money ? money(v) : v}`;

  return (
    <div>
      <div className="relative">
        <div className="absolute top-0 bottom-0 right-0 pointer-events-none border-l border-gray-300" style={{ left: GAP_LEFT }}>
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${(t / axisMax) * 100}%` }} />
          ))}
        </div>

        <div className="space-y-2 py-1">
          {rows.map((r) => {
            const isSel = r.id === selectedId;
            return (
              <div key={r.id}>
                <button onClick={() => onSelect(isSel ? null : r.id)} aria-pressed={isSel} className="relative w-full flex items-center gap-3 text-left">
                  <span title={r.name} className={`${LABEL_W} shrink-0 text-xs truncate ${isSel ? "font-bold text-teal-700" : "font-semibold text-gray-800"}`}>{r.name}</span>
                  <div className={`flex-1 flex h-7 overflow-hidden rounded-r-lg transition-shadow ${isSel ? "ring-2 ring-teal-600 shadow-md" : selectedId ? "opacity-50" : ""}`}>
                    {cols.map((s) => r[s.key] > 0 && (
                      <div key={s.key} title={tip(s, r[s.key])} className="h-full flex items-center justify-center text-xs font-semibold text-white overflow-hidden"
                        style={{ width: `${(r[s.key] / axisMax) * 100}%`, background: fill(s) }}>
                        {segLabel(r[s.key])}
                      </div>
                    ))}
                  </div>
                </button>

                {sourceSeries && (r.online > 0 || r.inPerson > 0) && (
                  <div className={`flex items-center gap-3 mt-0.5 ${selectedId && !isSel ? "opacity-50" : ""}`}>
                    <span className={`${LABEL_W} shrink-0 pl-4 text-[10px] text-gray-400`}>{sourceLabel}</span>
                    <div className="flex-1 flex h-2.5 overflow-hidden rounded-r-md">
                      {sourceSeries.map((s) => r[s.key] > 0 && (
                        <div key={s.key} title={tip(s, r[s.key])} style={{ width: `${(r[s.key] / axisMax) * 100}%`, background: s.color }} />
                      ))}
                    </div>
                  </div>
                )}

                {isSel && r.children?.length > 0 && (
                  <div className="relative mt-1.5 mb-1 space-y-1">
                    {r.children.map((c) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span title={c.name} className={`${LABEL_W} shrink-0 pl-4 text-[11px] truncate text-gray-500`}>↳ {c.name}</span>
                        <div className="flex-1 flex h-4 overflow-hidden rounded-r-md">
                          {kidCols.map((s) => c[s.key] > 0 && (
                            <div key={s.key} title={tip(s, c[s.key])} className="h-full flex items-center justify-center text-[10px] font-semibold text-white overflow-hidden"
                              style={{ width: `${Math.min(100, (c[s.key] / axisMax) * 100)}%`, background: fill(s), opacity: 0.75 }}>
                              {segLabel(c[s.key])}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 border-t border-gray-300">
        <div className={`${LABEL_W} shrink-0`} />
        <div className="relative flex-1 h-5">
          {ticks.map((t) => (
            <span key={t} className="absolute top-1 -translate-x-1/2 text-[10px] font-medium text-gray-400" style={{ left: `${(t / axisMax) * 100}%` }}>{sym}{show(t)}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div className={`${LABEL_W} shrink-0`} />
        <p className="flex-1 text-center text-[11px] text-gray-400">{axisLabel || (isMoney ? `Amount (${currency})` : "Number")}</p>
      </div>
    </div>
  );
}

// ── table under the graph ───────────────────────────────────────────────────

/**
 * Always shown under its SplitBars with the same rows. A row opens (arrow) to show its `children`.
 *   columns   [{ key, label, color?, fmt?(value, row) }]   number columns after the name; hidden keys are left out
 *   total     { key, label, fmt?(value, row) }             the last column, drawn as a pill (red when negative)
 *   childNote(child)   replaces a child's number columns with one line of text
 *   emptyChild         text shown when an opened row has no children
 * A row with no children (and no emptyChild) has no arrow.
 */
function SplitTable({ rows, nameLabel, columns, total, hidden = NONE, sort, onSort, selectedId, onSelect, childNote, emptyChild }) {
  const [open, setOpen] = useState(() => new Set());
  const cols = columns.filter((c) => !hidden.has(c.key));
  const canOpen = (r) => (r.children && r.children.length > 0) || !!emptyChild;

  const toggleOpen = (r) => {
    if (r.id === selectedId) { onSelect(null); return; }          // a selected row is always open: the arrow clears it
    setOpen((prev) => { const next = new Set(prev); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next; });
  };

  const head = (key, label, align = "right") => (
    <th key={key} className={`px-3 py-2.5 font-semibold text-${align} whitespace-nowrap`}>
      <button onClick={() => onSort({ key, dir: sort.key === key && sort.dir === "desc" ? "asc" : key === "name" ? "asc" : "desc" })} className="inline-flex items-center gap-1 hover:text-gray-700">
        {label}
        <span className={sort.key === key ? "text-teal-700" : "text-gray-300"}>{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  const cell = (c, row, child) => {
    const v = row[c.key];
    const empty = v === 0 || v === undefined || v === null;
    const color = empty ? undefined : v < 0 ? C_RED : c.color;
    return (
      <td key={c.key} className={`px-3 ${child ? "py-2" : "py-2.5"} text-right whitespace-nowrap ${empty ? "text-gray-300" : color ? (child ? "font-semibold" : "font-bold") : "text-gray-600"}`} style={color ? { color } : undefined}>
        {empty ? "–" : c.fmt ? c.fmt(v, row) : v}
      </td>
    );
  };

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-400">
          <tr>
            {head("name", nameLabel, "left")}
            {cols.map((c) => head(c.key, c.label))}
            {head(total.key, total.label)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSel = r.id === selectedId;
            const expandable = canOpen(r);
            const isOpen = expandable && (isSel || open.has(r.id));
            const tv = r[total.key] || 0;
            return (
              <Fragment key={r.id}>
                <tr onClick={() => onSelect(isSel ? null : r.id)} className={`border-t border-gray-50 cursor-pointer ${isSel ? "bg-teal-50" : "hover:bg-gray-50/60"}`}>
                  <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${isSel ? "text-teal-700" : "text-gray-800"}`} style={isSel ? { boxShadow: "inset 3px 0 0 #0f766e" } : undefined}>
                    <span className="inline-flex items-center gap-1.5">
                      {expandable ? (
                        <button type="button" aria-label={isOpen ? `Close ${r.name}` : `Open ${r.name}`} aria-expanded={isOpen}
                          onClick={(e) => { e.stopPropagation(); toggleOpen(r); }} className="w-4 text-gray-400 hover:text-gray-700">
                          {isOpen ? "▾" : "▸"}
                        </button>
                      ) : <span className="w-4" />}
                      {r.name}
                    </span>
                  </td>
                  {cols.map((c) => cell(c, r, false))}
                  <td className="px-3 py-2.5 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-white font-bold text-center whitespace-nowrap ${tv < 0 ? "bg-red-500" : "bg-teal-700"}`}>
                      {total.fmt ? total.fmt(tv, r) : tv}
                    </span>
                  </td>
                </tr>

                {isOpen && (r.children || []).length === 0 && emptyChild && (
                  <tr className="border-t border-gray-50 bg-gray-50/60">
                    <td colSpan={cols.length + 2} className="py-2 pl-9 pr-3 text-gray-400 italic">{emptyChild}</td>
                  </tr>
                )}

                {isOpen && (r.children || []).map((c) => (
                  <tr key={`${r.id}:${c.id}`} className="border-t border-gray-50 bg-gray-50/60">
                    <td className="py-2 pl-9 pr-3 text-gray-600 whitespace-nowrap">{c.name}</td>
                    {childNote ? (
                      <td colSpan={cols.length + 1} className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{childNote(c)}</td>
                    ) : (
                      <>
                        {cols.map((col) => cell(col, c, true))}
                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${(c[total.key] || 0) < 0 ? "text-red-500" : "text-gray-600"}`}>
                          {total.fmt ? total.fmt(c[total.key] || 0, c) : c[total.key]}
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {isOpen && r.childrenMore > 0 && (
                  <tr className="border-t border-gray-50 bg-gray-50/60">
                    <td colSpan={cols.length + 2} className="py-2 pl-9 pr-3 text-gray-400 italic">and {r.childrenMore} more</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
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
// unpaid / awaiting amounts have no channel yet, so they are left out.
const FILTER_HIDE = new Set(["online", "inPerson", "unpaid", "expected"]);
const OUT_KIND_KEY = { "Refund": "refund", "Deposit return": "depositReturn", "Discount return": "discountReturn" };

// Money out is laid out like Money in: a row per method, split by the reason the money left. The thin bar under it is the
// same money by where it went (SRC_SERIES, shared with Money in).
const OUT_SERIES = [
  { key: "refund",         label: "Refunds",                 color: C_ORANGE },
  { key: "depositReturn",  label: "Deposits returned",       color: C_LIME },
  { key: "discountReturn", label: "Discounts returned",      color: C_FUCHSIA },
  { key: "expected",       label: "Awaiting payout",         color: C_RED, hatched: true },
];

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

function PaymentsTransactionsView({ report }) {
  const { fmt } = useCurrency();
  const cards = report.cards || {};
  const methods = useMemo(() => report.methods || [], [report.methods]);
  const unpaid = report.unpaid || [];
  const outflows = useMemo(() => report.outflows || [], [report.outflows]);

  // money in
  const [inSort, setInSort] = useState({ key: "total", dir: "desc" });
  const [inSel, setInSel] = useState(null);
  const [inPage, setInPage] = useState(1);
  // PayMongo fees
  const fees = report.fees || { rows: [], total: 0, unrecorded: 0, gatewayReceived: 0, bookingFees: 0 };
  // unpaid
  const [unpaidPage, setUnpaidPage] = useState(1);
  // money out
  const [outSort, setOutSort] = useState({ key: "total", dir: "desc" });
  const [outSel, setOutSel] = useState(null);
  const [outPage, setOutPage] = useState(1);
  // channel: overall (online + in person side by side) | online only | in person only. Applies to Money in and Money out.
  const [channel, setChannel] = useState("all");
  const byChannel = channel !== "all";
  const hide = byChannel ? FILTER_HIDE : NONE;
  const chName = channel === "online" ? "Online" : channel === "inPerson" ? "In person" : "";
  const chWord = channel === "online" ? " online" : channel === "inPerson" ? " in person" : "";
  useEffect(() => { setInPage(1); setOutPage(1); setUnpaidPage(1); }, [report]);

  // ── channel filter ──
  // Money in: each method already carries one child per channel with the full split, so a channel is just that child.
  const inScoped = useMemo(() => {
    if (channel === "all") return methods;
    return methods.map((m) => {
      const kid = (m.children || []).find((c) => c[channel] > 0);
      return kid ? { ...m, ...kid, id: m.id, name: m.name, unpaid: 0, barTotal: kid.total, children: [] } : null;
    }).filter(Boolean);
  }, [methods, channel]);
  // Money out: keep the transactions that went through the channel and rebuild each method's numbers from them.
  // "Awaiting payout" has no channel yet, so it drops out.
  const outScoped = useMemo(() => {
    if (channel === "all") return outflows;
    return outflows.filter((o) => o.id !== "awaiting").map((o) => {
      const kids = o.children.filter((c) => c[channel] > 0);
      if (!kids.length) return null;
      const row = { ...o, count: kids.length, refund: 0, depositReturn: 0, discountReturn: 0, online: 0, inPerson: 0, total: 0, children: kids };
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
  const SHOW_TX = 10;   // transactions listed under an opened Money out row (the rest are counted as "and N more")
  const outRows = useMemo(() => sortRows(
    outScoped.map((o) => ({ ...o, children: o.children.slice(0, SHOW_TX), childrenMore: Math.max(0, o.children.length - SHOW_TX) })),
    outSort,
  ), [outScoped, outSort]);
  const inSelId = inRows.some((r) => r.id === inSel) ? inSel : null;
  const outSelId = outRows.some((r) => r.id === outSel) ? outSel : null;
  const inShown = useMemo(() => pinSelected(inRows, inSelId), [inRows, inSelId]);
  const outShown = useMemo(() => pinSelected(outRows, outSelId), [outRows, outSelId]);
  const page = (list, p) => {
    const count = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const no = Math.min(p, count);
    return { count, no, rows: list.slice((no - 1) * PAGE_SIZE, no * PAGE_SIZE) };
  };
  const inP = page(inShown, inPage);
  const outP = page(outShown, outPage);

  // ── unpaid ──
  const UNPAID_PAGE = 7;
  const unpaidCount = Math.max(1, Math.ceil(unpaid.length / UNPAID_PAGE));
  const unpaidNo = Math.min(unpaidPage, unpaidCount);
  const unpaidRows = unpaid.slice((unpaidNo - 1) * UNPAID_PAGE, unpaidNo * UNPAID_PAGE);

  const inColumns = [
    { key: "count",     label: "Payments" },
    { key: "rental",    label: "Rental",    color: C_TEAL,   fmt },
    { key: "service",   label: "Service",   color: C_SKY,    fmt },
    { key: "gateway",   label: "Gateway",   color: C_PINK,   fmt },
    { key: "deposit",   label: "Deposit",   color: C_LIME,   fmt },
    { key: "penalties", label: "Penalties", color: C_INDIGO, fmt },
    { key: "unpaid",    label: "Unpaid",    color: C_AMBER,  fmt },
    { key: "online",    label: "Online",    color: C_BLUE,   fmt },
    { key: "inPerson",  label: "In person", color: C_PURPLE, fmt },
  ];
  const outColumns = [
    { key: "count",          label: "Transactions" },
    { key: "refund",         label: "Refunds",   color: C_ORANGE,  fmt },
    { key: "depositReturn",  label: "Deposits",  color: C_LIME,    fmt },
    { key: "discountReturn", label: "Discounts", color: C_FUCHSIA, fmt },
    { key: "online",         label: "Online",    color: C_BLUE,    fmt },
    { key: "inPerson",       label: "In person", color: C_PURPLE,  fmt },
  ];
  const outTotalFmt = (v, r) => (r.id === "awaiting" ? fmt(r.expected) : fmt(v));   // the awaiting row has nothing paid out yet: its pill shows what is waiting

  const moneyInValue = byChannel ? inRows.reduce((sum, r) => sum + r.total, 0) : (cards.moneyIn ?? 0);
  const moneyOutValue = byChannel ? outRows.reduce((sum, r) => sum + r.total, 0) : (cards.returned ?? 0);

  return (
    <div className="space-y-4">

      <Card>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5 p-4">
          <StatCard title={byChannel ? `Money in · ${chName}` : "Money in"} value={fmt(moneyInValue)} Icon={IconArrowDown} color="bg-green-600 text-white" />
          <StatCard title={byChannel ? `Money out · ${chName}` : "Money out"} value={fmt(moneyOutValue)} Icon={IconArrowUp} color="bg-red-500 text-white" />
          <StatCard title="Unpaid balances" value={fmt(cards.unpaid ?? 0)} Icon={IconWarning} color="bg-amber-500 text-white" />
          <StatCard title="Deposits held" value={fmt(cards.depositsHeld ?? 0)} Icon={IconLock} color="bg-blue-600 text-white" />
          <StatCard title="Deposits kept" value={fmt(cards.depositsKept ?? 0)} Icon={IconCheck} color="bg-teal-600 text-white" />
        </div>

        {/* Channel dropdown. Overall shows online and in person side by side (thin bar + columns); the others narrow Money in and Money out. */}
        <div className="border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <label htmlFor="channel-filter" className="text-gray-400 font-semibold">Channel</label>
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
                Applies to Money in and Money out. Unpaid balances, deposits and PayMongo fees are not split by channel, and Awaiting payout is hidden because it has no channel yet.
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Money in */}
      <Card className="p-4">
        <SectionHead title="Money in" hint="What was received in this period, by how it was paid and what it was for. The thin bar under each method is the same money by where it was received, online or in person. The deposit is refundable, so it is money you hold for the customer, not income. The gateway fee is what customers paid for paying online (PayMongo's cut is under Money out, fees paid). Bookings only part-paid are split in proportion. The striped orange part is the unpaid balance still expected under that method. Open a method to split it into online and in person." />
        {inRows.length === 0 ? (
          <Empty>No money was received{chWord} in {report.label}.</Empty>
        ) : (
          <>
            <Legend items={[...IN_SERIES, ...SRC_SERIES].filter((x) => !hide.has(x.key))} />
            <SplitBars sourceLabel="Received from" rows={inP.rows} scaleMax={Math.max(0, ...inRows.map((r) => r.barTotal ?? r.total))} series={IN_SERIES} sourceSeries={byChannel ? undefined : SRC_SERIES} hidden={hide}
              selectedId={inSelId} onSelect={(id) => { setInSel(id); setInPage(1); }} money={fmt} />
            <Pager page={inP.no} pageCount={inP.count} total={inShown.length} onPage={setInPage} />
            <SplitTable rows={inP.rows} nameLabel="Method" columns={inColumns} hidden={hide} total={{ key: "total", label: "Total", fmt }}
              sort={inSort} onSort={(s) => { setInSort(s); setInPage(1); }} selectedId={inSelId}
              onSelect={(id) => { setInSel(id); setInPage(1); }} />
          </>
        )}
      </Card>

      {/* Money out */}
      <Card className="p-4">
        <SectionHead title="Money out" hint="What went back to customers in this period, by the day it went out and the method it went through: refunds, deposits returned and discounts returned. The thin bar under each method is the same money by where it went, online or in person. Awaiting payout is its own row (striped red): approved refunds not sent yet, and deposit or discount returns PayMongo has not confirmed, as of today. Open a row to see each one. A returned deposit is money held for the customer, not a loss." />
        {outRows.length === 0 ? (
          <Empty>No money went out{chWord} in {report.label}.</Empty>
        ) : (
          <>
            <Legend items={[...OUT_SERIES, ...SRC_SERIES].filter((x) => !hide.has(x.key))} />
            <SplitBars sourceLabel="Paid out through" rows={outP.rows} scaleMax={Math.max(0, ...outRows.map((r) => r.barTotal ?? r.total))} series={OUT_SERIES} sourceSeries={byChannel ? undefined : SRC_SERIES} hidden={hide}
              selectedId={outSelId} onSelect={(id) => { setOutSel(id); setOutPage(1); }} money={fmt} />
            <Pager page={outP.no} pageCount={outP.count} total={outShown.length} onPage={setOutPage} />
            <SplitTable rows={outP.rows} nameLabel="Method" columns={outColumns} hidden={hide} total={{ key: "total", label: "Total", fmt: outTotalFmt }}
              sort={outSort} onSort={(s) => { setOutSort(s); setOutPage(1); }} selectedId={outSelId}
              onSelect={(id) => { setOutSel(id); setOutPage(1); }}
              childNote={(c) => c.note ? (
                <>
                  {c.note}{" · "}<span className="font-semibold text-gray-700">{fmt(c.expected)}</span>
                </>
              ) : (
                <>
                  {[c.date ? fmtDate(c.date) : null, c.method !== "—" ? c.method : null, c.kindLabel || null, c.online > 0 ? "Online" : "In person"].filter(Boolean).join(" · ")}
                  {" · "}<span className="font-semibold text-gray-700">{fmt(c.total)}</span>
                </>
              )} />
            {fees.total > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                Not counted above: PayMongo kept <span className="font-semibold text-gray-700">{fmt(fees.total)}</span> in fees on the online payments received in this period. That is a cost to you, not money handed back.
              </p>
            )}
            {fees.gatewayReceived > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                On bookings: customers paid <span className="font-semibold text-gray-700">{fmt(fees.gatewayReceived)}</span> in gateway fees, PayMongo kept{" "}
                <span className="font-semibold text-gray-700">{fmt(fees.bookingFees)}</span>, leaving{" "}
                <span className={`font-semibold ${fees.gatewayReceived - fees.bookingFees < 0 ? "text-red-500" : "text-green-600"}`}>{fmt(fees.gatewayReceived - fees.bookingFees)}</span>.
              </p>
            )}
            {fees.unrecorded > 0 && (
              <p className="mt-2 text-xs text-amber-600">{fees.unrecorded} online payment{fees.unrecorded === 1 ? "" : "s"} in this period {fees.unrecorded === 1 ? "has" : "have"} no PayMongo fee recorded yet, so {fees.unrecorded === 1 ? "it is" : "they are"} not counted here.</p>
            )}
          </>
        )}
      </Card>

      {/* Unpaid balances */}
      <Card className="p-4">
        <SectionHead title="Unpaid balances" hint="Payments made in this period that still owe money, biggest first. Pending = nothing received yet; Partial = deposit received, balance owed." />
        {unpaid.length === 0 ? (
          <Empty>Nothing is owed on payments made in {report.label}.</Empty>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-400">
                  <tr>
                    {["Booking", "Customer", "Vehicle", "Status", "Trip date", "Total", "Paid", "Balance"].map((h, i) => (
                      <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i < 5 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unpaidRows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                      <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{r.bookingID}</td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.customer}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.car}</td>
                      <td className="px-3 py-2.5"><Stage stage={r.stage} /></td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(r.tripStart)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{fmt(r.total)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{r.paid ? fmt(r.paid) : "–"}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-red-500 text-white font-bold">{fmt(r.balance)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={unpaidNo} pageCount={unpaidCount} total={unpaid.length} onPage={setUnpaidPage} pageSize={UNPAID_PAGE} />
          </>
        )}
      </Card>

    </div>
  );
}