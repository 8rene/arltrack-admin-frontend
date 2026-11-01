import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCurrency } from "../../context/CurrencyContext";

// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE & PENALTIES
//
// Questions this tab answers:  "What did maintenance cost?"  and  "Who was penalized, and did it get paid?"
//
// Same layout as Rentals & Customers: stat cards on top, then a graph with its table right under it, for customers
// and for vehicles. Each bar / row is split in two:
//     Customers   Paid | Unpaid                      (penalties charged to that customer)
//     Vehicles    Recovered | Not recovered          (maintenance cost of that car)
// A customer row opens to show the cars they were penalized on; a car row opens to show who was penalized on it.
//
// Only Confirmed penalties count. "Recovered" = penalties actually collected on that car in the period, capped at its
// maintenance cost; it does not link a specific penalty to a specific repair.
//
// Receives the selected period from Reports.jsx: { period, year, month, week, day }.
// Needs from /api/reports/maintenance-penalties:
//   cards        { totalMaintenance, pendingCustomers }
//   cars         [{ carID, name, jobs, total, recovered, absorbed }]
//   penaltyRows  [{ userID, carID, customer, car, amount, paid, pending }]   one per Confirmed penalty
// ─────────────────────────────────────────────────────────────────────────────

export default function MaintenancePenalties({ period, year, month, week, day }) {
  const { report, loading, error } = useMaintenanceReport({ period, year, month, week, day });
  return (
    <ReportGate report={report} loading={loading} error={error}>
      <MaintenancePenaltiesView report={report} />
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

const C_GREEN = "#16a34a", C_RED = "#ef4444", C_TEAL = "#0f766e";

const CUSTOMER_SERIES = [
  { key: "paid",   label: "Paid",   color: C_GREEN },
  { key: "unpaid", label: "Unpaid", color: C_RED },
];
const CAR_SERIES = [
  { key: "recovered", label: "Recovered",     color: C_GREEN },
  { key: "absorbed",  label: "Not recovered", color: C_RED },
];
// A car's thin bars show each customer's penalties charged on that car (one colour, the split is in the table).
const CAR_CHILD_SERIES = [{ key: "total", label: "Penalties charged", color: C_TEAL }];

const PAGE_SIZE = 7;             // rows per page: the graph and the table under it always show the same rows
const LABEL_W = "w-44";          // width of the name column; the grid lines are offset by the same amount
const GAP_LEFT = "11.75rem";     // name column (w-44) + gap-3: where the bars start

// ── grouping + sorting ──────────────────────────────────────────────────────

/**
 * One row per customer with paid / unpaid amounts, plus `children`: the same split per car they were penalized on.
 * A hidden series is left out of every amount and total; a penalty that is left with nothing to show is skipped.
 */
function buildCustomerRows(penaltyRows, hidden) {
  const map = new Map();
  const add = (target, p) => {
    if (!hidden.has("paid")) target.paid += p.paid;
    if (!hidden.has("unpaid")) target.unpaid += p.pending;
    target.total = target.paid + target.unpaid;
    target.count += 1;
  };
  for (const p of penaltyRows) {
    const shown = (hidden.has("paid") ? 0 : p.paid) + (hidden.has("unpaid") ? 0 : p.pending);
    if (shown <= 0) continue;

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
function buildCarRows(cars, penaltyRows, hidden) {
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
    .map((c) => {
      const recovered = hidden.has("recovered") ? 0 : c.recovered;
      const absorbed = hidden.has("absorbed") ? 0 : c.absorbed;
      return {
        id: c.carID || c.name,
        name: c.name,
        recovered, absorbed,
        total: recovered + absorbed,
        count: c.jobs ?? 0,
        children: [...(byCar.get(c.carID)?.values() || [])].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
      };
    })
    .filter((r) => r.total > 0);
}

function sortRows(rows, { key, dir }) {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name) * sign;
    return (a[key] - b[key]) * sign || a.name.localeCompare(b.name);
  });
}

/** The selected row goes to the front of the list (graph and table); the rest keep their sort order. */
function pinSelected(rows, selectedId) {
  const sel = rows.find((r) => r.id === selectedId);
  return sel ? [sel, ...rows.filter((r) => r.id !== selectedId)] : rows;
}

// ── small pieces ────────────────────────────────────────────────────────────

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>
);

