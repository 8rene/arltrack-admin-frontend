import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import usePolling from "../hooks/usePolling";
import CityMap from "../components/shared/CityMap";

// ─── Local helpers ───────────────────────────────────────────────────────────
// API helper, toast, modal/confirm dialog and shared styles — kept in this
// file so the page is self-contained, like the rest of the pages.

const API_URL = process.env.REACT_APP_API_URL;

const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

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

// z-[70]: above every modal, including dialogs opened on top of another modal.
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

// Modals share z-[60]; one rendered later in the JSX sits on top of an earlier
// one, which is how the rule / confirm dialogs stack over the city modal.
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

// Full-size buttons (not tiny text links) — same look as Holidays and Addresses.
const actionBtn = "px-4 py-2 text-sm font-semibold rounded-xl border transition";
const RowActions = ({ onView, onEdit, onDelete }) => (
  <div className="flex items-center gap-2 justify-end">
    {onView && (
      <button onClick={onView} className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">View</button>
    )}
    {onEdit && (
      <button onClick={onEdit} className={`${actionBtn} border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`}>Edit</button>
    )}
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

// ─── Coding Restrictions ─────────────────────────────────────────────────────
//
// City-first: a list of every city that has coding rules. "View" opens a modal
// with that city's Monday–Sunday day / time-window / banned-digit rules, so
// there is no separate screen to go back from. A coding-rule "city" is a plain
// string on the rule (not an address-hierarchy reference).
//
// Backend: routes/codingRules. View/add/edit — Owner, Admin, Supervisor.
// Delete — Owner and Admin only (mirrored here by `canDelete`).
//
// The live GPS check caches these rules for ~5 minutes (and holidays for
// ~1 hour), so a change can take that long to affect an in-progress trip.

// ── Validation (mirrors the backend so errors show before the request) ───────
const TIME_RE = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?([AaPp][Mm])$/;
const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s?([AaPp][Mm])$/.exec(String(t).trim());
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]);
};
const parseDigits = (text) =>
  String(text).split(",").map((s) => s.trim()).filter((s) => s !== "");

/** Returns { start, end, digits } error strings (or null) for one rule's raw inputs. */
const validateRule = ({ startTime, endTime, bannedDigits }) => {
  const errs = { start: null, end: null, digits: null };
  if (!startTime.trim()) errs.start = "Required";
  else if (!TIME_RE.test(startTime.trim())) errs.start = "Pick a time on the clock";

  if (!endTime.trim()) errs.end = "Required";
  else if (!TIME_RE.test(endTime.trim())) errs.end = "Pick a time on the clock";
  else if (!errs.start && toMinutes(endTime) <= toMinutes(startTime)) errs.end = "Must be after start time";

  const parts = parseDigits(bannedDigits);
  if (parts.length === 0) errs.digits = "Enter at least one digit";
  else {
    const seen = new Set();
    for (const p of parts) {
      if (!/^\d$/.test(p)) { errs.digits = "Single digits from 0–9, comma-separated"; break; }
      if (seen.has(p)) { errs.digits = `Digit ${p} is listed more than once`; break; }
      seen.add(p);
    }
  }
  return errs;
};
const hasErrors = (errs) => Object.values(errs).some(Boolean);

const dayShort = (d) => d.slice(0, 3);

