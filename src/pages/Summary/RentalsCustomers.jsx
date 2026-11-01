import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// RENTALS & CUSTOMERS
//
// Question this tab answers:  "Who booked, and how many times?"
//
// A graph + a table for customers, vehicles and service types. Each bar / row is split by booking status
// (Completed, Ongoing, Upcoming, Cancelled). A customer row opens to show the cars they booked; a car row opens
// to show the customers who booked it. No booking details (fees, dates, locations): those are on the Bookings page.
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

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Icon + color per card, same as the Bookings page stat cards.
const STATUS_ICON = { completed: IconCheck, ongoing: IconActivity, upcoming: IconClock, cancelled: IconX };
const STATUS_ICON_COLOR = {
  completed: "bg-green-600 text-white",     // same colors as the bars (STATUSES above)
  ongoing:   "bg-blue-600 text-white",
  upcoming:  "bg-yellow-500 text-white",
  cancelled: "bg-red-500 text-white",
};

// Same stat card as the Users page (flat style): colored icon square on the left, number and title on the right.
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
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500 truncate">{title}</div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 7;             // rows per page: the graph and the table under it always show the same rows
const LABEL_W = "w-44";          // width of the name column; the grid lines are offset by the same amount
const GAP_LEFT = "11.75rem";     // name column (w-44) + gap-3: where the bars start

// ── grouping + sorting ──────────────────────────────────────────────────────

const zeroCounts = () => ({ completed: 0, ongoing: 0, upcoming: 0, cancelled: 0, total: 0, chauffeur: 0, selfDrive: 0, unrecorded: 0 });

// The thin bar under each row (and the two columns before Total): the same bookings split by driving mode.
const MODES = [
  { key: "chauffeur",  label: "With chauffeur", color: "#7c3aed" },
  { key: "selfDrive",  label: "Self-drive",     color: "#06b6d4" },
  { key: "unrecorded", label: "Not recorded",   color: "#d1d5db" },   // bookings with no mode saved
];

function bumpMode(row, b) {
  if (b.modeOfDriving === "With Chauffeur") row.chauffeur += 1;
  else if (b.modeOfDriving === "Self Drive") row.selfDrive += 1;
  else row.unrecorded += 1;
}

/**
 * One row per customer / car with a count for each status, plus `children`: the same counts split by the other
 * side (a customer's cars, or a car's customers). Hidden statuses are left out of every count and total.
 */
