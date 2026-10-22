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
// Add / Edit open one tree-editor modal (see TreeEditor): Edit shows the whole
// branch from the Region down, saved in a single POST /api/addresses/batch.
// The row-level Delete button still removes just that one entry and does NOT
// cascade — its confirm dialog says so.

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
  const [viewing, setViewing] = useState(null); // { levelKey, row }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
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
  const parentOptionsBy = useMemo(() => ({
    provinces: bundle.regions.map((r) => ({ value: r.regionID, label: r.regionName })),
    municipalities: bundle.provinces.map((p) => ({ value: p.provinceID, label: p.provinceName })),
    barangays: bundle.municipalities
      .map((m) => ({ value: m.municipalityID, label: `${m.municipalityName} — ${lk.provinceName(m.provinceID)}` }))
      .sort((a, b) => cmp(a.label, b.label)),
  }), [bundle, lk]);

  // ── local patching after a successful save/delete ──
  const patchLevel = (key, fn) => setBundle((b) => sortBundle({ ...b, [key]: fn(b[key]) }));

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
        <button onClick={load} disabled={loading} className="px-3 py-2 text-sm rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 ml-auto">
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
                        onView={() => setViewing({ levelKey, row })}
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

      {viewing && (
        <ViewDialog levelKey={viewing.levelKey} row={viewing.row} bundle={bundle} onClose={() => setViewing(null)} />
      )}

      {dialog && (
        <TreeEditor
          levelKey={levelKey}
          existing={dialog.existing}
          bundle={bundle}
          parentOptionsBy={parentOptionsBy}
          canDelete={canDelete}
          api={api}
          onClose={() => setDialog(null)}
          onSaved={(msg) => { setDialog(null); showToast(msg); load({ silent: true }); }}
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

// ─── View: the same tree as the editor, read-only ────────────────────────────
const CHILD_OF = { regions: "provinces", provinces: "municipalities", municipalities: "barangays", barangays: null };

function ViewDialog({ levelKey, row, bundle, onClose }) {
  const [resolved] = useState(() => resolveRoot(bundle, levelKey, row));
  const [{ nodes, rootKey }] = useState(() => buildDraft(bundle, resolved.rootLevelKey, resolved.rootRow));
  const [open, setOpen] = useState(() => new Set(resolved.pathKeys));
  const kids = useMemo(() => {
    const m = {};
    Object.values(nodes).forEach((n) => { if (n.parentKey) (m[n.parentKey] = m[n.parentKey] || []).push(n); });
    Object.keys(m).forEach((k) => { m[k] = m[k].sort((a, b) => a.order - b.order).map((n) => n.key); });
    return m;
  }, [nodes]);
  const toggleOpen = (key) => setOpen((s) => { const t = new Set(s); t.has(key) ? t.delete(key) : t.add(key); return t; });
  const ctx = { nodes, kids, open, problems: {}, canDelete: false, readOnly: true, focusKey: resolved.focusKey, toggleOpen, countBelow: () => 0 };
  const level = LEVEL[levelKey];

  return (
    <Modal
      title={`${level.singular}: ${row[level.nameField] || "—"}`}
      onClose={onClose}
      width="max-w-3xl"
      footer={<button onClick={onClose} className={btnPrimary}>Close</button>}
    >
      <div className="space-y-3 pb-2">
        <p className="text-xs text-gray-400 leading-relaxed">
          Region → Province → Municipality → Barangay. Open any row with ▸ to see what's under it.
        </p>
        <div className="border border-gray-100 rounded-xl p-2 bg-gray-50/40">
          <TreeNode nodeKey={rootKey} isRoot ctx={ctx} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Add / edit an entry AND everything under it, in one modal ───────────────
//
// A collapsible tree: Region → Provinces → Municipalities → Barangays. Every
// name can be renamed in place, and every open row has an "add" box for its
// children, so creating a new region means building its whole branch right
// here. Nothing is sent until "Save changes": all edits are collected into one
// list of operations and posted to /api/addresses/batch, so the whole branch
// saves together or not at all.
//
// Edit always opens the whole branch from its Region down, whichever row you
// clicked: the clicked row is opened and highlighted, and every level can be
// dropped down and edited. (If a row's parent no longer exists, the tree starts
// at that row and a "Belongs to" dropdown lets you re-attach it.) Add opens a
// brand-new entry at the current level, with the same tree for what's under it.
//
// Delete: Owner/Admin only. Deleting a row here also removes everything
// underneath it (the row says how many). Unsaved new rows can be removed by
// anyone.

const NEW_ORDER_BASE = 1e6; // new rows sort after the existing ones

// Flat draft: key -> node. Existing rows are keyed "e:<id>", new ones "n:<n>".
function buildDraft(bundle, levelKey, existing) {
  const nodes = {};
  if (!existing) {
    nodes["n:0"] = { key: "n:0", levelKey, id: null, name: "", orig: "", parentKey: null, order: 0, isNew: true, deleted: false };
    return { nodes, rootKey: "n:0" };
  }
  const group = (list, field) => {
    const m = {};
    list.forEach((x) => { (m[x[field]] = m[x[field]] || []).push(x); });
    return m;
  };
  const childrenOf = {
    regions: group(bundle.provinces, "regionID"),
    provinces: group(bundle.municipalities, "provinceID"),
    municipalities: group(bundle.barangays, "municipalityID"),
  };
  const add = (lk, row, parentKey, order) => {
    const L = LEVEL[lk];
    const id = row[L.idField];
    const key = `e:${id}`;
    const name = row[L.nameField] || "";
    nodes[key] = { key, levelKey: lk, id, name, orig: name, parentKey, order, isNew: false, deleted: false };
    const ck = CHILD_OF[lk];
    if (ck) (childrenOf[lk][id] || []).forEach((c, i) => add(ck, c, key, i));
    return key;
  };
  return { nodes, rootKey: add(levelKey, existing, null, 0) };
}

// Walk up from the clicked row to the top-most ancestor that still exists.
function resolveRoot(bundle, levelKey, row) {
  let cur = { levelKey, row };
  const chain = [cur];
  while (LEVEL[cur.levelKey].parent) {
    const pl = LEVEL[cur.levelKey].parent;
    const pRow = bundle[pl.key].find((x) => x[LEVEL[pl.key].idField] === cur.row[pl.field]);
    if (!pRow) break; // orphan — this row becomes the top of the tree
    cur = { levelKey: pl.key, row: pRow };
    chain.unshift(cur);
  }
  const keyOf = (c) => `e:${c.row[LEVEL[c.levelKey].idField]}`;
  return { rootLevelKey: cur.levelKey, rootRow: cur.row, focusKey: keyOf(chain[chain.length - 1]), pathKeys: chain.map(keyOf) };
}

// Name field that edits in place; commits on Enter / blur, Esc reverts.
function NameInput({ value, onCommit, invalid }) {
  const [v, setV] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (v !== value) onCommit(v);
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { cancelled.current = true; setV(value); e.currentTarget.blur(); }
      }}
      className={`w-full rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-800 border bg-transparent hover:bg-white focus:bg-white focus:outline-none focus:ring-2 ${
        invalid ? "border-red-300 focus:ring-red-100" : "border-transparent hover:border-gray-200 focus:border-teal-300 focus:ring-teal-100"
      }`}
    />
  );
}

// "Add province…" box. Enter adds one; pasting several lines adds them all.
function AddRow({ noun, onAdd }) {
  const [v, setV] = useState("");
  const commit = (text) => {
    const names = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (names.length) onAdd(names);
    setV("");
  };
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-6" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(v); } }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/\r?\n/.test(text.trim())) { e.preventDefault(); commit(text); }
        }}
        placeholder={`Add ${noun}… (Enter, or paste a list)`}
        className="flex-1 min-w-0 border border-dashed border-gray-200 rounded-lg px-2.5 py-1.5 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-300"
      />
      <button onClick={() => commit(v)} disabled={!v.trim()} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-40 transition">
        Add
      </button>
    </div>
  );
}

