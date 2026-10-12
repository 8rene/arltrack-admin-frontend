import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

// ─── Local helpers ───────────────────────────────────────────────────────────
// API helper, toast, modal/confirm dialog and shared styles — kept in this
// file so the page is self-contained, like the rest of the pages.

const API_URL = process.env.REACT_APP_API_URL;

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

// ─── Addresses ───────────────────────────────────────────────────────────────
//
// The 4-level PH address hierarchy: Region → Province → Municipality →
// Barangay. Everything is loaded in one request and filtered client-side
// (the full set is a few thousand tiny rows). After an add/edit/delete the
// local copy is patched from the server's response instead of refetching —
// barangays alone are ~2,600 docs, so a refetch per edit would be wasteful.
//
// Backend: routes/addresses. View/add/edit — Owner, Admin, Supervisor.
// Delete — Owner and Admin only (mirrored here by `canDelete`).
//
// Every add/edit requires picking the parent (region for a province, …) so
// the hierarchy never gets a dangling link. Deleting does NOT cascade — a
// deleted region's provinces stay in place (the confirm dialog says so).

const PAGE_SIZE = 25;
const collator = new Intl.Collator("en");
const cmp = (a, b) => collator.compare(a || "", b || "");

const LEVELS = [
  { key: "regions",        label: "Regions",        singular: "Region",       idField: "regionID",       nameField: "regionName",       parent: null },
  { key: "provinces",      label: "Provinces",      singular: "Province",     idField: "provinceID",     nameField: "provinceName",     parent: { key: "regions",        field: "regionID",       singular: "Region" } },
  { key: "municipalities", label: "Municipalities", singular: "Municipality", idField: "municipalityID", nameField: "municipalityName", parent: { key: "provinces",      field: "provinceID",     singular: "Province" } },
  { key: "barangays",      label: "Barangays",      singular: "Barangay",     idField: "barangayID",     nameField: "barangayName",     parent: { key: "municipalities", field: "municipalityID", singular: "Municipality" } },
];
const LEVEL = Object.fromEntries(LEVELS.map((l) => [l.key, l]));

const DELETE_NOTE = {
  regions: " This does not remove its provinces, municipalities, or barangays.",
  provinces: " This does not remove its municipalities or barangays.",
  municipalities: " This does not remove its barangays.",
  barangays: "",
};

// Same ordering the backend uses: regions/provinces A-Z; municipalities and
// barangays grouped under their parent A-Z first, then by their own name.
function sortBundle(b) {
  const regionName = Object.fromEntries(b.regions.map((x) => [x.regionID, x.regionName]));
  const provinceName = Object.fromEntries(b.provinces.map((x) => [x.provinceID, x.provinceName]));
  const municipalityName = Object.fromEntries(b.municipalities.map((x) => [x.municipalityID, x.municipalityName]));
  return {
    regions: [...b.regions].sort((a, c) => cmp(a.regionName, c.regionName)),
    provinces: [...b.provinces].sort((a, c) => cmp(regionName[a.regionID], regionName[c.regionID]) || cmp(a.provinceName, c.provinceName)),
    municipalities: [...b.municipalities].sort((a, c) => cmp(provinceName[a.provinceID], provinceName[c.provinceID]) || cmp(a.municipalityName, c.municipalityName)),
    barangays: [...b.barangays].sort((a, c) => cmp(municipalityName[a.municipalityID], municipalityName[c.municipalityID]) || cmp(a.barangayName, c.barangayName)),
  };
}

