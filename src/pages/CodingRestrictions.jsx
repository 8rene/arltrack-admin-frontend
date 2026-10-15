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
      <button onClick={onView} className={`${actionBtn} border-gray-200 text-gray-600 hover:bg-gray-50`}>View</button>
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
  else if (!TIME_RE.test(startTime.trim())) errs.start = "Use h:mm AM/PM (e.g. 7:00 AM)";

  if (!endTime.trim()) errs.end = "Required";
  else if (!TIME_RE.test(endTime.trim())) errs.end = "Use h:mm AM/PM (e.g. 8:00 PM)";
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

// ─── City picker ─────────────────────────────────────────────────────────────
// Search-as-you-type over OpenStreetMap Nominatim (PH only). The live GPS check
// matches rules against the name Nominatim returns for a vehicle's position
// (address.city || town || municipality || county), so we pull the name the
// same way — a picked city is spelled exactly how the check will compare it.
//
// `value` is the committed city ("" until one is picked). Typing clears it, so
// a half-typed or misspelled name can never be saved by accident. For places
// that aren't official cities (e.g. "Clark"), "Use '…' as typed" is offered.
//
// Nominatim's usage policy allows ~1 request/second; the 600 ms debounce and
// 3-character minimum keep us well under that.
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

const cityNameOf = (r) => {
  const a = r.address || {};
  return a.city || a.town || a.municipality || a.county || r.name || null;
};