function groupRows(bookings, idKey, nameKey, subIdKey, subNameKey, hidden) {
  const map = new Map();
  for (const b of bookings) {
    const st = b.displayStatus;
    if (!st || hidden.has(st)) continue;
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

/** The selected row goes to the front of the list (graph and table); the rest keep their sort order. */
function pinSelected(rows, selectedId) {
  const sel = rows.find((r) => r.id === selectedId);
  return sel ? [sel, ...rows.filter((r) => r.id !== selectedId)] : rows;
}

// ── small pieces ────────────────────────────────────────────────────────────

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-soft ${className}`}>{children}</div>
);

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

// ── graph: one stacked bar per customer / car, split by status ──────────────

/** A round step (1, 2, 5, 10, 20 ...) so the bottom scale has about five whole-number marks. */
function niceStep(max) {
  const raw = Math.max(1, max) / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return Math.max(1, Math.round(m * pow));
}

/**
 * Y = the customers (or cars), X = number of bookings along the bottom. Each bar is split by status.
 * Clicking a bar selects it: the table highlights the same row, and thin bars appear under it for its cars
 * (or its customers).
 */
function StatusBars({ rows, scaleMax = 0, hidden, selectedId, onSelect, showMode = false }) {
  const cols = STATUSES.filter((s) => !hidden.has(s.key));
  const maxTotal = Math.max(1, scaleMax, ...rows.map((r) => r.total));   // scale from every page, so bars compare across pages
  const step = niceStep(maxTotal);
  const axisMax = Math.max(step, Math.ceil(maxTotal / step) * step);
  const ticks = [];
  for (let t = 0; t <= axisMax; t += step) ticks.push(t);

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
                  <span className={`${LABEL_W} shrink-0 text-xs truncate ${isSel ? "font-bold text-teal-700" : "font-semibold text-gray-800"}`}>{r.name}</span>
                  <div className={`flex-1 flex h-7 overflow-hidden rounded-r-lg transition-shadow ${isSel ? "ring-2 ring-teal-600 shadow-md" : selectedId ? "opacity-50" : ""}`}>
                    {cols.map((s) => r[s.key] > 0 && (
                      <div
                        key={s.key}
                        title={`${s.label}: ${r[s.key]}`}
                        className="h-full flex items-center justify-center text-xs font-semibold text-white"
                        style={{ width: `${(r[s.key] / axisMax) * 100}%`, background: s.color }}
                      >
                        {r[s.key]}
                      </div>
                    ))}
                  </div>
                </button>

                {/* Thin bar: the same bookings by driving mode (only under "All bookings"), same scale */}
                {showMode && (
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`${LABEL_W} shrink-0`} />
                    <div className={`flex-1 flex h-1.5 overflow-hidden rounded-r-sm ${selectedId && !isSel ? "opacity-50" : ""}`}>
                      {MODES.map((m) => r[m.key] > 0 && (
                        <div key={m.key} title={`${m.label}: ${r[m.key]}`} style={{ width: `${(r[m.key] / axisMax) * 100}%`, background: m.color }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* The selected row opens: one thin bar per car (or per customer), same scale */}
                {isSel && r.children.length > 0 && (
                  <div className="relative mt-1.5 mb-1 space-y-1">
                    {r.children.map((c) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span title={c.name} className={`${LABEL_W} shrink-0 pl-4 text-[11px] truncate text-gray-500`}>↳ {c.name}</span>
                        <div className="flex-1 flex h-4 overflow-hidden rounded-r-md">
                          {cols.map((s) => c[s.key] > 0 && (
                            <div
                              key={s.key}
                              title={`${s.label}: ${c[s.key]}`}
                              className="h-full flex items-center justify-center text-[10px] font-semibold text-white"
                              style={{ width: `${(c[s.key] / axisMax) * 100}%`, background: s.color, opacity: 0.75 }}
                            >
                              {c[s.key]}
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
            <span key={t} className="absolute top-1 -translate-x-1/2 text-[10px] font-medium text-gray-400" style={{ left: `${(t / axisMax) * 100}%` }}>{t}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div className={`${LABEL_W} shrink-0`} />
        <p className="flex-1 text-center text-[11px] text-gray-400">Number of bookings</p>
      </div>
    </div>
  );
}

// ── table: always shown under its graph; a row opens to show who / what is behind it ─────

function StatusTable({ rows, nameLabel, hidden, sort, onSort, selectedId, onSelect, showMode = false }) {
  const [open, setOpen] = useState(() => new Set());     // rows opened with the arrow
  const modeCols = showMode ? MODES.slice(0, 2) : [];     // With chauffeur, Self-drive (the gray "not recorded" part only shows in the thin bar)
  const cols = STATUSES.filter((s) => !hidden.has(s.key));

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
    <th className={`px-3 py-2.5 font-semibold text-${align} whitespace-nowrap`}>
      <button
        onClick={() => onSort({ key, dir: sort.key === key && sort.dir === "desc" ? "asc" : key === "name" ? "asc" : "desc" })}
        className="inline-flex items-center gap-1 hover:text-gray-700"
      >
        {label}
        <span className={sort.key === key ? "text-teal-700" : "text-gray-300"}>{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-400">
          <tr>
            {head("name", nameLabel, "left")}
            {cols.map((s) => head(s.key, s.label))}
            {modeCols.map((m) => head(m.key, m.label))}
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
                  {cols.map((s) => (
                    <td
                      key={s.key}
                      className={`px-3 py-2.5 text-right ${r[s.key] ? "font-bold" : "text-gray-300"}`}
                      style={r[s.key] ? { color: s.color } : undefined}
                    >
                      {r[s.key]}
                    </td>
                  ))}
                  {modeCols.map((m) => (
                    <td key={m.key} className={`px-3 py-2.5 text-right ${r[m.key] ? "font-bold" : "text-gray-300"}`} style={r[m.key] ? { color: m.color } : undefined}>
                      {r[m.key]}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-block min-w-[1.75rem] px-2 py-0.5 rounded-full bg-teal-700 text-white font-bold text-center">{r.total}</span>
                  </td>
                </tr>

                {isOpen && r.children.map((c) => (
                  <tr key={`${r.id}:${c.id}`} className="border-t border-gray-50 bg-gray-50/60">
                    <td className="py-2 pl-9 pr-3 text-gray-600 whitespace-nowrap">{c.name}</td>
                    {cols.map((s) => (
                      <td
                        key={s.key}
                        className={`px-3 py-2 text-right ${c[s.key] ? "font-semibold" : "text-gray-300"}`}
                        style={c[s.key] ? { color: s.color } : undefined}
                      >
                        {c[s.key]}
                      </td>
                    ))}
                    {modeCols.map((m) => (
                      <td key={m.key} className={`px-3 py-2 text-right ${c[m.key] ? "font-semibold" : "text-gray-300"}`} style={c[m.key] ? { color: m.color } : undefined}>
                        {c[m.key]}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold text-gray-600">{c.total}</td>
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

function RentalsCustomersView({ report }) {
  const [hidden, setHidden] = useState(() => new Set());       // statuses switched off in the legend
  const [custSort, setCustSort] = useState({ key: "total", dir: "desc" });
  const [fleetSort, setFleetSort] = useState({ key: "total", dir: "desc" });
  const [custSel, setCustSel] = useState(null);
  const [fleetSel, setFleetSel] = useState(null);
  const [svcSort, setSvcSort] = useState({ key: "total", dir: "desc" });
  const [svcSel, setSvcSel] = useState(null);
  const [svcPage, setSvcPage] = useState(1);
  const [drive, setDrive] = useState("all");               // all | chauffeur | self : filters the whole tab
  const [custPage, setCustPage] = useState(1);
  const [fleetPage, setFleetPage] = useState(1);

  const bookings = useMemo(() => report.bookings || [], [report]);

  // The driving filter: every number, bar and table below only counts the bookings that match it.
  const scoped = useMemo(() => {
    if (drive === "chauffeur") return bookings.filter((b) => b.modeOfDriving === "With Chauffeur");
    if (drive === "self") return bookings.filter((b) => b.modeOfDriving === "Self Drive");
    return bookings;
  }, [bookings, drive]);

  // Legend numbers always count every status, so switching one off doesn't change the others.
  const counts = useMemo(() => {
    const c = { completed: 0, ongoing: 0, upcoming: 0, cancelled: 0 };
    scoped.forEach((b) => { if (b.displayStatus) c[b.displayStatus] += 1; });
    return c;
  }, [scoped]);
  const totalRentals = STATUSES.reduce((sum, x) => sum + counts[x.key], 0);

  const custRows = useMemo(() => sortRows(groupRows(scoped, "userID", "customerName", "carID", "carName", hidden), custSort), [scoped, hidden, custSort]);
  const fleetRows = useMemo(() => sortRows(groupRows(scoped, "carID", "carName", "userID", "customerName", hidden), fleetSort), [scoped, hidden, fleetSort]);

  // Service types: one row per service type, opening to the cars booked under it.
  const svcRows = useMemo(() => sortRows(groupRows(scoped, "serviceTypeName", "serviceTypeName", "carID", "carName", hidden), svcSort), [scoped, hidden, svcSort]);

  // A selection only counts while its row still exists (hiding a status or changing the period can remove it).
  // Otherwise every bar would stay faded with nothing highlighted.
  const custSelId = custRows.some((r) => r.id === custSel) ? custSel : null;
  const fleetSelId = fleetRows.some((r) => r.id === fleetSel) ? fleetSel : null;
  const svcSelId = svcRows.some((r) => r.id === svcSel) ? svcSel : null;
  const svcShown = useMemo(() => pinSelected(svcRows, svcSelId), [svcRows, svcSelId]);
  const custShown = useMemo(() => pinSelected(custRows, custSelId), [custRows, custSelId]);
  const fleetShown = useMemo(() => pinSelected(fleetRows, fleetSelId), [fleetRows, fleetSelId]);

  // One page of rows per card; the graph and the table show the same page.
  const custPages = Math.max(1, Math.ceil(custShown.length / PAGE_SIZE));
  const fleetPages = Math.max(1, Math.ceil(fleetShown.length / PAGE_SIZE));
  const custPageNo = Math.min(custPage, custPages);
  const fleetPageNo = Math.min(fleetPage, fleetPages);
  const svcPages = Math.max(1, Math.ceil(svcShown.length / PAGE_SIZE));
  const svcPageNo = Math.min(svcPage, svcPages);
  const svcPageRows = svcShown.slice((svcPageNo - 1) * PAGE_SIZE, svcPageNo * PAGE_SIZE);
  const svcMax = Math.max(0, ...svcRows.map((r) => r.total));
  const svcSupported = bookings.length === 0 || bookings.some((b) => b.serviceTypeName !== undefined);   // false = backend not updated yet
  const custPageRows = custShown.slice((custPageNo - 1) * PAGE_SIZE, custPageNo * PAGE_SIZE);
  const fleetPageRows = fleetShown.slice((fleetPageNo - 1) * PAGE_SIZE, fleetPageNo * PAGE_SIZE);
  const custMax = Math.max(0, ...custRows.map((r) => r.total));
  const fleetMax = Math.max(0, ...fleetRows.map((r) => r.total));

  // A new period starts every card back on page 1.
  useEffect(() => { setCustPage(1); setFleetPage(1); setSvcPage(1); }, [report]);

  // Changing the sort, the selection or the status chips starts that card back on page 1 (the selected row moves to the front).
  const sortCust = (s) => { setCustSort(s); setCustPage(1); };
  const sortFleet = (s) => { setFleetSort(s); setFleetPage(1); };
  const selectCust = (id) => { setCustSel(id); setCustPage(1); };
  const selectFleet = (id) => { setFleetSel(id); setFleetPage(1); };
  const sortSvc = (s) => { setSvcSort(s); setSvcPage(1); };
  const selectSvc = (id) => { setSvcSel(id); setSvcPage(1); };

  // How many bookings come with a chauffeur and how many are self-drive (respects the status chips).
  const driving = useMemo(() => {
    if (!bookings.some((b) => b.modeOfDriving !== undefined)) return null;     // backend not updated yet
    const visible = bookings.filter((b) => b.displayStatus && !hidden.has(b.displayStatus));
    const chauffeur = visible.filter((b) => b.modeOfDriving === "With Chauffeur").length;
    const selfDrive = visible.filter((b) => b.modeOfDriving === "Self Drive").length;
    return { all: visible.length, chauffeur, selfDrive, other: visible.length - chauffeur - selfDrive };
  }, [bookings, hidden]);

  // "All bookings" shows both modes side by side (thin bar + columns); picking one mode narrows the whole tab instead.
  const showMode = drive === "all" && driving !== null;

  const toggleStatus = (key) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const onChip = (key) => { toggleStatus(key); setCustPage(1); setFleetPage(1); setSvcPage(1); };
  const onDrive = (key) => { setDrive(key); setCustPage(1); setFleetPage(1); setSvcPage(1); };

  // Booking rows from an older backend have no displayStatus / names yet.
  if (bookings.length > 0 && bookings.every((b) => b.displayStatus === undefined)) {
    return <Card className="p-6 text-center text-sm text-amber-600">This tab needs the updated reports.service.js on the backend (booking rows with car name, customer name and status).</Card>;
  }

  return (
    <div className="space-y-4">

      {/* One white group, same layout as the Users page: stat cards on top, a divider, then the filter row.
          A status card also switches that status on or off in the graphs and tables below (a faded card = hidden). */}
      <Card>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5 p-4">
          <StatCard title={drive === "chauffeur" ? "With chauffeur" : drive === "self" ? "Self-drive" : "All Bookings"}
            value={totalRentals} Icon={IconGrid} color="bg-teal-600 text-white" />
          {STATUSES.map((st) => (
            <StatCard key={st.key} title={st.label} value={counts[st.key]} Icon={STATUS_ICON[st.key]} color={STATUS_ICON_COLOR[st.key]}
              off={hidden.has(st.key)} onClick={() => onChip(st.key)} />
          ))}
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
                onChange={(e) => onDrive(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="all">All bookings ({driving.all})</option>
                <option value="chauffeur">With chauffeur only ({driving.chauffeur})</option>
                <option value="self">Self-drive only ({driving.selfDrive})</option>
              </select>
              {showMode && (
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500">
                  <span className="text-gray-400">Thin bar under each row:</span>
                  {MODES.filter((m) => m.key !== "unrecorded" || driving.other > 0).map((m) => (
                    <span key={m.key} className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.color }} />
                      {m.label}
                    </span>
                  ))}
                </span>
              )}
              {!showMode && driving.other > 0 && <span className="text-gray-400">{driving.other} not recorded (shown under All bookings only)</span>}
            </div>
          ) : (
            <p className="text-xs text-amber-600">The driving dropdown needs the updated reports.service.js (booking rows with modeOfDriving).</p>
          )}
        </div>
      </Card>

      {totalRentals === 0 ? (
        <Card><Empty>{drive === "all" ? `No bookings started in ${report.label}. Try another period.` : `No ${drive === "chauffeur" ? "chauffeur" : "self-drive"} bookings in ${report.label}. Switch Driving to All bookings to see the rest.`}</Empty></Card>
      ) : (
        <>
          {/* Customers first: the question is "who booked" */}
          <Card className="p-4">
            <SectionHead
              title="Customers"
              hint={`${report.customerReport?.newCustomers ?? 0} new this period, ${report.customerReport?.totalCustomers ?? 0} customers in total. Click a bar or a row to bring it to the front; the arrow shows the cars they booked.`}
            />
            {custRows.length === 0 ? <Empty>Every status is switched off.</Empty> : (
              <>
                <StatusBars showMode={showMode} rows={custPageRows} scaleMax={custMax} hidden={hidden} selectedId={custSelId} onSelect={selectCust} />
                <Pager page={custPageNo} pageCount={custPages} total={custShown.length} onPage={setCustPage} />
                <StatusTable showMode={showMode} rows={custPageRows} nameLabel="Customer" hidden={hidden} sort={custSort} onSort={sortCust} selectedId={custSelId} onSelect={selectCust} />
              </>
            )}
          </Card>

          {/* Vehicles */}
          <Card className="p-4">
            <SectionHead title="Vehicles" hint="How many times each car was booked. Click a bar or a row to bring it to the front; the arrow shows who booked it." />
            {fleetRows.length === 0 ? <Empty>Every status is switched off.</Empty> : (
              <>
                <StatusBars showMode={showMode} rows={fleetPageRows} scaleMax={fleetMax} hidden={hidden} selectedId={fleetSelId} onSelect={selectFleet} />
                <Pager page={fleetPageNo} pageCount={fleetPages} total={fleetShown.length} onPage={setFleetPage} />
                <StatusTable showMode={showMode} rows={fleetPageRows} nameLabel="Vehicle" hidden={hidden} sort={fleetSort} onSort={sortFleet} selectedId={fleetSelId} onSelect={selectFleet} />
              </>
            )}
          </Card>

          {/* Service types: what the bookings were for */}
          <Card className="p-4">
            <SectionHead title="Service types" hint="How many bookings each service type got. Click a bar or a row to bring it to the front; the arrow shows the cars booked under it." />
            {!svcSupported ? (
              <p className="text-xs text-amber-600">This graph needs the updated reports.service.js (booking rows with serviceTypeName).</p>
            ) : svcRows.length === 0 ? <Empty>Every status is switched off.</Empty> : (
              <>
                <StatusBars showMode={showMode} rows={svcPageRows} scaleMax={svcMax} hidden={hidden} selectedId={svcSelId} onSelect={selectSvc} />
                <Pager page={svcPageNo} pageCount={svcPages} total={svcShown.length} onPage={setSvcPage} />
                <StatusTable showMode={showMode} rows={svcPageRows} nameLabel="Service type" hidden={hidden} sort={svcSort} onSort={sortSvc} selectedId={svcSelId} onSelect={selectSvc} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}