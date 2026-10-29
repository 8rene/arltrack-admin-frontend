import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import usePolling from "../hooks/usePolling";

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
  "px-4 py-2 text-sm font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 transition";

const btnGhost =
  "px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition";

const btnDanger =
  "px-4 py-2 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 transition";

const thCls =
  "text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider";

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

// Full-size buttons (not tiny text links) so the Actions column isn't mostly empty.
const actionBtn = "px-4 py-2 text-sm font-semibold rounded-xl border transition";
const RowActions = ({ onView, onEdit, onDelete }) => (
  <div className="flex items-center gap-2 justify-end">
    {onView && (
      <button onClick={onView} className={`${actionBtn} border-gray-200 text-gray-600 hover:bg-gray-50`}>View</button>
    )}
    <button onClick={onEdit} className={`${actionBtn} border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`}>Edit</button>
    {onDelete && (
      <button onClick={onDelete} className={`${actionBtn} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}>Delete</button>
    )}
  </div>
);

const SkeletonRows = ({ rows = 6, cols = 4 }) =>
  Array.from({ length: rows }).map((_, i) => (
    <tr key={i} className="border-b border-gray-50">
      {Array.from({ length: cols }).map((__, j) => (
        <td key={j} className="px-5 py-4">
          <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  ));

const EmptyRow = ({ cols, children }) => (
  <tr>
    <td colSpan={cols} className="px-5 py-12 text-center text-sm text-gray-400">{children}</td>
  </tr>
);

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

  const [dialog, setDialog] = useState(null);       // { holiday, date } — holiday null = adding (date pre-fills it)
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

  // Same data the original tab showed live — here refreshed every minute
  // while the tab is visible (and immediately after any change).
  usePolling(load, 60000);

  // The year the list currently sits in = the first holiday's year (same
  // rule the original used), falling back to the current year when empty.
  const today = todayYmdPHT();
  const displayYear = holidays.find((h) => h.holidayDate)
    ? parseYmd(holidays.find((h) => h.holidayDate).holidayDate).y
    : Number(today.slice(0, 4));
  // Calendar starts on the current month when the list is on this year, else January.
  const cal = calMonth || {
    y: displayYear,
    m: Number(today.slice(0, 4)) === displayYear ? Number(today.slice(5, 7)) - 1 : 0,
  };

  const visible = useMemo(() => {
    const list = holidays.filter((h) => !month || (h.holidayDate && parseYmd(h.holidayDate).m === Number(month)));
    // YYYY-MM-DD strings sort correctly as text; holidays with no date go last.
    return [...list].sort((a, b) => {
      if (!a.holidayDate) return 1;
      if (!b.holidayDate) return -1;
      return sortDir === "asc" ? a.holidayDate.localeCompare(b.holidayDate) : b.holidayDate.localeCompare(a.holidayDate);
    });
  }, [holidays, month, sortDir]);

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
    <div className="w-full px-4">
      <Toast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Holidays</h1>
        </div>
        <button onClick={() => setDialog({ holiday: null, date: null })} className={btnPrimary}>
          + Add holiday
        </button>
      </div>

      <ErrorBanner onRetry={load}>{error}</ErrorBanner>

      <HolidayCalendar
        holidays={holidays}
        cal={cal}
        setCalMonth={setCalMonth}
        today={today}
        yearLocked={holidays.length > 0 ? displayYear : null}
        onEdit={(h) => setDialog({ holiday: h, date: null })}
        onAdd={(ymd) => setDialog({ holiday: null, date: ymd })}
      />

      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div className="w-48">
          <Field label="Filter by month">
            <select className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </div>
        <button onClick={load} disabled={loading} className="px-3 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 ml-auto">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm font-sans min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <SortableTh label="Date" active dir={sortDir} onSort={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} />
              <th className={thCls}>Holiday</th>
              <th className={thCls}>Day</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={6} cols={4} />
            ) : visible.length === 0 ? (
              <EmptyRow cols={4}>
                {holidays.length === 0 ? "No holidays yet. Add the first one." : "No holidays in that month."}
              </EmptyRow>
            ) : (
              visible.map((h) => {
                const isToday = h.holidayDate === today;
                const isPast = h.holidayDate && h.holidayDate < today;
                return (
                  <tr key={h.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${isPast ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(h.holidayDate)}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">
                      {h.holidayName || "—"}
                      {isToday && <span className="ml-2 align-middle"><Pill tone="green">Today</Pill></span>}
                      {isWeekendYmd(h.holidayDate) && <span className="ml-2 align-middle"><Pill tone="gray">Weekend</Pill></span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{h.holidayDay || "—"}</td>
                    <td className="px-5 py-3">
                      <RowActions
                        onEdit={() => setDialog({ holiday: h, date: null })}
                        onDelete={canDelete ? () => setToDelete(h) : null}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dialog && (
        <HolidayDialog
          existing={dialog.holiday}
          defaultDate={dialog.date}
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
    <th className="px-5 py-3 text-left select-none">
      <button
        onClick={onSort}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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
// Same look as the Maintenance calendar. A holiday shows as a teal chip with its
// name (click it to edit); clicking an empty day adds a holiday on that date.
// Weekend holidays are grey — number coding doesn't run on weekends anyway.
// With a list loaded, the month arrows stay inside the list's year.
function HolidayCalendar({ holidays, cal, setCalMonth, today, yearLocked, onEdit, onAdd }) {
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 mb-4">
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
          const weekend = i % 7 === 0 || i % 7 === 6;
          const hols = byDate[ymd] || [];
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              title={hols.length ? undefined : `Add a holiday on ${MONTH_NAMES[m]} ${day}`}
              onClick={() => onAdd(ymd)}
              onKeyDown={(e) => e.key === "Enter" && onAdd(ymd)}
              className={`min-h-[84px] p-1.5 rounded-xl border cursor-pointer transition-all ${
                isToday ? "border-teal-500 bg-teal-50"
                : hols.length ? "border-gray-200 hover:border-teal-300"
                : weekend ? "border-transparent bg-gray-50/70 hover:bg-gray-100"
                : "border-transparent hover:bg-gray-50"
              }`}
            >
              <span className={`text-xs font-semibold ${isToday ? "text-teal-600" : weekend ? "text-gray-400" : "text-gray-700"}`}>{day}</span>
              <div className="mt-1 space-y-1">
                {hols.map((h) => (
                  <button
                    key={h.id}
                    onClick={(e) => { e.stopPropagation(); onEdit(h); }}
                    title={`${h.holidayName}${weekend ? " — weekend, no coding anyway" : ""} (click to edit)`}
                    className={`block w-full truncate text-left px-1.5 py-0.5 rounded-md text-[11px] font-semibold border transition ${
                      weekend
                        ? "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                        : "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                    }`}
                  >
                    {h.holidayName || "Holiday"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal-100 border border-teal-200" />Holiday (coding suspended)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" />Weekend holiday (no coding anyway)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-teal-500 bg-teal-50" />Today</span>
        <span className="ml-auto text-gray-400">Click a holiday to edit · click an empty day to add one</span>
      </div>
    </div>
  );
}

function HolidayDialog({ existing, defaultDate, api, onClose, onSaved }) {
  const isEditing = !!existing;
  const [name, setName] = useState(existing?.holidayName || "");
  const [date, setDate] = useState(existing?.holidayDate || defaultDate || todayYmdPHT());
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