// Same stat card as the Rentals tab: colored icon square on the left, number and title on the right.
function StatCard({ title, value, Icon, color, onClick, off = false }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? !off : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-2xl border border-transparent bg-gray-50 p-4 flex items-center gap-3 transition-all ${
        clickable ? "cursor-pointer hover:bg-gray-100" : ""
      } ${off ? "opacity-50" : ""}`}
    >
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

/** Page numbers to show: all of them when there are few, otherwise first, last and the ones around the current page. */
function pageList(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const nums = [...new Set([1, count, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= count).sort((x, y) => x - y);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/** "Showing 1–7 of 23" with Previous / page numbers / Next. The buttons only appear when there is more than one page. */
function Pager({ page, pageCount, total, onPage }) {
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
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

/** Small colour key above a graph. */
function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
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

/** Section heading: what the card is, then one plain line saying what it answers. */
function SectionHead({ title, hint }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-bold text-arl-dark">{title}</h2>
      <p className="text-xs text-gray-400">{hint}</p>
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

// ── graph: one stacked bar per customer / car, split in two ─────────────────

/**
 * Y = the customers (or cars), X = the amount along the bottom. Each bar is split by `series`.
 * Clicking a bar selects it: the table highlights the same row, and thin bars appear under it for its cars
 * (or its customers).
 */
function SplitBars({ rows, scaleMax = 0, series, childSeries, hidden, selectedId, onSelect, money }) {
  const { convert, currency, SYMBOLS } = useCurrency();
  const sym = SYMBOLS?.[currency] || "₱";
  const cols = series.filter((s) => !hidden.has(s.key));
  const kidCols = childSeries || cols;

  const maxTotal = Math.max(1, scaleMax, ...rows.map((r) => r.total));   // scale from every page, so bars compare across pages
  const step = niceStep(maxTotal);
  const axisMax = Math.max(step, Math.ceil(maxTotal / step) * step);
  const ticks = [];
  for (let t = 0; t <= axisMax; t += step) ticks.push(t);

  // a number sits inside its segment only when the segment is wide enough to hold it
  const segLabel = (v) => (v / axisMax >= 0.07 ? compact(convert(v)) : "");

  return (
    <div>
      <div className="relative">
        {/* Y axis line + vertical guide lines for the X scale */}
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
                <button
                  onClick={() => onSelect(isSel ? null : r.id)}
                  aria-pressed={isSel}
                  className="relative w-full flex items-center gap-3 text-left"
                >
                  <span title={r.name} className={`${LABEL_W} shrink-0 text-xs truncate ${isSel ? "font-bold text-teal-700" : "font-semibold text-gray-800"}`}>{r.name}</span>
                  <div className={`flex-1 flex h-7 overflow-hidden rounded-r-lg transition-shadow ${isSel ? "ring-2 ring-teal-600 shadow-md" : selectedId ? "opacity-50" : ""}`}>
                    {cols.map((s) => r[s.key] > 0 && (
                      <div
                        key={s.key}
                        title={`${s.label}: ${money(r[s.key])}`}
                        className="h-full flex items-center justify-center text-xs font-semibold text-white overflow-hidden"
                        style={{ width: `${(r[s.key] / axisMax) * 100}%`, background: s.color }}
                      >
                        {segLabel(r[s.key])}
                      </div>
                    ))}
                  </div>
                </button>

                {/* The selected row opens: one thin bar per car (or per customer), same scale */}
                {isSel && r.children.length > 0 && (
                  <div className="relative mt-1.5 mb-1 space-y-1">
                    {r.children.map((c) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span title={c.name} className={`${LABEL_W} shrink-0 pl-4 text-[11px] truncate text-gray-500`}>↳ {c.name}</span>
                        <div className="flex-1 flex h-4 overflow-hidden rounded-r-md">
                          {kidCols.map((s) => c[s.key] > 0 && (
                            <div
                              key={s.key}
                              title={`${s.label}: ${money(c[s.key])}`}
                              className="h-full flex items-center justify-center text-[10px] font-semibold text-white overflow-hidden"
                              style={{ width: `${(c[s.key] / axisMax) * 100}%`, background: s.color, opacity: 0.75 }}
                            >
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

      {/* X axis along the bottom */}
      <div className="flex gap-3 border-t border-gray-300">
        <div className={`${LABEL_W} shrink-0`} />
        <div className="relative flex-1 h-5">
          {ticks.map((t) => (
            <span key={t} className="absolute top-1 -translate-x-1/2 text-[10px] font-medium text-gray-400" style={{ left: `${(t / axisMax) * 100}%` }}>{sym}{compact(convert(t))}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div className={`${LABEL_W} shrink-0`} />
        <p className="flex-1 text-center text-[11px] text-gray-400">Amount ({currency})</p>
      </div>
    </div>
  );
}

// ── table: always shown under its graph; a row opens to show who / what is behind it ─────

/**
 * `countLabel` adds a plain count column after the name (Penalties / Records).
 * `childNote(c)` replaces the number columns of an opened row with one line of text, for rows whose split is not the
 * same as the parent's (a car's customers are described by penalties paid / unpaid, not recovered / not recovered).
 */
function SplitTable({ rows, nameLabel, countLabel, series, hidden, sort, onSort, selectedId, onSelect, money, childNote, emptyChild }) {
  const [open, setOpen] = useState(() => new Set());     // rows opened with the arrow
  const cols = series.filter((s) => !hidden.has(s.key));

  // The arrow opens / closes a row. On the selected row it clears the selection (a selected row is always open).
  const toggleOpen = (r) => {
    if (r.id === selectedId) { onSelect(null); return; }
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
      return next;
    });
  };

  const head = (key, label, align = "right") => (
    <th key={key} className={`px-3 py-2.5 font-semibold text-${align} whitespace-nowrap`}>
      <button
        onClick={() => onSort({ key, dir: sort.key === key && sort.dir === "desc" ? "asc" : key === "name" ? "asc" : "desc" })}
        className="inline-flex items-center gap-1 hover:text-gray-700"
      >
        {label}
        <span className={sort.key === key ? "text-teal-700" : "text-gray-300"}>{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  const noteSpan = cols.length + 1 + (countLabel ? 1 : 0);

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-400">
          <tr>
            {head("name", nameLabel, "left")}
            {countLabel && head("count", countLabel)}
            {cols.map((s) => head(s.key, s.label))}
            {head("total", "Total")}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSel = r.id === selectedId;
            const isOpen = isSel || open.has(r.id);
            return (
              <Fragment key={r.id}>
                <tr
                  onClick={() => onSelect(isSel ? null : r.id)}
                  className={`border-t border-gray-50 cursor-pointer ${isSel ? "bg-teal-50" : "hover:bg-gray-50/60"}`}
                >
                  <td
                    className={`px-3 py-2.5 font-semibold whitespace-nowrap ${isSel ? "text-teal-700" : "text-gray-800"}`}
                    style={isSel ? { boxShadow: "inset 3px 0 0 #0f766e" } : undefined}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={isOpen ? `Close ${r.name}` : `Open ${r.name}`}
                        aria-expanded={isOpen}
                        onClick={(e) => { e.stopPropagation(); toggleOpen(r); }}
                        className="w-4 text-gray-400 hover:text-gray-700"
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                      {r.name}
                    </span>
                  </td>
                  {countLabel && <td className="px-3 py-2.5 text-right text-gray-600">{r.count}</td>}
                  {cols.map((s) => (
                    <td
                      key={s.key}
                      className={`px-3 py-2.5 text-right whitespace-nowrap ${r[s.key] ? "font-bold" : "text-gray-300"}`}
                      style={r[s.key] ? { color: s.color } : undefined}
                    >
                      {r[s.key] ? money(r[s.key]) : "–"}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-teal-700 text-white font-bold text-center whitespace-nowrap">{money(r.total)}</span>
                  </td>
                </tr>

                {isOpen && r.children.length === 0 && emptyChild && (
                  <tr className="border-t border-gray-50 bg-gray-50/60">
                    <td colSpan={noteSpan + 1} className="py-2 pl-9 pr-3 text-gray-400 italic">{emptyChild}</td>
                  </tr>
                )}

                {isOpen && r.children.map((c) => (
                  <tr key={`${r.id}:${c.id}`} className="border-t border-gray-50 bg-gray-50/60">
                    <td className="py-2 pl-9 pr-3 text-gray-600 whitespace-nowrap">{c.name}</td>
                    {childNote ? (
                      <td colSpan={noteSpan} className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{childNote(c)}</td>
                    ) : (
                      <>
                        {countLabel && <td className="px-3 py-2 text-right text-gray-500">{c.count}</td>}
                        {cols.map((s) => (
                          <td
                            key={s.key}
                            className={`px-3 py-2 text-right whitespace-nowrap ${c[s.key] ? "font-semibold" : "text-gray-300"}`}
                            style={c[s.key] ? { color: s.color } : undefined}
                          >
                            {c[s.key] ? money(c[s.key]) : "–"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">{money(c.total)}</td>
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

// ── the tab ─────────────────────────────────────────────────────────────────

function MaintenancePenaltiesView({ report }) {
  const { fmt } = useCurrency();
  const [custHidden, setCustHidden] = useState(() => new Set());   // Paid / Unpaid switched off in the cards
  const carHidden = useMemo(() => new Set(), []);                  // nothing hides Recovered / Not recovered any more
  const [custSort, setCustSort] = useState({ key: "total", dir: "desc" });
  const [carSort, setCarSort] = useState({ key: "total", dir: "desc" });
  const [custSel, setCustSel] = useState(null);
  const [carSel, setCarSel] = useState(null);
  const [custPage, setCustPage] = useState(1);
  const [carPage, setCarPage] = useState(1);

  const cars = useMemo(() => report.cars || [], [report]);
  const penaltyRows = useMemo(() => report.penaltyRows || [], [report]);

  // Card numbers always count everything, so switching one off doesn't change the others.
  const totals = useMemo(() => ({
    recovered: cars.reduce((s, c) => s + c.recovered, 0),
    absorbed: cars.reduce((s, c) => s + c.absorbed, 0),
    paid: penaltyRows.reduce((s, p) => s + p.paid, 0),
    unpaid: penaltyRows.reduce((s, p) => s + p.pending, 0),
  }), [cars, penaltyRows]);

  const custRows = useMemo(() => sortRows(buildCustomerRows(penaltyRows, custHidden), custSort), [penaltyRows, custHidden, custSort]);
  const carRows = useMemo(() => sortRows(buildCarRows(cars, penaltyRows, carHidden), carSort), [cars, penaltyRows, carHidden, carSort]);

  // A selection only counts while its row still exists (hiding a series or changing the period can remove it).
  const custSelId = custRows.some((r) => r.id === custSel) ? custSel : null;
  const carSelId = carRows.some((r) => r.id === carSel) ? carSel : null;
  const custShown = useMemo(() => pinSelected(custRows, custSelId), [custRows, custSelId]);
  const carShown = useMemo(() => pinSelected(carRows, carSelId), [carRows, carSelId]);

  // One page of rows per card; the graph and the table show the same page.
  const custPages = Math.max(1, Math.ceil(custShown.length / PAGE_SIZE));
  const carPages = Math.max(1, Math.ceil(carShown.length / PAGE_SIZE));
  const custPageNo = Math.min(custPage, custPages);
  const carPageNo = Math.min(carPage, carPages);
  const custPageRows = custShown.slice((custPageNo - 1) * PAGE_SIZE, custPageNo * PAGE_SIZE);
  const carPageRows = carShown.slice((carPageNo - 1) * PAGE_SIZE, carPageNo * PAGE_SIZE);
  const custMax = Math.max(0, ...custRows.map((r) => r.total));
  const carMax = Math.max(0, ...carRows.map((r) => r.total));

  // A new period starts every card back on page 1.
  useEffect(() => { setCustPage(1); setCarPage(1); }, [report]);

  // Changing the sort, the selection or the cards starts that section back on page 1 (the selected row moves to the front).
  const sortCust = (s) => { setCustSort(s); setCustPage(1); };
  const sortCar = (s) => { setCarSort(s); setCarPage(1); };
  const selectCust = (id) => { setCustSel(id); setCustPage(1); };
  const selectCar = (id) => { setCarSel(id); setCarPage(1); };

  const flip = (setter, resetPage) => (key) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    resetPage(1);
  };
  const onCustCard = flip(setCustHidden, setCustPage);

  // An older backend doesn't send the per-penalty rows yet.
  if (report.penaltyRows === undefined) {
    return <Card className="p-6 text-center text-sm text-amber-600">This tab needs the updated reports.service.js on the backend (penaltyRows and cars with a jobs count).</Card>;
  }

  const nothing = cars.length === 0 && penaltyRows.length === 0;
  const pendingCustomers = report.cards?.pendingCustomers ?? 0;

  return (
    <div className="space-y-4">

      {/* One white group: three cards. Penalties unpaid also switches the Unpaid part on or off in the Customers graph
          (a faded card = hidden). */}
      <Card>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 p-4">
          <StatCard title="Total maintenance" value={fmt(report.cards?.totalMaintenance ?? 0)} Icon={IconPackage} color="bg-orange-500 text-white" />
          <StatCard title="Total penalties" value={fmt(totals.paid + totals.unpaid)} Icon={IconCreditCard} color="bg-teal-600 text-white" />
          <StatCard title="Penalties unpaid" value={fmt(totals.unpaid)} Icon={IconWarning} color="bg-red-500 text-white"
            off={custHidden.has("unpaid")} onClick={() => onCustCard("unpaid")} />
        </div>
      </Card>

      {nothing ? (
        <Card><Empty>No completed maintenance or penalties in {report.label}. Try another period.</Empty></Card>
      ) : (
        <>
          {/* Customers first: the question is "who was penalized" */}
          <Card className="p-4">
            <SectionHead
              title="Customers"
              hint={`${pendingCustomers} customer${pendingCustomers === 1 ? "" : "s"} still ${pendingCustomers === 1 ? "owes" : "owe"} a penalty. Click a bar or a row to bring it to the front; the arrow shows the cars they were penalized on. Use the Penalties unpaid card to hide the unpaid part.`}
            />
            {custRows.length === 0 ? (
              <Empty>{penaltyRows.length === 0 ? `No penalties in ${report.label}.` : "Unpaid is switched off and nothing has been paid."}</Empty>
            ) : (
              <>
                <Legend items={CUSTOMER_SERIES} />
                <SplitBars rows={custPageRows} scaleMax={custMax} series={CUSTOMER_SERIES} hidden={custHidden}
                  selectedId={custSelId} onSelect={selectCust} money={fmt} />
                <Pager page={custPageNo} pageCount={custPages} total={custShown.length} onPage={setCustPage} />
                <SplitTable rows={custPageRows} nameLabel="Customer" countLabel="Penalties" series={CUSTOMER_SERIES} hidden={custHidden}
                  sort={custSort} onSort={sortCust} selectedId={custSelId} onSelect={selectCust} money={fmt} />
              </>
            )}
          </Card>

          {/* Vehicles */}
          <Card className="p-4">
            <SectionHead
              title="Vehicles"
              hint="What each car cost in maintenance, and how much of it penalties paid back. Not recovered includes routine servicing, which has no penalty behind it. Click a bar or a row to bring it to the front; the arrow shows who was penalized on it."
            />
            {carRows.length === 0 ? (
              <Empty>{cars.length === 0 ? `No completed maintenance in ${report.label}.` : "Nothing to show."}</Empty>
            ) : (
              <>
                <Legend items={CAR_SERIES} />
                <SplitBars rows={carPageRows} scaleMax={carMax} series={CAR_SERIES} childSeries={CAR_CHILD_SERIES} hidden={carHidden}
                  selectedId={carSelId} onSelect={selectCar} money={fmt} />
                <Pager page={carPageNo} pageCount={carPages} total={carShown.length} onPage={setCarPage} />
                <SplitTable rows={carPageRows} nameLabel="Vehicle" countLabel="Records" series={CAR_SERIES} hidden={carHidden}
                  sort={carSort} onSort={sortCar} selectedId={carSelId} onSelect={selectCar} money={fmt}
                  emptyChild="No penalties on this car in this period."
                  childNote={(c) => (
                    <>
                      {c.count} penalt{c.count === 1 ? "y" : "ies"} · <span className="font-semibold" style={{ color: C_GREEN }}>{fmt(c.paid)} paid</span> · <span className="font-semibold" style={{ color: c.unpaid > 0 ? C_RED : undefined }}>{fmt(c.unpaid)} unpaid</span>
                    </>
                  )} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}