// "Now" on the Manila wall clock (coding is evaluated in PHT by the backend).
const phtNow = () => {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return { ymd: d.toISOString().slice(0, 10), dow: d.getUTCDay() || 7, minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
};
// Digits in the weekly grid. Calm by default (plain numbers) so a full table
// isn't a wall of red; today's column gets soft teal chips so it stands out.
const MiniDigits = ({ digits, today = false }) =>
  today ? (
    <span className="inline-flex gap-1.5">
      {digits.map((d) => (
        <span key={d} className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-white border border-teal-200 text-teal-700 text-sm font-bold shadow-sm">
          {d}
        </span>
      ))}
    </span>
  ) : (
    <span className="inline-flex gap-2.5 text-base font-semibold text-gray-600 tabular-nums">
      {digits.map((d) => <span key={d}>{d}</span>)}
    </span>
  );

const IconBuilding = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);
const IconList = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
const IconClockSm = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Same look as the stat cards on Bookings / Payments: big number + tinted icon
// circle on top, small grey label underneath.
const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="p-4 rounded-2xl border bg-white">
    <div className="flex items-start justify-between">
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </span>
    </div>
    <div className="text-xs text-gray-400 mt-0.5">{label}</div>
  </div>
);

const DigitChips = ({ digits }) =>
  digits.length === 0 ? (
    <span className="text-gray-400">—</span>
  ) : (
    <div className="flex flex-wrap gap-1.5">
      {digits.map((d) => (
        <span key={d} className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-bold">
          {d}
        </span>
      ))}
    </div>
  );