// A stable colour per parent so rows from the same parent read as a group.
const TONES = ["teal", "blue", "amber", "green", "gray"];
const toneFor = (id = "") => TONES[[...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % TONES.length];

// One cascading filter dropdown. Top-level (not defined inside the page) so it
// isn't remounted on every render.
function FilterSelect({ label, value, options, onChange }) {
  return (
    <div className="w-56">
      <Field label={`Filter by ${label.toLowerCase()}`}>
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">All {label.toLowerCase()}s</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    </div>
  );
}

const EMPTY = { regions: [], provinces: [], municipalities: [], barangays: [] };

export default function Addresses() {
  const { effectiveRole } = useAuth();
  const canDelete = effectiveRole === "Owner" || effectiveRole === "Admin";
  const api = useApi();
  const [toast, showToast] = useToast();

  const [bundle, setBundle] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [levelKey, setLevelKey] = useState("regions");
  const [regionF, setRegionF] = useState("");
  const [provinceF, setProvinceF] = useState("");
  const [municipalityF, setMunicipalityF] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [dialog, setDialog] = useState(null);   // { existing } — existing null = adding
  const [toDelete, setToDelete] = useState(null);
  const [viewStack, setViewStack] = useState([]); // [{ levelKey, row }] — last one is shown; drilling in pushes
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await api("/api/addresses");
      setBundle(sortBundle({ ...EMPTY, ...(json.data || {}) }));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const level = LEVEL[levelKey];

  // ── lookups ──
  const lk = useMemo(() => {
    const regionName = Object.fromEntries(bundle.regions.map((r) => [r.regionID, r.regionName]));
    const provinceById = Object.fromEntries(bundle.provinces.map((p) => [p.provinceID, p]));
    const municipalityById = Object.fromEntries(bundle.municipalities.map((m) => [m.municipalityID, m]));
    const count = (list, field) => list.reduce((acc, x) => ((acc[x[field]] = (acc[x[field]] || 0) + 1), acc), {});
    return {
      regionName, provinceById, municipalityById,
      provincesPerRegion: count(bundle.provinces, "regionID"),
      municipalitiesPerProvince: count(bundle.municipalities, "provinceID"),
      barangaysPerMunicipality: count(bundle.barangays, "municipalityID"),
      provinceName: (id) => provinceById[id]?.provinceName || "",
      municipalityName: (id) => municipalityById[id]?.municipalityName || "",
      regionOfProvince: (id) => provinceById[id]?.regionID || "",
      provinceOfMunicipality: (id) => municipalityById[id]?.provinceID || "",
    };
  }, [bundle]);

  // ── cascading filter options ──
  const provinceOptions = bundle.provinces.filter((p) => !regionF || p.regionID === regionF);
  const municipalityOptions = bundle.municipalities.filter(
    (m) => (!provinceF || m.provinceID === provinceF) && (!regionF || lk.regionOfProvince(m.provinceID) === regionF)
  );

  const resetView = (key) => {
    setLevelKey(key); setRegionF(""); setProvinceF(""); setMunicipalityF(""); setSearch(""); setPage(0);
  };

  // ── rows for the current level ──
  const { rows, total } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = bundle[levelKey];
    let list = all;
    if (levelKey === "provinces") {
      list = all.filter((p) => !regionF || p.regionID === regionF);
    } else if (levelKey === "municipalities") {
      list = all.filter((m) => (!regionF || lk.regionOfProvince(m.provinceID) === regionF) && (!provinceF || m.provinceID === provinceF));
    } else if (levelKey === "barangays") {
      list = all.filter((b) => {
        const provID = lk.provinceOfMunicipality(b.municipalityID);
        return (!regionF || lk.regionOfProvince(provID) === regionF)
          && (!provinceF || provID === provinceF)
          && (!municipalityF || b.municipalityID === municipalityF);
      });
    }
    if (q) list = list.filter((x) => (x[level.nameField] || "").toLowerCase().includes(q));
    return { rows: list, total: all.length };
  }, [bundle, levelKey, regionF, provinceF, municipalityF, search, lk, level.nameField]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // ── table cells per level ──
  const headers = {
    regions: ["Provinces"],
    provinces: ["Region", "Municipalities"],
    municipalities: ["Province", "Region"],
    barangays: ["Municipality", "Province / Region"],
  }[levelKey];

  const parentPill = (text, id) => (text ? <Pill tone={toneFor(id)}>{text}</Pill> : <span className="text-gray-400">—</span>);
  const countText = (n = 0, one, many) => `${n} ${n === 1 ? one : many}`;

  const cellsFor = (row) => {
    switch (levelKey) {
      case "regions":
        return [countText(lk.provincesPerRegion[row.regionID], "province", "provinces")];
      case "provinces":
        return [parentPill(lk.regionName[row.regionID], row.regionID), countText(lk.municipalitiesPerProvince[row.provinceID], "municipality", "municipalities")];
      case "municipalities": {
        const regID = lk.regionOfProvince(row.provinceID);
        return [parentPill(lk.provinceName(row.provinceID), row.provinceID), parentPill(lk.regionName[regID], regID)];
      }
      default: {
        const provID = lk.provinceOfMunicipality(row.municipalityID);
        return [
          parentPill(lk.municipalityName(row.municipalityID), row.municipalityID),
          <span className="text-gray-500">{[lk.provinceName(provID), lk.regionName[lk.regionOfProvince(provID)]].filter(Boolean).join(" · ") || "—"}</span>,
        ];
      }
    }
  };

  // ── parent choices for the add/edit dialog ──
  const parentOptions = useMemo(() => {
    if (!level.parent) return [];
    if (levelKey === "provinces") return bundle.regions.map((r) => ({ value: r.regionID, label: r.regionName }));
    if (levelKey === "municipalities") return bundle.provinces.map((p) => ({ value: p.provinceID, label: p.provinceName }));
    return bundle.municipalities
      .map((m) => ({ value: m.municipalityID, label: `${m.municipalityName} — ${lk.provinceName(m.provinceID)}` }))
      .sort((a, b) => cmp(a.label, b.label));
  }, [bundle, levelKey, level.parent, lk]);

  // ── local patching after a successful save/delete ──
  const patchLevel = (key, fn) => setBundle((b) => sortBundle({ ...b, [key]: fn(b[key]) }));

  const onSaved = (entry, isNew) => {
    const id = entry[level.idField];
    patchLevel(levelKey, (list) => (isNew ? [...list, entry] : list.map((x) => (x[level.idField] === id ? entry : x))));
    setDialog(null);
    showToast(`${level.singular} ${isNew ? "added" : "updated"}.`);
  };

  const confirmDelete = async () => {
    const id = toDelete[level.idField];
    setBusy(true);
    try {
      await api(`/api/addresses/${levelKey}/${id}`, { method: "DELETE" });
      patchLevel(levelKey, (list) => list.filter((x) => x[level.idField] !== id));
      showToast(`${level.singular} deleted.`);
      setToDelete(null);
    } catch (e) {
      showToast(`Failed to delete: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const filtersActive = rows.length !== total;
  const colCount = 2 + headers.length; // name + cells + actions

  return (
    <div className="w-full px-4">
      <Toast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Addresses</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Region → Province → Municipality → Barangay. Pick a level to browse and edit it.
          </p>
        </div>
        <button onClick={() => setDialog({ existing: null })} disabled={loading} className={btnPrimary}>
          + Add {level.singular.toLowerCase()}
        </button>
      </div>

      {/* ── Level cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {LEVELS.map((l) => {
          const active = l.key === levelKey;
          return (
            <button
              key={l.key}
              onClick={() => resetView(l.key)}
              className={`text-left bg-white rounded-2xl border p-4 shadow-soft transition ${
                active ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{l.label}</p>
              {loading ? (
                <div className="h-7 w-14 mt-1 rounded bg-gray-100 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-gray-800 mt-0.5">{bundle[l.key].length.toLocaleString()}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <input
          type="text"
          placeholder={`Search ${level.label.toLowerCase()}…`}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-100 w-56"
        />
        {levelKey !== "regions" && (
          <FilterSelect
            label="Region" value={regionF}
            options={bundle.regions.map((r) => ({ value: r.regionID, label: r.regionName }))}
            onChange={(v) => {
              setPage(0);
              setRegionF(v);
              if (provinceF && !bundle.provinces.some((p) => p.provinceID === provinceF && (!v || p.regionID === v))) setProvinceF("");
              setMunicipalityF("");
            }}
          />
        )}
        {(levelKey === "municipalities" || levelKey === "barangays") && (
          <FilterSelect
            label="Province" value={provinceF}
            options={provinceOptions.map((p) => ({ value: p.provinceID, label: p.provinceName }))}
            onChange={(v) => { setPage(0); setProvinceF(v); setMunicipalityF(""); }}
          />
        )}
        {levelKey === "barangays" && (
          <FilterSelect
            label="Municipality" value={municipalityF}
            options={municipalityOptions.map((m) => ({ value: m.municipalityID, label: m.municipalityName }))}
            onChange={(v) => { setPage(0); setMunicipalityF(v); }}
          />
        )}
        <span className="text-xs text-gray-400 pb-2.5">
          {loading ? "" : `${rows.length.toLocaleString()}${filtersActive ? ` of ${total.toLocaleString()}` : ""} ${level.label.toLowerCase()}`}
        </span>
        <button onClick={load} disabled={loading} className="px-3 py-2 text-sm rounded-xl bg-arl-dark text-white hover:opacity-90 disabled:opacity-50 ml-auto">
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      <ErrorBanner onRetry={load}>{error}</ErrorBanner>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm font-sans min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className={thCls}>{level.singular}</th>
              {headers.map((h) => <th key={h} className={thCls}>{h}</th>)}
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={8} cols={colCount} />
            ) : pageRows.length === 0 ? (
              <EmptyRow cols={colCount}>
                {total === 0 ? `No ${level.label.toLowerCase()} yet.` : "Nothing matches the current filters."}
              </EmptyRow>
            ) : (
              pageRows.map((row) => {
                const id = row[level.idField];
                return (
                  <tr key={id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-semibold text-gray-800">{row[level.nameField] || "—"}</td>
                    {cellsFor(row).map((cell, i) => (
                      <td key={i} className="px-5 py-3 text-gray-600">{cell}</td>
                    ))}
                    <td className="px-5 py-3">
                      <RowActions
                        onView={() => setViewStack([{ levelKey, row }])}
                        onEdit={() => setDialog({ existing: row })}
                        onDelete={canDelete ? () => setToDelete(row) : null}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of {rows.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className={`${btnGhost} !py-1.5 !px-3`}>Previous</button>
            <span>Page {safePage + 1} / {pageCount}</span>
            <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className={`${btnGhost} !py-1.5 !px-3`}>Next</button>
          </div>
        </div>
      )}

      {viewStack.length > 0 && (
        <ViewDialog
          current={viewStack[viewStack.length - 1]}
          canGoBack={viewStack.length > 1}
          bundle={bundle}
          lk={lk}
          onOpen={(key, row) => setViewStack((s) => [...s, { levelKey: key, row }])}
          onBack={() => setViewStack((s) => s.slice(0, -1))}
          onClose={() => setViewStack([])}
        />
      )}

      {dialog && (
        <EntryDialog
          level={level}
          existing={dialog.existing}
          parentOptions={parentOptions}
          api={api}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete ${level.singular.toLowerCase()}?`}
          danger
          confirmLabel="Delete"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        >
          Remove <strong>{toDelete[level.nameField]}</strong> from the address list?{DELETE_NOTE[levelKey]}
        </ConfirmDialog>
      )}
    </div>
  );
}

// ─── View one entry: where it sits + everything under it ────────────────────
const SINGULAR = { Provinces: "province", Municipalities: "municipality", Barangays: "barangay" };
const CHILD_OF = { regions: "provinces", provinces: "municipalities", municipalities: "barangays", barangays: null };

function ViewDialog({ current, canGoBack, bundle, lk, onOpen, onBack, onClose }) {
  const { levelKey, row } = current;
  const level = LEVEL[levelKey];
  const childKey = CHILD_OF[levelKey];
  const child = childKey ? LEVEL[childKey] : null;
  const [q, setQ] = useState("");

  // Where this entry sits (Region › Province › Municipality), top-down.
  const trail = useMemo(() => {
    const t = [];
    if (levelKey === "provinces") t.push({ label: "Region", value: lk.regionName[row.regionID] });
    if (levelKey === "municipalities") {
      t.push({ label: "Region", value: lk.regionName[lk.regionOfProvince(row.provinceID)] });
      t.push({ label: "Province", value: lk.provinceName(row.provinceID) });
    }
    if (levelKey === "barangays") {
      const provID = lk.provinceOfMunicipality(row.municipalityID);
      t.push({ label: "Region", value: lk.regionName[lk.regionOfProvince(provID)] });
      t.push({ label: "Province", value: lk.provinceName(provID) });
      t.push({ label: "Municipality", value: lk.municipalityName(row.municipalityID) });
    }
    return t;
  }, [levelKey, row, lk]);

  // Everything underneath: direct children for the list, plus totals for the chips.
  const { children, totals } = useMemo(() => {
    const byName = (list, f) => [...list].sort((a, b) => cmp(a[f], b[f]));
    if (levelKey === "regions") {
      const provs = bundle.provinces.filter((p) => p.regionID === row.regionID);
      const provSet = new Set(provs.map((p) => p.provinceID));
      const munis = bundle.municipalities.filter((m) => provSet.has(m.provinceID));
      const muniSet = new Set(munis.map((m) => m.municipalityID));
      const brgys = bundle.barangays.filter((b) => muniSet.has(b.municipalityID));
      return { children: byName(provs, "provinceName"), totals: [["Provinces", provs.length], ["Municipalities", munis.length], ["Barangays", brgys.length]] };
    }
    if (levelKey === "provinces") {
      const munis = bundle.municipalities.filter((m) => m.provinceID === row.provinceID);
      const muniSet = new Set(munis.map((m) => m.municipalityID));
      const brgys = bundle.barangays.filter((b) => muniSet.has(b.municipalityID));
      return { children: byName(munis, "municipalityName"), totals: [["Municipalities", munis.length], ["Barangays", brgys.length]] };
    }
    if (levelKey === "municipalities") {
      const brgys = bundle.barangays.filter((b) => b.municipalityID === row.municipalityID);
      return { children: byName(brgys, "barangayName"), totals: [["Barangays", brgys.length]] };
    }
    return { children: [], totals: [] };
  }, [levelKey, row, bundle]);

  const countText = (n = 0, one, many) => `${n} ${n === 1 ? one : many}`;
  const detail = (c) => {
    if (childKey === "provinces") return countText(lk.municipalitiesPerProvince[c.provinceID], "municipality", "municipalities");
    if (childKey === "municipalities") return countText(lk.barangaysPerMunicipality[c.municipalityID], "barangay", "barangays");
    return "";
  };

  const shown = q.trim() ? children.filter((c) => (c[child.nameField] || "").toLowerCase().includes(q.trim().toLowerCase())) : children;

  return (
    <Modal
      title={`${level.singular}: ${row[level.nameField] || "—"}`}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          {canGoBack && <button onClick={onBack} className={btnGhost}>← Back</button>}
          <button onClick={onClose} className={btnPrimary}>Close</button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {trail.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {trail.map((t) => (
              <span key={t.label} className="text-xs text-gray-500">
                <span className="text-gray-400">{t.label}:</span> <span className="font-semibold text-gray-700">{t.value || "—"}</span>
              </span>
            ))}
          </div>
        )}

        {totals.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {totals.map(([label, n]) => <Pill key={label} tone="teal">{n.toLocaleString()} {n === 1 ? SINGULAR[label] : label.toLowerCase()}</Pill>)}
          </div>
        )}

        {child ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {child.label} under {row[level.nameField]}
              </p>
              {children.length > 8 && (
                <input
                  type="text" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${child.label.toLowerCase()}…`}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              )}
            </div>
            {children.length === 0 ? (
              <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                No {child.label.toLowerCase()} under this {level.singular.toLowerCase()} yet.
              </p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-gray-400 px-1">Nothing matches “{q}”.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                {shown.map((c) => {
                  const id = c[child.idField];
                  // Barangays are the last level — nothing further to open.
                  const openable = childKey !== "barangays";
                  const Tag = openable ? "button" : "div";
                  return (
                    <Tag
                      key={id}
                      {...(openable ? { onClick: () => onOpen(childKey, c) } : {})}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${openable ? "hover:bg-teal-50/50 cursor-pointer" : ""}`}
                    >
                      <span className="font-medium text-gray-800">{c[child.nameField] || "—"}</span>
                      <span className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                        {detail(c)}
                        {openable && <span className="text-gray-300">›</span>}
                      </span>
                    </Tag>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Barangays are the last level — there's nothing under this one.</p>
        )}
      </div>
    </Modal>
  );
}

// ─── Add / edit one entry at any level ───────────────────────────────────────
function EntryDialog({ level, existing, parentOptions, api, onClose, onSaved }) {
  const isEditing = !!existing;
  const parent = level.parent;
  const [name, setName] = useState(existing?.[level.nameField] || "");
  const [parentID, setParentID] = useState(existing && parent ? existing[parent.field] : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Keep the current parent selectable even if it no longer exists.
  const options = [
    ...parentOptions,
    ...(parentID && !parentOptions.some((o) => o.value === parentID)
      ? [{ value: parentID, label: `(unknown ${parent.singular.toLowerCase()})` }]
      : []),
  ];

  const save = async () => {
    if (!name.trim() || (parent && !parentID)) {
      return setError(parent
        ? `${level.singular} name and ${parent.singular.toLowerCase()} are required.`
        : `${level.singular} name is required.`);
    }
    setSaving(true);
    setError("");
    try {
      const body = { name: name.trim(), ...(parent ? { parentID } : {}) };
      const json = await api(
        isEditing ? `/api/addresses/${level.key}/${existing[level.idField]}` : `/api/addresses/${level.key}`,
        { method: isEditing ? "PUT" : "POST", body }
      );
      onSaved(json.data, !isEditing);
    } catch (e) {
      setError(`Failed to ${isEditing ? "save" : "add"} ${level.singular.toLowerCase()}: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${isEditing ? "Edit" : "Add"} ${level.singular.toLowerCase()}`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : isEditing ? "Save changes" : `Add ${level.singular.toLowerCase()}`}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label={`${level.singular} name`}>
          <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </Field>
        {parent && (
          <Field label={parent.singular}>
            <select className={inputCls} value={parentID} onChange={(e) => setParentID(e.target.value)}>
              <option value="" disabled>Select {parent.singular.toLowerCase()}…</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}