function CityPicker({ value, onChange, autoFocus = false, placeholder = "Search a city…" }) {
  const [query, setQuery] = useState(value || "");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || q === value) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          addressdetails: "1",
          countrycodes: "ph",
          featureType: "settlement",
          limit: "8",
          "accept-language": "en",
          q,
        });
        const res = await fetch(`${NOMINATIM_SEARCH}?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        const rows = await res.json();
        const seen = new Set();
        const out = [];
        for (const r of rows) {
          const name = cityNameOf(r);
          if (!name) continue;
          const a = r.address || {};
          const sub = a.province || a.county || a.state || "";
          const key = `${name}|${sub}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ name, sub });
        }
        setOptions(out);
        setFailed(false);
      } catch (e) {
        if (e.name !== "AbortError") {
          setOptions([]);
          setFailed(true);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, value]);

  const pick = (name) => {
    setQuery(name);
    setOpen(false);
    onChange(name);
  };

  const typed = query.trim();
  const showList = open && typed.length >= 3 && typed !== value;

  return (
    <div>
      <input
        autoFocus={autoFocus}
        className={`${inputCls} ${value ? "border-green-300 bg-green-50/40" : ""}`}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange(""); // editing un-selects the previous pick
        }}
        onFocus={() => setOpen(true)}
      />

      {value && <p className="text-xs text-green-600 mt-1">✓ Selected: {value}</p>}

      {showList && (
        <div className="mt-1 border border-gray-100 rounded-xl overflow-hidden bg-white shadow-sm">
          {loading && <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>}
          {!loading && failed && (
            <p className="px-3 py-2 text-xs text-red-500">Couldn't reach the map search. Try again, or use the name as typed.</p>
          )}
          {!loading && !failed && options.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">No matching city found.</p>
          )}
          {options.map((o) => (
            <button
              key={`${o.name}|${o.sub}`}
              type="button"
              onClick={() => pick(o.name)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 flex items-baseline justify-between gap-3 border-t border-gray-50 first:border-t-0"
            >
              <span className="font-medium text-gray-800">{o.name}</span>
              {o.sub && <span className="text-xs text-gray-400">{o.sub}</span>}
            </button>
          ))}
          {!loading && (
            <button
              type="button"
              onClick={() => pick(typed)}
              className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
            >
              Use “{typed}” as typed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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

  // If the opened city vanishes (its last rule deleted — here or elsewhere, or
  // it was renamed elsewhere), close the modal instead of showing an empty one.
  useEffect(() => {
    if (city && !loading && !data.cities.includes(city)) setCity(null);
  }, [city, data.cities, loading]);

  const cityRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.cities
      .filter((c) => !q || c.toLowerCase().includes(q))
      .map((c) => {
        const rules = data.rules.filter((r) => r.city === c);
        const days = [...new Set(rules.map((r) => r.dayOfWeek))].sort((a, b) => a - b);
        return { city: c, count: rules.length, days: days.map((d) => dayShort(DAY_NAMES[d - 1] || "?")).join(", ") };
      });
  }, [data, search]);

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
              : `${data.cities.length} cit${data.cities.length === 1 ? "y" : "ies"} with coding schedules. View a city to see its rules.`}
          </p>
        </div>
        <button onClick={() => setCityDialog(true)} className={btnPrimary}>+ Add city</button>
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
        <button onClick={load} disabled={loading} className="px-3 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50 ml-auto">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <ErrorBanner onRetry={load}>{error}</ErrorBanner>

      {/* ── City list ── */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm font-sans min-w-[520px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className={thCls}>City</th>
              <th className={thCls}>Rules</th>
              <th className={thCls}>Coding days</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={6} cols={4} />
            ) : cityRows.length === 0 ? (
              <EmptyRow cols={4}>
                {data.cities.length === 0 ? "No coding schedules yet. Add a city to get started." : "No city matches your search."}
              </EmptyRow>
            ) : (
              cityRows.map((r) => (
                <tr key={r.city} onClick={() => setCity(r.city)} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer">
                  <td className="px-5 py-3 font-semibold text-gray-800">{r.city}</td>
                  <td className="px-5 py-3 text-gray-600">{r.count === 1 ? "1 rule" : `${r.count} rules`}</td>
                  <td className="px-5 py-3 text-gray-500">{r.days || "—"}</td>
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      onView={() => setCity(r.city)}
                      onEdit={() => setCityToRename(r.city)}
                      onDelete={canDelete ? () => setCityToDelete(r) : null}
                    />
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
            setCityToRename(null);
            showToast(`Renamed to ${newName}.`);
            await load();
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
function CityRulesModal({ city, rules, canDelete, onClose, onAdd, onEdit, onDelete }) {
  return (
    <Modal
      title={city}
      width="max-w-3xl"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>Close</button>
          <button onClick={() => onAdd(null)} className={btnPrimary}>+ Add rule</button>
        </>
      }
    >
      <p className="text-sm text-gray-400 mb-4">
        Plates ending in the banned digits can't be driven in {city} during the window.
      </p>
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
// city on all of that city's rules at once. The new name is picked from a map
// search (CityPicker) so it can't be misspelled.
function RenameCityDialog({ oldName, existingCities, api, onClose, onSaved }) {
  const [name, setName] = useState(oldName); // committed pick; starts as the current city
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const next = name.trim();
    setError("");
    if (!next) return setError("Pick a city from the search results.");
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
          <CityPicker autoFocus value={name} onChange={setName} />
        </Field>
        <p className="text-xs text-gray-400">
          Currently <strong>{oldName}</strong>. Search for the correct city to move all of its coding rules to it.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
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
            <input className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="e.g. 7:00 AM" />
          </Field>
          <Field label="End time" error={showErrors && errs.end}>
            <input className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="e.g. 8:00 PM" />
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

function CityDialog({ existingCities, api, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState(() => Array.from({ length: MIN_RULES }, (_, i) => newRow(DAY_NAMES[i % 7])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rowErrs = rows.map(validateRule);

  const save = async () => {
    setShowErrors(true);
    setError("");
    const city = name.trim();
    if (!city) return setError("Pick a city from the search results.");
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
          <CityPicker autoFocus value={name} onChange={setName} placeholder="Search a city, e.g. Dagupan" />
        </Field>

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
                    <input className={inputCls} value={r.startTime} onChange={(ev) => setRow(i, { startTime: ev.target.value })} placeholder="7:00 AM" />
                  </Field>
                  <Field label="End" error={e.end}>
                    <input className={inputCls} value={r.endTime} onChange={(ev) => setRow(i, { endTime: ev.target.value })} placeholder="8:00 PM" />
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