// Tap-to-toggle plate digits (replaces typing "1, 2"). Selected = restricted,
// shown green. It reads/writes the same "1, 2" string the form already uses, so
// validation and saving are unchanged. Buttons follow plate order: 1–9, then 0.
const PLATE_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const DigitPicker = ({ value, onChange, size = "md" }) => {
  const selected = new Set(parseDigits(value));
  const toggle = (d) => {
    const next = new Set(selected);
    if (next.has(d)) next.delete(d); else next.add(d);
    onChange(PLATE_DIGITS.filter((x) => next.has(x)).join(", "));
  };
  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Banned digits">
      {PLATE_DIGITS.map((d) => {
        const on = selected.has(d);
        return (
          <button
            key={d} type="button" aria-pressed={on} onClick={() => toggle(d)}
            className={`${dim} rounded-xl border font-bold transition ${
              on ? "bg-green-500 border-green-500 text-white shadow-sm"
                 : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
};

export default function CodingRestrictions() {
  const { effectiveRole } = useAuth();
  const canDelete = effectiveRole === "Owner" || effectiveRole === "Admin";
  const api = useApi();
  const [toast, showToast] = useToast();

  const [data, setData] = useState({ cities: [], rules: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [city, setCity] = useState(null);       // city whose rules modal is open
  const [search, setSearch] = useState("");

  const [ruleDialog, setRuleDialog] = useState(null); // { rule, day } — rule null = adding
  const [cityDialog, setCityDialog] = useState(false);
  const [cityToRename, setCityToRename] = useState(null); // city name string
  const [toDelete, setToDelete] = useState(null);
  const [cityToDelete, setCityToDelete] = useState(null); // { city, count }
  const [busy, setBusy] = useState(false);

  const [holidays, setHolidays] = useState([]);

  const load = useCallback(async () => {
    try {
      const json = await api("/api/coding-rules");
      setData(json.data || { cities: [], rules: [] });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  usePolling(load, 60000);

  // Holidays (to show "coding suspended today"). Best-effort: if it fails the page still works.
  const loadExtras = useCallback(async () => {
    try {
      const h = await api("/api/holidays");
      setHolidays(Array.isArray(h.data) ? h.data : []);
    } catch { /* ignore */ }
  }, [api]);
  useEffect(() => { loadExtras(); }, [loadExtras]);

  // If the opened city vanishes (its last rule deleted — here or elsewhere, or
  // it was renamed elsewhere), close the modal instead of showing an empty one.
  useEffect(() => {
    if (city && !loading && !data.cities.includes(city)) setCity(null);
  }, [city, data.cities, loading]);

  const now = phtNow();
  const holidayToday = holidays.find((h) => h.holidayDate === now.ymd) || null;

  // Mon–Fri always; Sat/Sun only if some city actually has a weekend rule.
  const gridDays = [1, 2, 3, 4, 5, 6, 7].filter((n) => n <= 5 || data.rules.some((r) => r.dayOfWeek === n));

  const cityRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.cities
      .filter((c) => !q || c.toLowerCase().includes(q))
      .map((c) => {
        const rules = data.rules.filter((r) => r.city === c);
        const byDay = {};
        rules.forEach((r) => { (byDay[r.dayOfWeek] = byDay[r.dayOfWeek] || []).push(r); });
        return { city: c, count: rules.length, byDay };
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search]);

  // Everything restricted today (skipped entirely on a holiday).
  const todayAll = useMemo(
    () => (holidayToday ? [] : data.rules.filter((r) => r.dayOfWeek === now.dow)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.rules, holidayToday, now.dow]
  );
  const todayCities = new Set(todayAll.map((r) => r.city)).size;

  const cityRules = useMemo(
    () => (city ? data.rules.filter((r) => r.city === city) : []),
    [data.rules, city]
  );
  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api(`/api/coding-rules/${toDelete.id}`, { method: "DELETE" });
      showToast("Coding rule deleted.");
      setToDelete(null);
      await load();
    } catch (e) {
      showToast(`Failed to delete: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteCity = async () => {
    setBusy(true);
    try {
      await api(`/api/coding-rules/city/${encodeURIComponent(cityToDelete.city)}`, { method: "DELETE" });
      showToast(`Deleted ${cityToDelete.city}.`);
      setCityToDelete(null);
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

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Coding Restrictions</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading
              ? "Loading…"
              : `${data.cities.length} cit${data.cities.length === 1 ? "y" : "ies"} with coding schedules. Hover a day to see its time window, or view a city for the details.`}
          </p>
        </div>
        <button onClick={() => setCityDialog(true)} className={btnPrimary}>+ Add city</button>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Cities" value={loading ? "…" : data.cities.length} icon={IconBuilding} color="bg-teal-50 text-teal-600" />
        <StatCard label="Rules" value={loading ? "…" : data.rules.length} icon={IconList} color="bg-blue-50 text-blue-600" />
        <StatCard
          label={holidayToday ? "Coding today (holiday — suspended)" : "Cities with coding today"}
          value={loading ? "…" : holidayToday ? 0 : todayCities}
          icon={IconClockSm}
          color="bg-yellow-50 text-yellow-600"
        />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <input
          type="text"
          placeholder="Search city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-100 w-56"
        />
        <button onClick={() => { load(); loadExtras(); }} disabled={loading} className="px-3 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 ml-auto">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <ErrorBanner onRetry={load}>{error}</ErrorBanner>

      {/* ── City list: one row per city, Monday–Sunday at a glance ── */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full table-fixed text-sm font-sans min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className={`${thCls} w-48`}>City</th>
              {gridDays.map((n) => (
                <th key={n} className={`px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider ${now.dow === n ? "text-teal-600 bg-teal-50/60" : "text-gray-400"}`}>
                  {dayShort(DAY_NAMES[n - 1])}
                </th>
              ))}
              <th className="w-28 px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={6} cols={gridDays.length + 2} />
            ) : cityRows.length === 0 ? (
              <EmptyRow cols={gridDays.length + 2}>
                {data.cities.length === 0 ? "No coding schedules yet. Add a city to get started." : "No city matches your search."}
              </EmptyRow>
            ) : (
              cityRows.map((r) => (
                <tr key={r.city} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-800">{r.city}</p>
                  </td>
                  {gridDays.map((n) => {
                    const rs = r.byDay[n] || [];
                    return (
                      <td key={n} className={`px-2 py-3 text-center ${now.dow === n ? "bg-teal-50/60" : ""}`}>
                        {rs.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1" title={rs.map((x) => `${x.startTime} – ${x.endTime}`).join(", ")}>
                            {rs.map((x) => <MiniDigits key={x.id} digits={x.bannedDigits} today={now.dow === n} />)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-5 py-3">
                    <RowActions onView={() => setCity(r.city)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── One city's rules (modal) ── */}
      {city && (
        <CityRulesModal
          city={city}
          rules={cityRules}
          canDelete={canDelete}
          onClose={() => setCity(null)}
          onEditCity={() => setCityToRename(city)}
          onDeleteCity={() => setCityToDelete({ city, count: cityRules.length })}
          onAdd={(day) => setRuleDialog({ rule: null, day })}
          onEdit={(rule) => setRuleDialog({ rule, day: null })}
          onDelete={(rule) => setToDelete(rule)}
        />
      )}

      {/* Dialogs below are rendered after the city modal so they stack on top of it. */}
      {ruleDialog && (
        <RuleDialog
          city={city}
          existing={ruleDialog.rule}
          defaultDay={ruleDialog.day}
          api={api}
          onClose={() => setRuleDialog(null)}
          onSaved={async (msg) => { setRuleDialog(null); showToast(msg); await load(); }}
        />
      )}

      {cityDialog && (
        <CityDialog
          existingCities={data.cities}
          allRules={data.rules}
          api={api}
          onClose={() => setCityDialog(false)}
          onSaved={async (name) => {
            setCityDialog(false);
            showToast(`Added ${name}.`);
            await load();
            setCity(name);
          }}
        />
      )}

      {cityToRename && (
        <RenameCityDialog
          oldName={cityToRename}
          existingCities={data.cities}
          api={api}
          onClose={() => setCityToRename(null)}
          onSaved={async (newName) => {
            const old = cityToRename;
            setCityToRename(null);
            showToast(`Renamed to ${newName}.`);
            await load();
            if (city === old) setCity(newName);
          }}
        />
      )}

      {cityToDelete && (
        <ConfirmDialog
          title="Delete city?"
          danger
          confirmLabel="Delete city"
          busy={busy}
          onConfirm={confirmDeleteCity}
          onCancel={() => setCityToDelete(null)}
        >
          Remove <strong>{cityToDelete.city}</strong> and {cityToDelete.count === 1 ? "its 1 coding rule" : `all ${cityToDelete.count} of its coding rules`}?
          Vehicles won't be checked for coding in this city anymore. This can't be undone.
        </ConfirmDialog>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete coding rule?"
          danger
          confirmLabel="Delete"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        >
          Remove the <strong>{toDelete.dayName}</strong> rule ({toDelete.startTime} – {toDelete.endTime},
          digits {toDelete.bannedDigits.join(", ")}) for <strong>{toDelete.city}</strong>?
        </ConfirmDialog>
      )}
    </div>
  );
}

// ─── A city's Monday–Sunday rules, in a modal ────────────────────────────────
// Every day of the week gets a row. Days with no rule show "No coding" with an
// Add button that pre-selects that day.
function CityRulesModal({ city, rules, canDelete, onClose, onEditCity, onDeleteCity, onAdd, onEdit, onDelete }) {
  return (
    <Modal
      title={city}
      width="max-w-3xl"
      onClose={onClose}
      footer={
        <>
          {canDelete && (
            <button onClick={onDeleteCity} className={`${actionBtn} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}>
              Delete
            </button>
          )}
          <button onClick={onClose} className={btnGhost}>Close</button>
        </>
      }
    >
      <p className="text-sm text-gray-400 mb-4">
        Plates ending in the banned digits can't be driven in {city} during the window.
      </p>
      <div className="mb-3">
        <CityMap readOnly value={city} />
      </div>
      <div className="flex justify-end mb-4">
        <button onClick={onEditCity} className={`${actionBtn} border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`}>
          Edit
        </button>
      </div>
      <div className="border border-gray-100 rounded-2xl overflow-x-auto mb-2">
        <table className="w-full text-sm font-sans min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className={thCls}>Day</th>
              <th className={thCls}>Time window</th>
              <th className={thCls}>Banned digits</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.flatMap((day) => {
              const dayCell = (
                <td className="px-5 py-3 font-semibold text-gray-800 whitespace-nowrap">
                  {day}
                </td>
              );
              const dayRules = rules.filter((r) => r.dayName === day);

              if (dayRules.length === 0) {
                return [
                  <tr key={day} className="border-b border-gray-50">
                    {dayCell}
                    <td className="px-5 py-3 text-gray-400" colSpan={2}>No coding</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => onAdd(day)}
                          className={`${actionBtn} border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`}
                        >
                          + Add
                        </button>
                      </div>
                    </td>
                  </tr>,
                ];
              }

              return dayRules.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  {dayCell}
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{r.startTime} – {r.endTime}</td>
                  <td className="px-5 py-3"><DigitChips digits={r.bannedDigits} /></td>
                  <td className="px-5 py-3">
                    <RowActions
                      onEdit={() => onEdit(r)}
                      onDelete={canDelete ? () => onDelete(r) : null}
                    />
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ─── Rename a city ───────────────────────────────────────────────────────────
// Coding-rule cities are plain strings on each rule, so renaming changes the
// city on all of that city's rules at once. The new name is picked on the map
// (CityMap) so it is exactly what the live GPS check will compare against.
function RenameCityDialog({ oldName, existingCities, api, onClose, onSaved }) {
  const [name, setName] = useState(oldName); // committed pick; starts as the current city
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const next = name.trim();
    setError("");
    if (!next) return setError("Pick a city on the map.");
    if (next === oldName) return onClose();
    if (existingCities.some((c) => c !== oldName && c.toLowerCase() === next.toLowerCase())) {
      return setError(`"${next}" already exists.`);
    }
    setSaving(true);
    try {
      await api(`/api/coding-rules/city/${encodeURIComponent(oldName)}`, {
        method: "PUT",
        body: { city: next },
      });
      await onSaved(next);
    } catch (e) {
      setError(`Failed to rename: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Rename city"
      width="max-w-xl"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save changes"}</button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="City">
          <CityMap
            autoFocus
            value={name}
            onChange={setName}
            takenCities={existingCities.filter((c) => c !== oldName)}
          />
        </Field>
        <p className="text-xs text-gray-400">
          Currently <strong>{oldName}</strong>. Pick the correct city on the map to move all of its coding rules to it.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}

// ─── ClockTimePicker ─────────────────────────────────────────────────────────
// Pick a time on a clock face instead of typing it.
//
//   <ClockTimePicker value={startTime} onChange={setStartTime} placeholder="7:00 AM" defaultValue="7:00 AM" />
//
// `value` / `onChange` use the same "h:mm AM/PM" text the page already
// validates and sends to the backend (e.g. "7:00 AM"), so nothing else changes.
// `value` may be "" (nothing picked yet).
//
// How it works: tap the field → a clock opens. Pick the HOUR (tap or drag on the
// dial), the dial then switches to MINUTES (tap or drag for any minute), choose
// AM / PM, press OK. Nothing is applied until OK. The clock is drawn in a portal
// so it is never clipped by a scrolling modal.

const CLOCK_PARSE = /^(\d{1,2}):(\d{2})\s?([AaPp][Mm])$/;
const CLOCK_POP_W = 272;
const CLOCK_POP_H = 392; // approximate, used only to decide whether to open upward

function parseClock(value, fallback) {
  const m = CLOCK_PARSE.exec(String(value || "").trim()) || CLOCK_PARSE.exec(fallback || "7:00 AM");
  const h = Number(m[1]);
  return { h: h >= 1 && h <= 12 ? h : 12, m: Math.min(59, Number(m[2])), ap: m[3].toUpperCase() };
}
const formatClock = ({ h, m, ap }) => `${h}:${String(m).padStart(2, "0")} ${ap}`;

// ── The dial ────────────────────────────────────────────────────────────────
const CLOCK_SIZE = 232;
const CK = CLOCK_SIZE / 2;
const CLOCK_R_LABEL = 84;
const CLOCK_R_HAND = 76;
const clockPolar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [CK + r * Math.sin(a), CK - r * Math.cos(a)];
};

function ClockDial({ mode, h, m, onHour, onMinute, onDone }) {
  const svg = useRef(null);
  const dragging = useRef(false);

  const fromPointer = (e) => {
    const rect = svg.current.getBoundingClientRect();
    const x = e.clientX - (rect.left + rect.width / 2);
    const y = e.clientY - (rect.top + rect.height / 2);
    const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    if (mode === "hour") onHour(Math.round(deg / 30) % 12 || 12);
    else onMinute(Math.round(deg / 6) % 60);
  };

  const down = (e) => {
    dragging.current = true;
    svg.current.setPointerCapture?.(e.pointerId);
    fromPointer(e);
  };
  const move = (e) => { if (dragging.current) fromPointer(e); };
  const up = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onDone(); // hour → jump to minutes
  };

  const deg = mode === "hour" ? (h % 12) * 30 : m * 6;
  const [hx, hy] = clockPolar(deg, CLOCK_R_HAND);
  const onFive = mode === "minute" && m % 5 !== 0; // minute between the labelled marks

  const marks = mode === "hour"
    ? Array.from({ length: 12 }, (_, i) => ({ label: String(i === 0 ? 12 : i), deg: i * 30, on: (i === 0 ? 12 : i) === h }))
    : Array.from({ length: 12 }, (_, i) => ({ label: String(i * 5).padStart(2, "0"), deg: i * 30, on: i * 5 === m }));

  return (
    <svg
      ref={svg}
      width={CLOCK_SIZE}
      height={CLOCK_SIZE}
      viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
      className="touch-none select-none cursor-pointer mx-auto block"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="group"
      aria-label={mode === "hour" ? "Choose the hour" : "Choose the minutes"}
    >
      <circle cx={CK} cy={CK} r={CK - 2} fill="#f3f4f6" />
      <line x1={CK} y1={CK} x2={hx} y2={hy} stroke="#0d9488" strokeWidth="2" />
      <circle cx={CK} cy={CK} r="4" fill="#0d9488" />
      <circle cx={hx} cy={hy} r={onFive ? 5 : 18} fill="#0d9488" />
      {marks.map((k) => {
        const [x, y] = clockPolar(k.deg, CLOCK_R_LABEL);
        return (
          <text
            key={k.label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="14"
            fontWeight={k.on ? 700 : 500}
            fill={k.on ? "#ffffff" : "#374151"}
            pointerEvents="none"
          >
            {k.label}
          </text>
        );
      })}
    </svg>
  );
}

// ── The popover ─────────────────────────────────────────────────────────────
function ClockPopover({ anchor, initial, onApply, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [mode, setMode] = useState("hour");
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const ref = useRef(null);

  const place = () => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight || CLOCK_POP_H;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - CLOCK_POP_W - 8));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 >= 8) top = r.top - h - 6; // open upward
    setPos({ top: Math.max(8, top), left });
  };
  useLayoutEffect(place, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true); // follow the field when the modal scrolls
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = (active) =>
    `px-2 py-1 rounded-lg text-3xl font-semibold tabular-nums transition ${active ? "bg-teal-50 text-teal-700" : "text-gray-500 hover:bg-gray-50"}`;
  const apBtn = (on) =>
    `px-2.5 py-1.5 text-xs font-bold transition ${on ? "bg-teal-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Pick a time"
      className="fixed z-[200] bg-white rounded-2xl shadow-xl border border-gray-100 p-4"
      style={{ top: pos.top, left: pos.left, width: CLOCK_POP_W }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <button type="button" className={seg(mode === "hour")} onClick={() => setMode("hour")}>{draft.h}</button>
        <span className="text-3xl font-semibold text-gray-400">:</span>
        <button type="button" className={seg(mode === "minute")} onClick={() => setMode("minute")}>
          {String(draft.m).padStart(2, "0")}
        </button>
        <div className="ml-2 flex flex-col rounded-lg overflow-hidden border border-gray-200">
          {["AM", "PM"].map((a) => (
            <button key={a} type="button" className={apBtn(draft.ap === a)} onClick={() => setDraft((d) => ({ ...d, ap: a }))}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <ClockDial
        mode={mode}
        h={draft.h}
        m={draft.m}
        onHour={(h) => setDraft((d) => ({ ...d, h }))}
        onMinute={(m) => setDraft((d) => ({ ...d, m }))}
        onDone={() => setMode((x) => (x === "hour" ? "minute" : x))}
      />

      <p className="text-[11px] text-gray-400 text-center mt-2">
        {mode === "hour" ? "Pick the hour" : "Pick the minutes — drag for any minute"}
      </p>

      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(formatClock(draft))}
          className="px-3 py-1.5 text-sm font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700"
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── The field ───────────────────────────────────────────────────────────────
function ClockTimePicker({ value, onChange, placeholder = "Pick a time", defaultValue = "7:00 AM", className = "" }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-300 ${className}`}
      >
        <span className={value ? "text-gray-800" : "text-gray-400"}>{value || placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      {open && (
        <ClockPopover
          anchor={btn.current}
          initial={parseClock(value, defaultValue)}
          onApply={(v) => { onChange(v); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Add / edit one rule ─────────────────────────────────────────────────────
function RuleDialog({ city, existing, defaultDay, api, onClose, onSaved }) {
  const isEditing = !!existing;
  const [dayName, setDayName] = useState(existing?.dayName || defaultDay || DAY_NAMES[0]);
  const [startTime, setStartTime] = useState(existing?.startTime || "");
  const [endTime, setEndTime] = useState(existing?.endTime || "");
  const [digits, setDigits] = useState(existing ? existing.bannedDigits.join(", ") : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const errs = validateRule({ startTime, endTime, bannedDigits: digits });

  const save = async () => {
    setShowErrors(true);
    if (hasErrors(errs)) return;
    setSaving(true);
    setError("");
    try {
      const body = { dayName, startTime: startTime.trim(), endTime: endTime.trim(), bannedDigits: parseDigits(digits).map(Number) };
      await api(isEditing ? `/api/coding-rules/${existing.id}` : "/api/coding-rules", {
        method: isEditing ? "PUT" : "POST",
        body: isEditing ? body : { city, ...body },
      });
      await onSaved(isEditing ? "Coding rule updated." : "Coding rule added.");
    } catch (e) {
      setError(`Failed to save: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEditing ? "Edit coding rule" : "Add coding rule"}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Add rule"}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="City">
          <input className={`${inputCls} bg-gray-50`} value={city} readOnly />
        </Field>
        <Field label="Day">
          <select className={inputCls} value={dayName} onChange={(e) => setDayName(e.target.value)}>
            {DAY_NAMES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time" error={showErrors && errs.start}>
            <ClockTimePicker value={startTime} onChange={setStartTime} placeholder="Pick a time" defaultValue="7:00 AM" />
          </Field>
          <Field label="End time" error={showErrors && errs.end}>
            <ClockTimePicker value={endTime} onChange={setEndTime} placeholder="Pick a time" defaultValue="8:00 PM" />
          </Field>
        </div>
        <Field label="Banned digits" error={showErrors && errs.digits}>
          <DigitPicker value={digits} onChange={setDigits} />
          <p className="text-xs text-gray-400 mt-1">Tap the last digits of the plates that can't drive on this day (green = restricted).</p>
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}

// ─── Add a whole new city (needs a minimum number of rules) ──────────────────
const MIN_RULES = 5;
const newRow = (dayName) => ({ dayName, startTime: "", endTime: "", bannedDigits: "" });

function CityDialog({ existingCities, allRules, api, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState(() => Array.from({ length: MIN_RULES }, (_, i) => newRow(DAY_NAMES[i % 7])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rowErrs = rows.map(validateRule);

  // Pre-fill the rows from an existing city's schedule (still editable after).
  const copyFrom = (src) => {
    if (!src) return;
    const copied = allRules
      .filter((r) => r.city === src)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((r) => ({ dayName: r.dayName, startTime: r.startTime, endTime: r.endTime, bannedDigits: r.bannedDigits.join(", ") }));
    while (copied.length < MIN_RULES) copied.push(newRow(DAY_NAMES[copied.length % 7]));
    setRows(copied);
    setShowErrors(false);
  };

  const save = async () => {
    setShowErrors(true);
    setError("");
    const city = name.trim();
    if (!city) return setError("Pick a city on the map.");
    if (existingCities.some((c) => c.toLowerCase() === city.toLowerCase())) {
      return setError(`"${city}" already exists — view it from the city list instead.`);
    }
    if (rows.length < MIN_RULES) return setError(`A new city needs at least ${MIN_RULES} coding rules.`);
    if (rowErrs.some(hasErrors)) return setError("Fix the highlighted rule fields.");

    setSaving(true);
    try {
      await api("/api/coding-rules/city", {
        method: "POST",
        body: {
          city,
          rules: rows.map((r) => ({
            dayName: r.dayName,
            startTime: r.startTime.trim(),
            endTime: r.endTime.trim(),
            bannedDigits: parseDigits(r.bannedDigits).map(Number),
          })),
        },
      });
      await onSaved(city);
    } catch (e) {
      setError(`Failed to add city: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add city"
      width="max-w-3xl"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? "Adding…" : "Add city"}</button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <p className="text-xs text-gray-400">
          A new city needs at least {MIN_RULES} coding rules so its week is covered from day one.
        </p>
        <Field label="City">
          <CityMap
            autoFocus
            value={name}
            onChange={setName}
            takenCities={existingCities}
            placeholder="Search a city, e.g. Dagupan — then confirm it on the map"
          />
        </Field>

        {existingCities.length > 0 && (
          <Field label="Copy schedule from (optional)">
            <select className={inputCls} defaultValue="" onChange={(e) => copyFrom(e.target.value)}>
              <option value="">Start blank</option>
              {existingCities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}

        <div className="space-y-3">
          {rows.map((r, i) => {
            const e = showErrors ? rowErrs[i] : {};
            return (
              <div key={i} className="rounded-xl border border-gray-100 p-3 bg-gray-50/40">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Field label="Day">
                    <select className={inputCls} value={r.dayName} onChange={(ev) => setRow(i, { dayName: ev.target.value })}>
                      {DAY_NAMES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Start" error={e.start}>
                    <ClockTimePicker value={r.startTime} onChange={(v) => setRow(i, { startTime: v })} placeholder="Pick a time" defaultValue="7:00 AM" />
                  </Field>
                  <Field label="End" error={e.end}>
                    <ClockTimePicker value={r.endTime} onChange={(v) => setRow(i, { endTime: v })} placeholder="Pick a time" defaultValue="8:00 PM" />
                  </Field>
                </div>
                <div className="mt-2">
                  <Field label="Banned digits" error={e.digits}>
                    <DigitPicker size="sm" value={r.bannedDigits} onChange={(v) => setRow(i, { bannedDigits: v })} />
                  </Field>
                </div>
                {rows.length > MIN_RULES && (
                  <button
                    onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-500 hover:text-red-600 font-semibold mt-2"
                  >
                    Remove row
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setRows((rs) => [...rs, newRow(DAY_NAMES[0])])}
          className="text-xs font-semibold text-teal-600 hover:text-teal-700"
        >
          + Add row
        </button>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}