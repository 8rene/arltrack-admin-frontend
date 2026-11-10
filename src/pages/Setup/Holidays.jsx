import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import usePolling from "../../hooks/usePolling";

// ─── Local helpers ───────────────────────────────────────────────────────────
// API helper, toast, modal/confirm dialog and shared styles — kept in this
// file so the page is self-contained, like the rest of the pages.

const API_URL = process.env.REACT_APP_API_URL;

const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Today as a Manila calendar date / weekday (Mon=1 ... Sun=7), independent of
// the browser's own timezone — the backend stores PHT calendar dates.
const phtNow = () => new Date(Date.now() + 8 * 60 * 60 * 1000);

const todayYmdPHT = () => phtNow().toISOString().slice(0, 10);

const inputCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-300";

const btnPrimary =
  "px-4 py-2 text-sm font-semibold rounded-xl bg-arl-primary text-white hover:bg-[#16526a] disabled:opacity-60 transition";

const btnGhost =
  "px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition";

const btnDanger =
  "px-4 py-2 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 transition";

/**
 * Returns an `api(path, { method, body })` function that attaches the JWT,
 * sends JSON, and resolves with the parsed response body — or throws an
 * Error carrying the backend's own `message` (so validation text such as
 * "End time must be after start time." reaches the UI as-is).
 */

function useApi() {
  const token = localStorage.getItem("token");
  return useCallback(
    async (path, { method = "GET", body } = {}) => {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.message || `Request failed (${res.status}).`);
      }
      return json;
    },
    [token]
  );
}

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const showToast = useCallback((msg, type = "success") => {
    clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  return [toast, showToast];
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed top-5 right-5 z-[70] px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
        toast.type === "success"
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {toast.msg}
    </div>
  );
}

function Modal({ title, onClose, children, footer, width = "max-w-md", busy = false }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${width} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-6 pb-2 overflow-y-auto">{children}</div>
        {footer && <div className="flex gap-3 justify-end px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

function ConfirmDialog({
  title, children, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onCancel,
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <button onClick={onCancel} disabled={busy} className={btnGhost}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} className={danger ? btnDanger : btnPrimary}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-gray-500 leading-relaxed pb-2">{children}</div>
    </Modal>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function ErrorBanner({ children, onRetry }) {
  if (!children) return null;
  return (
    <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center justify-between gap-3">
      <span>{children}</span>
      {onRetry && (
        <button onClick={onRetry} className="underline font-medium whitespace-nowrap">Retry</button>
      )}
    </div>
  );
}

function Pill({ children, tone = "teal" }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700 border-teal-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
    green: "bg-green-50 text-green-700 border-green-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tones[tone]}`}>
      {children}
    </span>
  );
}

// ─── Holidays ────────────────────────────────────────────────────────────────
//
// Public holidays that suspend number-coding (the GPS live check and the
// booking-time check both read the `holidays` collection). Dates are Manila
// calendar dates ("YYYY-MM-DD"), exactly as the backend returns them.
//
// Backend: routes/holidays. View/add/edit — Owner, Admin, Supervisor.
// Delete — Owner and Admin only (mirrored here by `canDelete`).
//
// Switching the Year dropdown RETRACES every holiday onto that year: Holy
// Week and National Heroes Day are recomputed from their real rules, every
// other holiday keeps its month/day. Chinese New Year and the Islamic
// holidays have no calendar rule, so they need a manual date correction
// after a year switch — the page says so.

const parseYmd = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return { y, m, d };
};
const fmtDate = (ymd) => {
  if (!ymd) return "—";
  const { y, m, d } = parseYmd(ymd);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
};
const weekdayOf = (ymd) => {
  const { y, m, d } = parseYmd(ymd);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return DAY_NAMES[wd - 1];
};
const validYmd = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || "")) return false;
  const { y, m, d } = parseYmd(ymd);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
};

const PAGE_SIZE = 10;

// "Search by" options — same idea as the Bookings / Maintenance pages.
const SEARCH_BY = [
  { key: "holiday", label: "Holiday", type: "text" },
  { key: "date",    label: "Date",    type: "date" },
];

