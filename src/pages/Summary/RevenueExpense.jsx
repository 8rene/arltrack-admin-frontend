import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../../context/CurrencyContext";

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE & EXPENSE: "Did we make money?"
//
//   Rentals     money received for rentals (deposit + balance), by the day it was received
//   Penalties   Confirmed penalties that were paid in store or online
//   Returned    refunds + security deposits handed back + discount returns
//   Maintenance Completed maintenance only
//   PayMongo fees  what PayMongo kept on the online payments received (only fees already recorded)
//   Net         Rentals + Penalties - Returned - Maintenance - PayMongo fees
//               (net of the expenses the system records: other costs such as fuel or driver pay are not tracked)
//
// The booking amount includes the refundable security deposit, so a deposit that is still held is not revenue yet:
// it only shows up here when it is kept (a penalty it covered, or a forfeited deposit) because what went back is
// subtracted. Same data as Payments & Transactions: both tabs read /api/reports/money.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// ─────────────────────────────────────────────────────────────────────────────

export default function RevenueExpense({ period, year, month, week, day }) {
  const { report, loading, error } = useReport("/api/reports/money", { period, year, month, week, day });
  return (
    <ReportGate report={report} loading={loading} error={error}>
      <RevenueExpenseView report={report} />
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
function SplitBars({ rows, scaleMax = 0, series, childSeries, hidden = NONE, selectedId, onSelect, money, axis = "money", axisLabel }) {
  const { convert, currency, SYMBOLS } = useCurrency();
  const isMoney = axis === "money";
  const sym = isMoney ? (SYMBOLS?.[currency] || "₱") : "";
  const cols = series.filter((s) => !hidden.has(s.key));
  const kidCols = childSeries || cols;
  const show = (v) => (isMoney ? compact(convert(v)) : String(v));

  const maxTotal = Math.max(1, scaleMax, ...rows.map((r) => r.total));
  const step = niceStep(maxTotal);
  const axisMax = Math.max(step, Math.ceil(maxTotal / step) * step);
  const ticks = [];
  for (let t = 0; t <= axisMax; t += step) ticks.push(t);

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
                        style={{ width: `${(r[s.key] / axisMax) * 100}%`, background: s.color }}>
                        {segLabel(r[s.key])}
                      </div>
                    ))}
                  </div>
                </button>

                {isSel && r.children?.length > 0 && (
                  <div className="relative mt-1.5 mb-1 space-y-1">
                    {r.children.map((c) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span title={c.name} className={`${LABEL_W} shrink-0 pl-4 text-[11px] truncate text-gray-500`}>↳ {c.name}</span>
                        <div className="flex-1 flex h-4 overflow-hidden rounded-r-md">
                          {kidCols.map((s) => c[s.key] > 0 && (
                            <div key={s.key} title={tip(s, c[s.key])} className="h-full flex items-center justify-center text-[10px] font-semibold text-white overflow-hidden"
                              style={{ width: `${Math.min(100, (c[s.key] / axisMax) * 100)}%`, background: s.color, opacity: 0.75 }}>
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
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// what a car's bar is made of: maintenance first (red), then what was left of its revenue (green)
const CAR_SERIES = [
  { key: "maintenance", label: "Maintenance",   color: C_RED },
  { key: "fees",        label: "PayMongo fees", color: C_PURPLE },
  { key: "profit",      label: "Profit",        color: C_GREEN },
];
const CAR_CHILD_SERIES = [
  { key: "revenue",     label: "Revenue",       color: C_GREEN },
  { key: "maintenance", label: "Maintenance",   color: C_RED },
  { key: "fees",        label: "PayMongo fees", color: C_PURPLE },
];

// ── graph: revenue against maintenance for every day / month, with net on top ───

/**
 * Two bars per day (or month): green = revenue, red = expenses (maintenance + PayMongo fees). The dark line is net. A bar below the zero line
 * means more went back to customers than came in that day.
 */
function IncomeExpenseChart({ series }) {
  const { convert, currency, SYMBOLS, fmt } = useCurrency();
  const sym = SYMBOLS?.[currency] || "₱";
  const W = 760, H = 250, L = 56, R = 10, T = 12, B = 28;

  const rawMax = Math.max(0, ...series.map((b) => Math.max(b.revenue, b.expenses ?? b.maintenance, b.net)));
  const rawMin = Math.min(0, ...series.map((b) => Math.min(b.revenue, b.net)));
  const step = niceStep(rawMax - rawMin);
  const bottom = Math.floor(rawMin / step) * step;
  let top = Math.ceil(rawMax / step) * step;
  if (top === bottom) top = bottom + step;
  const y = (v) => T + ((top - v) / (top - bottom)) * (H - T - B);
  const ticks = [];
  for (let t = bottom; t <= top + 1e-9; t += step) ticks.push(t);

  const n = series.length;
  const gw = (W - L - R) / n;
  const bw = Math.max(3, Math.min(16, gw * 0.32));
  const cx = (i) => L + gw * i + gw / 2;
  const every = Math.ceil(n / 15);   // label every Nth bucket so a month of days stays readable

  const bar = (x, v, color) => {
    const y0 = y(0), y1 = y(v);
    return v === 0 ? null : <rect x={x} y={Math.min(y0, y1)} width={bw} height={Math.max(1, Math.abs(y1 - y0))} rx="1.5" fill={color} />;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Revenue against expenses over the period">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#9ca3af" : "#f3f4f6"} strokeWidth={t === 0 ? 1.25 : 1} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#9ca3af">{sym}{compact(convert(t))}</text>
        </g>
      ))}

      {series.map((b, i) => (
        <g key={b.key}>
          {bar(cx(i) - bw - 1, b.revenue, C_GREEN)}
          {bar(cx(i) + 1, b.expenses ?? b.maintenance, C_RED)}
          {i % every === 0 && <text x={cx(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#9ca3af">{b.short}</text>}
          <rect x={L + gw * i} y={T} width={gw} height={H - T - B} fill="transparent">
            <title>{`${b.label}\nRevenue: ${fmt(b.revenue)}\nMaintenance: ${fmt(b.maintenance)}\nPayMongo fees: ${fmt(b.fees || 0)}\nNet: ${fmt(b.net)}`}</title>
          </rect>
        </g>
      ))}

      {n > 1 && <polyline points={series.map((b, i) => `${cx(i)},${y(b.net)}`).join(" ")} fill="none" stroke="#334155" strokeWidth="1.5" strokeLinejoin="round" />}
      {series.map((b, i) => <circle key={`n${b.key}`} cx={cx(i)} cy={y(b.net)} r="2.5" fill="#334155" />)}
    </svg>
  );
}

// ── table under the graph: one row per day / month that had activity ────────────

function PeriodTable({ series }) {
  const { fmt } = useCurrency();
  const [page, setPage] = useState(1);
  const PAGE = 10;
  const rows = useMemo(() => series.filter((b) => b.rentals || b.penalties || b.returned || b.maintenance || b.fees), [series]);
  useEffect(() => { setPage(1); }, [series]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageNo = Math.min(page, pages);
  const shown = rows.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const sum = (k) => rows.reduce((s, b) => s + (b[k] || 0), 0);
  const num = (v, color) => (v ? <span className="font-semibold" style={color ? { color } : undefined}>{fmt(v)}</span> : <span className="text-gray-300">–</span>);

  if (rows.length === 0) return null;
  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-400">
            <tr>
              {["Period", "Rentals", "Penalties", "Returned", "Maintenance", "PayMongo fees", "Net"].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.key} className="border-t border-gray-50 hover:bg-gray-50/60">
                <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{b.label}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">{num(b.rentals, C_GREEN)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">{num(b.penalties, C_GREEN)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">{num(b.returned, C_RED)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">{num(b.maintenance, C_RED)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">{num(b.fees, C_PURPLE)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-white font-bold whitespace-nowrap ${b.net < 0 ? "bg-red-500" : "bg-teal-700"}`}>{fmt(b.net)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50/70">
            <tr>
              <td className="px-3 py-2.5 font-bold text-gray-800">Total</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">{fmt(sum("rentals"))}</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">{fmt(sum("penalties"))}</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">{fmt(sum("returned"))}</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">{fmt(sum("maintenance"))}</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">{fmt(sum("fees"))}</td>
              <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${sum("net") < 0 ? "text-red-500" : "text-gray-800"}`}>{fmt(sum("net"))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Pager page={pageNo} pageCount={pages} total={rows.length} onPage={setPage} pageSize={PAGE} />
    </>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────

function RevenueExpenseView({ report }) {
  const { fmt } = useCurrency();
  const [sort, setSort] = useState({ key: "revenue", dir: "desc" });
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);

  const cards = report.cards || {};
  const series = useMemo(() => report.series || [], [report]);

  // bar length = revenue when the car earned more than it cost, otherwise the maintenance cost
  const rows = useMemo(() => sortRows(
    (report.cars || []).map((c) => {
      const fees = c.fees || 0;
      const profit = Math.max(0, c.revenue - c.maintenance - fees);
      return { ...c, fees, profit, total: c.maintenance + fees + profit };
    }).filter((c) => c.revenue !== 0 || c.maintenance !== 0 || c.fees),
    sort,
  ), [report, sort]);

  const selId = rows.some((r) => r.id === selected) ? selected : null;
  const shown = useMemo(() => pinSelected(rows, selId), [rows, selId]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageNo = Math.min(page, pages);
  const pageRows = shown.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  const scaleMax = Math.max(0, ...rows.map((r) => r.total));

  useEffect(() => { setPage(1); }, [report]);

  const nothing = !cards.moneyIn && !cards.returned && !cards.maintenance && !cards.gatewayFees;
  const net = cards.net ?? 0;
  const columns = [
    { key: "bookings",    label: "Bookings" },
    { key: "revenue",     label: "Revenue",     color: C_GREEN, fmt: fmt },
    { key: "maintenance", label: "Maintenance", color: C_RED,   fmt: fmt },
    { key: "fees",        label: "PayMongo fees", color: C_PURPLE, fmt: fmt },
  ];

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
      </Card>

      {nothing ? (
        <Card><Empty>No money moved and no maintenance was completed in {report.label}. Try another period.</Empty></Card>
      ) : (
        <>
          <Card className="p-4">
            <SectionHead
              title="Revenue and maintenance"
              hint="Revenue is what came in minus what went back to customers (refunds and returned deposits). Expenses are completed maintenance and the PayMongo fees on online payments. The line is net after those expenses; other costs (fuel, driver pay) are not recorded here."
            />
            <Legend items={[{ key: "r", label: "Revenue", color: C_GREEN }, { key: "m", label: "Expenses (maintenance + PayMongo fees)", color: C_RED }, { key: "n", label: "Net", color: "#334155", line: true }]} />
            <IncomeExpenseChart series={series} />
            {cards.gatewayFeesUnrecorded > 0 && (
              <p className="mt-2 text-xs text-amber-600">{cards.gatewayFeesUnrecorded} online payment{cards.gatewayFeesUnrecorded === 1 ? "" : "s"} in this period {cards.gatewayFeesUnrecorded === 1 ? "has" : "have"} no PayMongo fee recorded yet, so the fees and Net are slightly off until {cards.gatewayFeesUnrecorded === 1 ? "it is" : "they are"} filled in.</p>
            )}
            <PeriodTable series={series} />
          </Card>

          <Card className="p-4">
            <SectionHead
              title="Vehicles"
              hint="Bar length is what the car brought in: red went to maintenance, purple to PayMongo fees, green is what was left. A car that cost more than it earned shows no green. Open a car to see its bookings and repairs."
            />
            {rows.length === 0 ? (
              <Empty>No bookings or maintenance by vehicle in {report.label}.</Empty>
            ) : (
              <>
                <Legend items={CAR_SERIES} />
                <SplitBars rows={pageRows} scaleMax={scaleMax} series={CAR_SERIES} childSeries={CAR_CHILD_SERIES}
                  selectedId={selId} onSelect={(id) => { setSelected(id); setPage(1); }} money={fmt} />
                <Pager page={pageNo} pageCount={pages} total={shown.length} onPage={setPage} />
                <SplitTable rows={pageRows} nameLabel="Vehicle" columns={columns} total={{ key: "net", label: "Net", fmt }}
                  sort={sort} onSort={(s) => { setSort(s); setPage(1); }} selectedId={selId}
                  onSelect={(id) => { setSelected(id); setPage(1); }} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}