function TreeNode({ nodeKey, isRoot = false, ctx }) {
  const { nodes, kids, open, problems, canDelete } = ctx;
  const n = nodes[nodeKey];
  const rowRef = useRef(null);
  const isFocus = ctx.focusKey === nodeKey;
  useEffect(() => {
    if (isFocus && !isRoot) rowRef.current?.scrollIntoView?.({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const L = LEVEL[n.levelKey];
  const childKey = CHILD_OF[n.levelKey];
  const childL = childKey ? LEVEL[childKey] : null;
  const kidKeys = kids[nodeKey] || [];
  const isOpen = open.has(nodeKey);

  const chip = (
    <span className="shrink-0 w-24 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{L.singular}</span>
  );

  if (n.deleted) {
    const below = ctx.countBelow(nodeKey);
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 my-0.5 rounded-lg bg-red-50/70">
        <span className="w-6" />
        {chip}
        <span className="flex-1 min-w-0 truncate text-sm text-gray-400 line-through">{n.name || "—"}</span>
        <span className="text-xs text-red-500 whitespace-nowrap">
          {n.isNew ? "Won't be added" : below > 0 ? `Removes this and ${below.toLocaleString()} below` : "Will be removed"}
        </span>
        <button onClick={() => ctx.toggleDelete(nodeKey)} className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
          Undo
        </button>
      </div>
    );
  }

  const live = kidKeys.filter((k) => !nodes[k].deleted).length;

  return (
    <div>
      <div ref={rowRef} className={`flex items-center gap-2 py-0.5 rounded-lg ${isFocus ? "bg-teal-50/70 ring-1 ring-teal-100" : ""}`}>
        {childKey ? (
          <button
            onClick={() => ctx.toggleOpen(nodeKey)}
            className="w-6 h-6 shrink-0 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-sm leading-none"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        {chip}
        <div className="flex-1 min-w-0">
          {ctx.readOnly ? (
            <span className="block truncate px-2.5 py-1.5 text-sm font-medium text-gray-800">{n.name || "—"}</span>
          ) : (
            <NameInput value={n.name} invalid={!!problems[nodeKey]} onCommit={(v) => ctx.rename(nodeKey, v)} />
          )}
        </div>
        {n.isNew && (
          <span className="shrink-0 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5">NEW</span>
        )}
        {childL && (
          <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap w-28 text-right">
            {live} {live === 1 ? childL.singular.toLowerCase() : childL.label.toLowerCase()}
          </span>
        )}
        {ctx.readOnly ? null : !isRoot && (canDelete || n.isNew) ? (
          <button
            onClick={() => ctx.toggleDelete(nodeKey)}
            className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"
          >
            {n.isNew ? "Discard" : "Delete"}
          </button>
        ) : (
          !isRoot && <span className="w-[62px] shrink-0" />
        )}
      </div>
      {problems[nodeKey] && <p className="text-xs text-red-500 ml-8 mb-1">{problems[nodeKey]}</p>}
      {childKey && isOpen && (
        <div className="ml-3 pl-3 border-l border-gray-100">
          {kidKeys.map((k) => <TreeNode key={k} nodeKey={k} ctx={ctx} />)}
          {ctx.readOnly && kidKeys.length === 0 && (
            <p className="text-xs text-gray-400 py-1.5 pl-8">No {childL.label.toLowerCase()} yet.</p>
          )}
          {!ctx.readOnly && <AddRow noun={childL.singular.toLowerCase()} onAdd={(names) => ctx.addChildren(nodeKey, names)} />}
        </div>
      )}
    </div>
  );
}

function TreeEditor({ levelKey, existing, bundle, parentOptionsBy, canDelete, api, onClose, onSaved }) {
  const isEditing = !!existing;
  const [resolved] = useState(() => (existing ? resolveRoot(bundle, levelKey, existing) : null));
  const rootLevel = LEVEL[resolved ? resolved.rootLevelKey : levelKey];
  const rootRow = resolved ? resolved.rootRow : null;
  const parent = rootLevel.parent;
  const parentOptions = parentOptionsBy[rootLevel.key] || [];

  const seq = useRef(1);
  const [{ nodes: initialNodes, rootKey }] = useState(() => buildDraft(bundle, rootLevel.key, rootRow));
  const [nodes, setNodes] = useState(initialNodes);
  const [open, setOpen] = useState(() => new Set(resolved ? resolved.pathKeys : [rootKey]));
  const origParentID = rootRow && parent ? rootRow[parent.field] || "" : "";
  const [parentID, setParentID] = useState(origParentID);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // parent -> ordered children
  const kids = useMemo(() => {
    const m = {};
    Object.values(nodes).forEach((n) => { if (n.parentKey) (m[n.parentKey] = m[n.parentKey] || []).push(n); });
    Object.keys(m).forEach((k) => { m[k] = m[k].sort((a, b) => a.order - b.order).map((n) => n.key); });
    return m;
  }, [nodes]);

  // ── edit actions ──
  const rename = (key, name) => setNodes((s) => ({ ...s, [key]: { ...s[key], name } }));
  const toggleDelete = (key) => setNodes((s) => ({ ...s, [key]: { ...s[key], deleted: !s[key].deleted } }));
  const toggleOpen = (key) => setOpen((s) => { const t = new Set(s); t.has(key) ? t.delete(key) : t.add(key); return t; });
  const addChildren = (parentKey, names) =>
    setNodes((s) => {
      const next = { ...s };
      const childLevel = CHILD_OF[s[parentKey].levelKey];
      names.forEach((name) => {
        const key = `n:${seq.current++}`;
        next[key] = { key, levelKey: childLevel, id: null, name, orig: "", parentKey, order: NEW_ORDER_BASE + seq.current, isNew: true, deleted: false };
      });
      return next;
    });
  const countBelow = (key) => {
    let c = 0;
    const walk = (k) => (kids[k] || []).forEach((ck) => { if (!nodes[ck].isNew) c++; walk(ck); });
    walk(key);
    return c;
  };

  const root = nodes[rootKey];

  // ── what would be saved ──
  const { ops, problems, removed, renamed, moved } = useMemo(() => {
    const ops = [];
    const problems = {};
    let removed = 0, renamed = 0, moved = 0;
    const rLevel = LEVEL[root.levelKey];

    // root
    const rootName = root.name.trim();
    if (root.isNew) {
      ops.push({ op: "create", level: rLevel.key, tempID: root.key, name: rootName, ...(rLevel.parent ? { parentID } : {}) });
    } else if (rootName !== root.orig.trim() || (rLevel.parent && parentID !== origParentID)) {
      if (rootName !== root.orig.trim()) renamed++;
      if (rLevel.parent && parentID !== origParentID) moved++;
      ops.push({
        op: "update", level: rLevel.key, id: root.id, name: rootName,
        ...(rLevel.parent && parentID !== origParentID ? { parentID } : {}),
      });
    }
    if (!rootName && !(root.isNew)) problems[root.key] = "Name is required.";

    const subtreeExisting = (key) => {
      let c = 0;
      (kids[key] || []).forEach((ck) => { if (!nodes[ck].isNew) c++; c += subtreeExisting(ck); });
      return c;
    };

    const walk = (key) => {
      const live = [];
      (kids[key] || []).forEach((ck) => {
        const c = nodes[ck];
        if (c.deleted) {
          if (!c.isNew) { ops.push({ op: "delete", level: c.levelKey, id: c.id }); removed += 1 + subtreeExisting(ck); }
          return;
        }
        live.push(c);
        const name = c.name.trim();
        const p = nodes[key];
        if (c.isNew) {
          ops.push({ op: "create", level: c.levelKey, tempID: c.key, name, parentID: p.isNew ? p.key : p.id });
        } else if (name !== c.orig.trim()) {
          ops.push({ op: "update", level: c.levelKey, id: c.id, name });
          renamed++;
        }
        if (!name) problems[c.key] = "Name is required.";
        walk(ck);
      });
      // duplicate siblings — only complain about rows this save would touch
      const seen = {};
      live.forEach((c) => { const k = c.name.trim().toLowerCase(); if (k) (seen[k] = seen[k] || []).push(c); });
      Object.values(seen).forEach((group) => {
        if (group.length > 1 && group.some((c) => c.isNew || c.name.trim() !== c.orig.trim())) {
          group.forEach((c) => { problems[c.key] = `"${c.name.trim()}" is already listed here.`; });
        }
      });
    };
    walk(root.key);
    return { ops, problems, removed, renamed, moved };
  }, [nodes, kids, root, parentID, origParentID]);

  const created = ops.filter((o) => o.op === "create").length;
  const problemCount = Object.keys(problems).length;
  const rootNameMissing = root.isNew && !root.name.trim();
  const parentMissing = !!parent && !parentID;

  const dirty = isEditing ? ops.length > 0 : root.name.trim() !== "" || Object.keys(nodes).length > 1;
  const canSave = !saving && ops.length > 0 && problemCount === 0 && !rootNameMissing && !parentMissing;

  const summary = [
    created && `${created} added`,
    renamed && `${renamed} renamed`,
    moved && `${moved} moved`,
    removed && `${removed.toLocaleString()} deleted`,
  ].filter(Boolean).join(" · ");

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api("/api/addresses/batch", {
        method: "POST",
        body: { ops, context: `${rootLevel.singular} ${root.name.trim() || root.orig}` },
      });
      onSaved(`${rootLevel.singular} saved: ${summary}.`);
    } catch (e) {
      setError(`Failed to save: ${e.message}`);
      setSaving(false);
    }
  };

  // Keep the current parent selectable even if it no longer exists.
  const options = parent
    ? [
        ...parentOptions,
        ...(parentID && !parentOptions.some((o) => o.value === parentID)
          ? [{ value: parentID, label: `(unknown ${parent.singular.toLowerCase()})` }]
          : []),
      ]
    : [];

  const ctx = {
    nodes, kids, open, problems, canDelete, focusKey: resolved?.focusKey,
    rename, toggleDelete, toggleOpen, addChildren, countBelow,
  };

  return (
    <>
      <Modal
        title={isEditing ? `Edit ${LEVEL[levelKey].singular.toLowerCase()}: ${existing[LEVEL[levelKey].nameField] || "—"}` : `Add ${rootLevel.singular.toLowerCase()}`}
        onClose={requestClose}
        busy={saving}
        width="max-w-3xl"
        footer={
          <>
            <span className={`mr-auto self-center text-xs ${problemCount ? "text-red-500" : "text-gray-400"}`}>
              {problemCount
                ? `Fix ${problemCount} ${problemCount === 1 ? "name" : "names"} to save`
                : summary || "No changes yet"}
            </span>
            <button onClick={requestClose} disabled={saving} className={btnGhost}>Cancel</button>
            <button onClick={save} disabled={!canSave} className={btnPrimary}>
              {saving ? "Saving…" : isEditing ? "Save changes" : `Add ${rootLevel.singular.toLowerCase()}`}
            </button>
          </>
        }
      >
        <div className="space-y-4 pb-2">
          <p className="text-xs text-gray-400 leading-relaxed">
            Region → Province → Municipality → Barangay. Open any row with ▸ to see what's under it. Click a name to
            rename it, and use the box at the bottom of an open row to add more (paste a list, one per line, to add many).
            Nothing is saved until you press the button below.
          </p>

          {parent && (
            <Field label={`Belongs to ${parent.singular.toLowerCase()}`}>
              <select className={inputCls} value={parentID} onChange={(e) => setParentID(e.target.value)}>
                <option value="" disabled>Select {parent.singular.toLowerCase()}…</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          )}

          <div className="border border-gray-100 rounded-xl p-2 bg-gray-50/40">
            <TreeNode nodeKey={rootKey} isRoot ctx={ctx} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          danger
          confirmLabel="Discard"
          onConfirm={onClose}
          onCancel={() => setConfirmDiscard(false)}
        >
          You have unsaved changes{summary ? ` (${summary})` : ""}. Close without saving?
        </ConfirmDialog>
      )}
    </>
  );
}