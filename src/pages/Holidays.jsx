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

  const [dialog, setDialog] = useState(null);       // { holiday } — holiday null = adding
  const [toDelete, setToDelete] = useState(null);
  const [pendingYear, setPendingYear] = useState(null);
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
  const yearOptions = useMemo(() => {
    const cur = Number(today.slice(0, 4));
    const set = new Set([displayYear]);
    for (let y = cur - 6; y <= cur + 6; y++) set.add(y);
    return [...set].sort((a, b) => a - b);
  }, [displayYear, today]);

  const visible = useMemo(
    () => holidays.filter((h) => !month || (h.holidayDate && parseYmd(h.holidayDate).m === Number(month))),
    [holidays, month]
  );

  const confirmRetrace = async () => {
    setBusy(true);
    try {
      const json = await api("/api/holidays/retrace", { method: "POST", body: { year: pendingYear } });
      setHolidays(json.data || []);
      showToast(`Retraced ${json.updated} holiday${json.updated === 1 ? "" : "s"} to ${pendingYear}.`);
      setPendingYear(null);
    } catch (e) {
      showToast(`Failed to update holidays for ${pendingYear}: ${e.message}`, "error");
      setPendingYear(null);
    } finally {
      setBusy(false);
    }
  };

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
          <p className="text-sm text-gray-400 mt-0.5">
            {loading
              ? "Loading…"
              : `${visible.length}${month ? ` of ${holidays.length}` : ""} holiday${holidays.length === 1 ? "" : "s"} in ${displayYear}`}
            {" · "}Number coding is suspended on these dates.
          </p>
        </div>
        <button onClick={() => setDialog({ holiday: null })} className={btnPrimary}>
          + Add holiday
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div className="w-32">
          <Field label="Year">
            <select
              className={inputCls}
              value={displayYear}
              disabled={loading || holidays.length === 0}
              onChange={(e) => {
                const y = Number(e.target.value);
                if (y !== displayYear) setPendingYear(y);
              }}
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        </div>
        <div className="w-48">
          <Field label="Filter by month">
            <select className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </div>
        <button onClick={load} disabled={loading} className="px-3 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50 ml-auto">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Changing the year moves every holiday onto it. Holy Week and National Heroes Day are recalculated;
        Chinese New Year, Eid al-Fitr and Eid al-Adha follow lunar/proclaimed dates, so check those manually.
      </p>

      <ErrorBanner onRetry={load}>{error}</ErrorBanner>

      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm font-sans min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className={thCls}>Date</th>
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
                const { m, d } = h.holidayDate ? parseYmd(h.holidayDate) : { m: 1, d: 0 };
                return (
                  <tr key={h.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${isPast ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 shrink-0 rounded-xl border border-teal-100 bg-teal-50 text-center py-1">
                          <div className="text-[10px] font-semibold uppercase text-teal-600">{MONTH_NAMES[m - 1].slice(0, 3)}</div>
                          <div className="text-base font-bold text-teal-700 leading-tight">{d || "—"}</div>
                        </div>
                        <span className="text-gray-500 whitespace-nowrap">{fmtDate(h.holidayDate)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-semibold text-gray-800">
                      {h.holidayName || "—"}
                      {isToday && <span className="ml-2 align-middle"><Pill tone="green">Today</Pill></span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{h.holidayDay || "—"}</td>
                    <td className="px-5 py-3">
                      <RowActions
                        onEdit={() => setDialog({ holiday: h })}
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

      {pendingYear && (
        <ConfirmDialog
          title={`Move all holidays to ${pendingYear}?`}
          confirmLabel={`Move to ${pendingYear}`}
          busy={busy}
          onConfirm={confirmRetrace}
          onCancel={() => setPendingYear(null)}
        >
          This rewrites the date of all <strong>{holidays.length}</strong> holidays from {displayYear} to {pendingYear}.
          Any date you set by hand will be replaced, and it affects number-coding suspension right away.
        </ConfirmDialog>
      )}
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