// ─── Pagination (same pattern as Bookings.jsx / Maintenance.jsx) ─────────────
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, start, count: items.length };
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (totalPages <= 1) return null;
  const nums = [1];
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) nums.push(n);
  nums.push(totalPages);
  const dedup = [...new Set(nums)].sort((x, y) => x - y);
  const rangeEnd = Math.min(start + pageSize, count);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
      <p className="text-xs text-gray-400">
        Showing {count === 0 ? 0 : start + 1}–{rangeEnd} of {count}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        {dedup.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - dedup[i - 1] > 1 && <span className="px-1.5 text-gray-300 text-xs">…</span>}
            <button onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                n === page ? "bg-arl-primary text-white shadow" : "border text-gray-600 hover:bg-white"
              }`}>
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  );
}

const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Holidays() {
  const { effectiveRole } = useAuth();
  const canDelete = effectiveRole === "Owner" || effectiveRole === "Admin";
  const api = useApi();
  const [toast, showToast] = useToast();

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(""); // "" = all months
  const [sortDir, setSortDir] = useState("asc"); // Date column: asc = Jan → Dec
  const [calMonth, setCalMonth] = useState(null); // { y, m } shown on the calendar; null = default
  const [searchBy, setSearchBy] = useState("holiday");
  const [search, setSearch] = useState("");
  const [dateValue, setDateValue] = useState("");

  const [dialog, setDialog] = useState(null);       // { holiday } — holiday null = adding
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await api("/api/holidays");
      setHolidays(json.data || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Refreshed every minute while the tab is visible (and immediately after any change).
  usePolling(load, 60000);

  // The year the list currently sits in = the first holiday's year, falling back to the current year.
  const today = todayYmdPHT();
  const displayYear = holidays.find((h) => h.holidayDate)
    ? parseYmd(holidays.find((h) => h.holidayDate).holidayDate).y
    : Number(today.slice(0, 4));
  // Calendar starts on the current month when the list is on this year, else January.
  const cal = calMonth || {
    y: displayYear,
    m: Number(today.slice(0, 4)) === displayYear ? Number(today.slice(5, 7)) - 1 : 0,
  };

  // Month filter ⇄ calendar: picking a month jumps the calendar there; paging the
  // calendar with its arrows moves the month filter along (when one is active).
  const onMonthFilter = (v) => {
    setMonth(v);
    setDateValue("");
    if (v) setCalMonth({ y: displayYear, m: Number(v) - 1 });
  };
  const onCalMonth = (next) => {
    setCalMonth(next);
    if (month) { setMonth(String(next.m + 1)); setDateValue(""); }
  };

  // Clicking a calendar day = "Search by Date" with that day; clicking it again clears it.
  const searchType = SEARCH_BY.find((o) => o.key === searchBy)?.type || "text";
  const selectedDay = searchBy === "date" && dateValue ? dateValue : null;
  const onSelectDay = (ymd) => {
    if (!ymd || ymd === selectedDay) { setDateValue(""); return; }
    setSearchBy("date"); setSearch(""); setDateValue(ymd);
  };

  const searchText = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = holidays.filter((h) => {
      if (month && !(h.holidayDate && parseYmd(h.holidayDate).m === Number(month))) return false;
      if (searchType === "date") return !dateValue || h.holidayDate === dateValue;
      return !searchText || String(h.holidayName || "").toLowerCase().includes(searchText);
    });
    // YYYY-MM-DD strings sort correctly as text; holidays with no date go last.
    return [...list].sort((a, b) => {
      if (!a.holidayDate) return 1;
      if (!b.holidayDate) return -1;
      return sortDir === "asc" ? a.holidayDate.localeCompare(b.holidayDate) : b.holidayDate.localeCompare(a.holidayDate);
    });
  }, [holidays, month, sortDir, searchType, dateValue, searchText]);

  const { page, setPage, totalPages, pageItems: paginated, start, count } = usePagination(visible, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [month, sortDir, search, searchBy, dateValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api(`/api/holidays/${toDelete.id}`, { method: "DELETE" });
      showToast(`Deleted "${toDelete.holidayName}".`);
      setToDelete(null);
      await load();
    } catch (e) {
      showToast(`Failed to delete: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full px-4 space-y-5">
      <Toast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-arl-dark">Holidays</h1>
      </div>

      <ErrorBanner onRetry={load}>{error}</ErrorBanner>

      {/* CALENDAR — clicking a day sets "Search by: Date" to that day.
          Legend + month filter (left) and Refresh / Add holiday (right) sit in the card's top bar. */}
      <HolidayCalendar
        holidays={holidays}
        cal={cal}
        setCalMonth={onCalMonth}
        today={today}
        yearLocked={holidays.length > 0 ? displayYear : null}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        toolbar={(
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-bold text-gray-800 text-base">Calendar Legend</h3>
              <div className="flex flex-wrap items-center gap-4 mt-1">
                {CAL_LEGEND.map(({ label, cls }) => (
                  <span key={label} className="flex items-center gap-1.5 text-sm text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-full ${cls}`} />{label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={month} onChange={(e) => onMonthFilter(e.target.value)} title="Filter by month"
                className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
                <option value="">All months</option>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <button onClick={load} disabled={loading}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-teal-300 text-teal-700 bg-white hover:bg-teal-50 disabled:opacity-50 flex items-center gap-1.5">
                <IconRefresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button onClick={() => setDialog({ holiday: null })}
                className="px-4 py-2 text-sm rounded-xl bg-arl-primary text-white hover:bg-[#16526a] font-semibold">
                + Add holiday
              </button>
            </div>
          </div>
        )}
      />

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        {/* SEARCH — same layout as the Bookings page */}
        <div className="flex flex-wrap gap-3 items-end p-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
            <select value={searchBy}
              onChange={(e) => { setSearchBy(e.target.value); setSearch(""); setDateValue(""); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
              {SEARCH_BY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {searchType === "date" ? (
            <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none" />
          ) : (
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Enter ${(SEARCH_BY.find((o) => o.key === searchBy)?.label || "").toLowerCase()}...`}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none" />
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                <SortableTh label="Date" active dir={sortDir} onSort={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} />
                <th className="px-4 py-3 text-left font-semibold">Holiday</th>
                <th className="px-4 py-3 text-left font-semibold">Day</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-gray-400 text-sm">
                    {holidays.length === 0
                      ? "No holidays yet. Add the first one."
                      : selectedDay ? "No holidays on this day." : "No holidays found."}
                  </td>
                </tr>
              ) : paginated.map((h, i) => {
                const isToday = h.holidayDate === today;
                const isPast = h.holidayDate && h.holidayDate < today;
                return (
                  <tr key={h.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-teal-50/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/20" : ""} ${isPast ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDate(h.holidayDate)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 text-sm">
                      {h.holidayName || "—"}
                      {isToday && <span className="ml-2 align-middle"><Pill tone="green">Today</Pill></span>}
                      {isWeekendYmd(h.holidayDate) && <span className="ml-2 align-middle"><Pill tone="gray">Weekend</Pill></span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{h.holidayDay || "—"}</td>
                    <td className="px-4 py-3 text-left whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => setDialog({ holiday: h })}
                          className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-arl-primary text-white hover:bg-[#16526a] transition-colors">
                          Edit
                        </button>
                        {canDelete && (
                          <button onClick={() => setToDelete(h)}
                            className="px-3.5 py-1 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>

      {dialog && (
        <HolidayDialog
          existing={dialog.holiday}
          api={api}
          onClose={() => setDialog(null)}
          onSaved={async (msg) => { setDialog(null); showToast(msg); await load(); }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete holiday?"
          danger
          confirmLabel="Delete"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        >
          Remove <strong>{toDelete.holidayName}</strong> ({fmtDate(toDelete.holidayDate)}) from the holiday list?
          Number coding will no longer be suspended on that date.
        </ConfirmDialog>
      )}
    </div>
  );
}

// ─── Sort header — same look as the Bookings table ──────────────────────────
const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg
    className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`}
    viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
function SortableTh({ label, active, dir, onSort }) {
  return (
    <th className="px-4 py-3 text-left font-semibold select-none">
      <button
        onClick={onSort}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs px-1.5 py-1 -mx-1.5 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={dir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

const isWeekendYmd = (ymd) => validYmd(ymd) && ["Saturday", "Sunday"].includes(weekdayOf(ymd));
const pad2 = (n) => String(n).padStart(2, "0");

// ─── Holiday calendar ────────────────────────────────────────────────────────
// Same look as the Maintenance calendar. Holidays show as chips with their name;
// clicking a day searches the table by that date (click again to clear).
// Weekend holidays are grey — number coding doesn't run on weekends anyway.
// With a list loaded, the month arrows stay inside the list's year.

// Legend dots — shared by the calendar toolbar.
const CAL_LEGEND = [
  { label: "Holiday (coding suspended)",         cls: "bg-teal-500" },
  { label: "Weekend holiday (no coding anyway)", cls: "bg-gray-400" },
  { label: "Today",                              cls: "bg-white border-2 border-teal-500" },
];

function HolidayCalendar({ holidays, cal, setCalMonth, today, yearLocked, selectedDay, onSelectDay, toolbar }) {
  const { y, m } = cal;
  const monthName = `${MONTH_NAMES[m]} ${y}`;
  const firstDay = new Date(Date.UTC(y, m, 1)).getUTCDay(); // Sunday-first, like Maintenance
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const byDate = {};
  holidays.forEach((h) => { if (h.holidayDate) (byDate[h.holidayDate] = byDate[h.holidayDate] || []).push(h); });

  const canPrev = !(yearLocked && m === 0);
  const canNext = !(yearLocked && m === 11);
  const prevMonth = () => canPrev && setCalMonth(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });
  const nextMonth = () => canNext && setCalMonth(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });

  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const navBtn = "w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
      {toolbar && <div className="px-5 py-3 border-b border-gray-100">{toolbar}</div>}
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} disabled={!canPrev} className={navBtn} aria-label="Previous month">‹</button>
          <h2 className="font-bold text-gray-800 text-base">{monthName}</h2>
          <button onClick={nextMonth} disabled={!canNext} className={navBtn} aria-label="Next month">›</button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const ymd = `${y}-${pad2(m + 1)}-${pad2(day)}`;
            const isToday = ymd === today;
            const isSel = selectedDay === ymd;
            const weekend = i % 7 === 0 || i % 7 === 6;
            const hols = byDate[ymd] || [];
            return (
              <button
                key={i}
                onClick={() => onSelectDay(isSel ? null : ymd)}
                title={hols.length ? hols.map((h) => h.holidayName).join(", ") : undefined}
                className={`min-h-[84px] p-1.5 rounded-xl border text-left align-top transition-all ${
                  isSel ? "border-teal-600 bg-teal-100 ring-2 ring-teal-300"
                  : isToday ? "border-teal-500 bg-teal-50"
                  : hols.length ? "border-gray-200 hover:border-teal-300 hover:bg-gray-50"
                  : weekend ? "border-transparent bg-gray-50/70 hover:bg-gray-100"
                  : "border-transparent hover:bg-gray-50"
                }`}
              >
                <span className={`text-xs font-semibold ${isToday ? "text-teal-600" : weekend ? "text-gray-400" : "text-gray-700"}`}>{day}</span>
                <div className="mt-1 space-y-1">
                  {hols.map((h) => (
                    <span
                      key={h.id}
                      className={`block w-full truncate px-1.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                        weekend
                          ? "bg-gray-100 text-gray-500 border-gray-200"
                          : "bg-teal-50 text-teal-700 border-teal-200"
                      }`}
                    >
                      {h.holidayName || "Holiday"}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HolidayDialog({ existing, api, onClose, onSaved }) {
  const isEditing = !!existing;
  const [name, setName] = useState(existing?.holidayName || "");
  const [date, setDate] = useState(existing?.holidayDate || todayYmdPHT());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return setError("Enter a holiday name.");
    if (!validYmd(date)) return setError("Pick a valid date.");
    setSaving(true);
    setError("");
    try {
      await api(isEditing ? `/api/holidays/${existing.id}` : "/api/holidays", {
        method: isEditing ? "PUT" : "POST",
        body: { holidayName: name.trim(), holidayDate: date },
      });
      await onSaved(isEditing ? "Holiday updated." : "Holiday added.");
    } catch (e) {
      setError(`Failed to save: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEditing ? "Edit holiday" : "Add holiday"}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Add holiday"}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="Holiday name">
          <input
            autoFocus
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="e.g. Black Saturday"
          />
        </Field>
        <Field label="Date">
          <input type="date" className={inputCls} value={date} min="2000-01-01" max="2100-12-31" onChange={(e) => setDate(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1.5">{validYmd(date) ? weekdayOf(date) : "—"}</p>
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}