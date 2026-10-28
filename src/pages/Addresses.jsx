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

const actionBtn = "px-4 py-2 text-sm font-semibold rounded-xl border transition";

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

// ─── Addresses ───────────────────────────────────────────────────────────────
//
// The 4-level PH address hierarchy: Region → Province → Municipality →
// Barangay. Everything is loaded in one request and searched client-side
// (the full set is a few thousand tiny rows).
//
// Layout (same as Vehicle Inspections): a column of boxes on the left, the
// selected one on the right.
//   • Left  — one box per region. Typing in the search box swaps them for
//             matches from every level, each with its parents shown.
//   • Right — the selected region and everything under it as a tree (only
//             opened rows are drawn). It opens read-only; Edit makes the same
//             tree editable in place. Edits are collected and saved together
//             with one Save changes (POST /api/addresses/batch).
//
// Backend: routes/addresses. View/add/edit — Owner, Admin, Supervisor.
// Delete — Owner and Admin only (mirrored here by `canDelete`). Deleting an
// entry also removes everything under it; the confirm dialog says how many.

const PAGE = 50;   // search results drawn first
const MORE = 100;  // added by "Show more"
const collator = new Intl.Collator("en");
const cmp = (a, b) => collator.compare(a || "", b || "");
// Case- and accent-insensitive, so "penafrancia" finds "Peñafrancia".
const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const joinList = (parts) =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

const LEVELS = [
  { key: "regions",        label: "Regions",        singular: "Region",       idField: "regionID",       nameField: "regionName",       parent: null },
  { key: "provinces",      label: "Provinces",      singular: "Province",     idField: "provinceID",     nameField: "provinceName",     parent: { key: "regions",        field: "regionID",       singular: "Region" } },
  { key: "municipalities", label: "Municipalities", singular: "Municipality", idField: "municipalityID", nameField: "municipalityName", parent: { key: "provinces",      field: "provinceID",     singular: "Province" } },
  { key: "barangays",      label: "Barangays",      singular: "Barangay",     idField: "barangayID",     nameField: "barangayName",     parent: { key: "municipalities", field: "municipalityID", singular: "Municipality" } },
];
const LEVEL = Object.fromEntries(LEVELS.map((l) => [l.key, l]));
const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l.key, i]));
const CHILD_OF = { regions: "provinces", provinces: "municipalities", municipalities: "barangays", barangays: null };

const EMPTY = { regions: [], provinces: [], municipalities: [], barangays: [] };

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

const cardCls = "bg-white rounded-2xl border border-gray-100 shadow-soft";
const boxCls = (selected) =>
  `w-full text-left bg-white rounded-2xl border transition-all duration-200 shadow-soft hover:shadow-md ${
    selected ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-100 hover:border-teal-200"
  }`;

const CheckBadge = () => (
  <div className="shrink-0 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
    <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  </div>
);

// ─── The page ────────────────────────────────────────────────────────────────
export default function Addresses() {
  const { effectiveRole } = useAuth();
  const canDelete = effectiveRole === "Owner" || effectiveRole === "Admin";
  const api = useApi();
  const [toast, showToast] = useToast();

  const [bundle, setBundle] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const [selected, setSelected] = useState(null); // { levelKey, id, focus } — the entry shown on the right
  const [creating, setCreating] = useState(false); // a brand-new region
  const [version, setVersion] = useState(0);       // bump to rebuild the panel from fresh data
  const [pendingNav, setPendingNav] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  // The panel reports whether it holds unsaved edits, so leaving it can ask first.
  const dirtyRef = useRef(false);
  const setDirty = useCallback((d) => { dirtyRef.current = d; }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const json = await api("/api/addresses");
      setBundle(sortBundle({ ...EMPTY, ...(json.data || {}) }));
      setError("");
      if (!dirtyRef.current) setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  // ── lookups ──
  const lk = useMemo(() => {
    const group = (list, field) => {
      const m = {};
      list.forEach((x) => { (m[x[field]] = m[x[field]] || []).push(x); });
      return m;
    };
    const byId = (list, idField) => Object.fromEntries(list.map((x) => [x[idField], x]));
    const rowOf = {
      regions: byId(bundle.regions, "regionID"),
      provinces: byId(bundle.provinces, "provinceID"),
      municipalities: byId(bundle.municipalities, "municipalityID"),
      barangays: byId(bundle.barangays, "barangayID"),
    };
    // Lists are already sorted by parent then name, so these stay A–Z.
    const provincesOf = group(bundle.provinces, "regionID");
    const municipalitiesOf = group(bundle.municipalities, "provinceID");
    const barangaysOf = group(bundle.barangays, "municipalityID");

    const childrenOf = (levelKey, id) => {
      if (levelKey === "regions") return provincesOf[id] || [];
      if (levelKey === "provinces") return municipalitiesOf[id] || [];
      if (levelKey === "municipalities") return barangaysOf[id] || [];
      return [];
    };

    // Ancestors, top-down. Stops early if a parent no longer exists.
    const pathOf = (levelKey, row) => {
      const out = [];
      let cur = { levelKey, row };
      while (LEVEL[cur.levelKey].parent) {
        const p = LEVEL[cur.levelKey].parent;
        const parentRow = rowOf[p.key][cur.row[p.field]];
        if (!parentRow) break;
        out.unshift({ levelKey: p.key, id: parentRow[LEVEL[p.key].idField], name: parentRow[LEVEL[p.key].nameField] || "—" });
        cur = { levelKey: p.key, row: parentRow };
      }
      return out;
    };

    // Everything underneath an entry, by level.
    const countsBelow = (levelKey, id) => {
      const c = { provinces: 0, municipalities: 0, barangays: 0 };
      const addMunicipality = (m) => {
        c.municipalities++;
        c.barangays += (barangaysOf[m.municipalityID] || []).length;
      };
      if (levelKey === "regions") {
        (provincesOf[id] || []).forEach((p) => {
          c.provinces++;
          (municipalitiesOf[p.provinceID] || []).forEach(addMunicipality);
        });
      } else if (levelKey === "provinces") {
        (municipalitiesOf[id] || []).forEach(addMunicipality);
      } else if (levelKey === "municipalities") {
        c.barangays = (barangaysOf[id] || []).length;
      }
      return c;
    };

    return { rowOf, childrenOf, pathOf, countsBelow };
  }, [bundle]);

  // One flat, searchable entry per address (≈3,000 rows — cheap to scan).
  // `root` is the top-most parent that still exists: the region to open on the right.
  const index = useMemo(() => {
    const out = [];
    LEVELS.forEach((L) => {
      bundle[L.key].forEach((row) => {
        const path = lk.pathOf(L.key, row);
        const id = row[L.idField];
        const name = row[L.nameField] || "";
        out.push({
          levelKey: L.key,
          id,
          name,
          nameN: norm(name),
          pathN: norm(path.map((p) => p.name).join(" ")),
          path,
          root: path[0] ? { levelKey: path[0].levelKey, id: path[0].id } : { levelKey: L.key, id },
        });
      });
    });
    return out;
  }, [bundle, lk]);

  const tokens = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  const results = useMemo(() => {
    if (!tokens.length) return [];
    // Every word must appear in the name or in the parent path ("poblacion pampanga").
    const list = index.filter((e) => tokens.every((t) => e.nameN.includes(t) || e.pathN.includes(t)));
    const rank = (e) => (tokens.every((t) => e.nameN.includes(t)) ? (e.nameN.startsWith(tokens[0]) ? 0 : 1) : 2);
    return list.sort(
      (a, b) => rank(a) - rank(b) || LEVEL_ORDER[a.levelKey] - LEVEL_ORDER[b.levelKey] || cmp(a.name, b.name)
    );
  }, [index, tokens]);

  useEffect(() => { setLimit(PAGE); }, [query]);

  const shown = results.slice(0, limit);
  const left = results.length - shown.length;

  // The selected row, if it still exists.
  const selectedRow = selected ? lk.rowOf[selected.levelKey][selected.id] : null;

  useEffect(() => {
    if (!loading && selected && !selectedRow) setSelected(null); // it was deleted
  }, [loading, selected, selectedRow]);

  // ── moving between entries (asks first when the panel has unsaved edits) ──
  const guard = (fn) => {
    if (dirtyRef.current) setPendingNav(() => fn);
    else fn();
  };

  // Open a region (or, for a search hit, its region with that row highlighted).
  const openEntry = (e) => guard(() => {
    dirtyRef.current = false;
    setCreating(false);
    const isRoot = e.root.levelKey === e.levelKey && e.root.id === e.id;
    setSelected({ levelKey: e.root.levelKey, id: e.root.id, focus: isRoot ? null : { levelKey: e.levelKey, id: e.id } });
  });

  const openRegion = (row) => guard(() => {
    dirtyRef.current = false;
    setCreating(false);
    setSelected({ levelKey: "regions", id: row.regionID, focus: null });
  });

  const closePanel = () => guard(() => {
    dirtyRef.current = false;
    setSelected(null);
    setCreating(false);
  });

  const startCreate = () => guard(() => {
    dirtyRef.current = false;
    setSelected(null);
    setCreating(true);
  });

  // Edits thrown away from inside the panel: a new region closes, an existing one goes back to read-only.
  const discardEdit = () => {
    dirtyRef.current = false;
    if (creating) setCreating(false);
    else setVersion((v) => v + 1);
  };

  // After a save: reload, go back to read-only, and open a newly added region.
  const handleSaved = async ({ msg, created }) => {
    dirtyRef.current = false;
    await load({ silent: true });
    showToast(msg);
    if (created) {
      setCreating(false);
      if (created.id) setSelected({ levelKey: created.levelKey, id: created.id, focus: null });
    }
  };

  // ── delete (cascades — the batch endpoint removes everything underneath) ──
  const requestDelete = (levelKey, row) => {
    const L = LEVEL[levelKey];
    const below = lk.countsBelow(levelKey, row[L.idField]);
    const parts = [
      below.provinces && plural(below.provinces, "province", "provinces"),
      below.municipalities && plural(below.municipalities, "municipality", "municipalities"),
      below.barangays && plural(below.barangays, "barangay", "barangays"),
    ].filter(Boolean);
    setToDelete({ levelKey, id: row[L.idField], name: row[L.nameField] || "—", parts });
  };

  const confirmDelete = async () => {
    const { levelKey, id, name } = toDelete;
    const L = LEVEL[levelKey];
    setBusy(true);
    try {
      await api("/api/addresses/batch", {
        method: "POST",
        body: { ops: [{ op: "delete", level: levelKey, id }], context: `${L.singular} ${name}` },
      });
      dirtyRef.current = false;
      setToDelete(null);
      setSelected(null);
      await load({ silent: true });
      showToast(`${L.singular} deleted.`);
    } catch (e) {
      showToast(`Failed to delete: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  // ── parent choices for "Belongs to" (only shown for an entry whose region is missing) ──
  const parentOptionsBy = useMemo(() => ({
    provinces: bundle.regions.map((r) => ({ value: r.regionID, label: r.regionName })),
    municipalities: bundle.provinces.map((p) => ({ value: p.provinceID, label: p.provinceName })),
    barangays: bundle.municipalities
      .map((m) => ({ value: m.municipalityID, label: `${m.municipalityName} — ${lk.rowOf.provinces[m.provinceID]?.provinceName || ""}` }))
      .sort((a, b) => cmp(a.label, b.label)),
  }), [bundle, lk]);

  const hasPanel = creating || !!selectedRow;
  const panelProps = {
    bundle, lk, parentOptionsBy, canDelete, api,
    onClose: closePanel,
    onSaved: handleSaved,
    onDiscard: discardEdit,
    onDirtyChange: setDirty,
    onDelete: requestDelete,
  };

  return (
    <div className="w-full px-4">
      <Toast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-arl-dark">Addresses</h1>
          <p className="text-sm text-gray-400 mt-0.5">Regions, provinces, municipalities and barangays</p>
        </div>
        <button onClick={startCreate} disabled={loading} className={btnPrimary}>
          + Add region
        </button>
      </div>

      <ErrorBanner onRetry={() => load()}>{error}</ErrorBanner>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: regions (or search results) */}
        <div className={`${hasPanel ? "hidden lg:block" : ""} w-full lg:w-72 shrink-0`}>
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
              placeholder="Search region, province, barangay…"
              aria-label="Search addresses"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-16 animate-pulse" />
              ))}
            </div>
          ) : tokens.length ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                {results.length === 0 ? "No matches." : `${results.length.toLocaleString()} ${results.length === 1 ? "match" : "matches"}`}
              </p>
              {shown.map((e) => {
                const parents = [...e.path].reverse().map((p) => p.name).join(", ");
                const isSel = selected?.focus
                  ? selected.focus.levelKey === e.levelKey && selected.focus.id === e.id
                  : selected?.levelKey === e.levelKey && selected?.id === e.id;
                return (
                  <button key={`${e.levelKey}:${e.id}`} onClick={() => openEntry(e)} className={`${boxCls(isSel)} p-3`}>
                    <p className="font-semibold text-gray-800 text-sm truncate">{e.name || "—"}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {LEVEL[e.levelKey].singular}{parents ? ` · ${parents}` : ""}
                    </p>
                  </button>
                );
              })}
              {left > 0 && (
                <button onClick={() => setLimit((v) => v + MORE)} className={`${btnGhost} w-full`}>
                  Show more ({left.toLocaleString()} left)
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {bundle.regions.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-8">No regions yet.</p>
              )}
              {bundle.regions.map((r) => {
                const isSel = selected?.levelKey === "regions" && selected.id === r.regionID;
                return (
                  <button key={r.regionID} onClick={() => openRegion(r)} className={`${boxCls(isSel)} p-4`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{r.regionName || "—"}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {plural(lk.childrenOf("regions", r.regionID).length, "province", "provinces")}
                        </p>
                      </div>
                      {isSel && <CheckBadge />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: the selected region */}
        <div className={`${hasPanel ? "" : "hidden lg:block"} flex-1 min-w-0`}>
          {creating ? (
            <BranchPanel key={`new:${version}`} levelKey="regions" row={null} focus={null} {...panelProps} />
          ) : selectedRow ? (
            <BranchPanel
              key={`${selected.levelKey}:${selected.id}:${selected.focus?.id || ""}:${version}`}
              levelKey={selected.levelKey}
              row={selectedRow}
              focus={selected.focus}
              {...panelProps}
            />
          ) : (
            <div className={`${cardCls} p-10 text-center`}>
              <p className="text-sm text-gray-400">
                Pick a region on the left to see its provinces, municipalities and barangays, or search for any of them.
              </p>
            </div>
          )}
        </div>
      </div>

      {pendingNav && (
        <ConfirmDialog
          title="Discard changes?"
          danger
          confirmLabel="Discard"
          onConfirm={() => { const go = pendingNav; setPendingNav(null); dirtyRef.current = false; go(); }}
          onCancel={() => setPendingNav(null)}
        >
          You have unsaved changes. Leave without saving them?
        </ConfirmDialog>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete ${LEVEL[toDelete.levelKey].singular.toLowerCase()}?`}
          danger
          confirmLabel="Delete"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        >
          Remove <strong>{toDelete.name}</strong>
          {toDelete.parts.length > 0 ? <> and everything under it ({joinList(toDelete.parts)})</> : null}
          {" "}from the address list? This can't be undone.
        </ConfirmDialog>
      )}
    </div>
  );
}

// ─── Right side: one region and everything under it ──────────────────────────
//
// Opens read-only. Edit makes the same tree editable in place: every name can
// be renamed, every open row has a box for adding its children. Nothing is
// sent until "Save changes" — all edits are collected into one list of
// operations and posted to /api/addresses/batch, so the whole branch saves
// together or not at all.
//
// The panel is keyed by the entry it shows, so picking something else (or a
// reload after saving) starts it fresh in read-only mode. If a search hit is
// deep in the tree, its parents are opened and the row is highlighted. (If an
// entry's region no longer exists, the tree starts at the top-most parent
// that does, and a "Belongs to" dropdown lets you re-attach it.)
//
// Delete: Owner/Admin only. Deleting a row inside the tree also removes
// everything under it (the row says how many). Unsaved new rows can be
// discarded by anyone.

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
      <span className="w-6 shrink-0" />
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

function TreeNode({ nodeKey, ctx }) {
  const { nodes, kids, open, problems, canDelete, readOnly } = ctx;
  const n = nodes[nodeKey];
  const rowRef = useRef(null);
  const isFocus = ctx.focusKey === nodeKey;
  useEffect(() => {
    if (isFocus) rowRef.current?.scrollIntoView?.({ block: "center" });
  }, [isFocus]);

  const childKey = CHILD_OF[n.levelKey];
  const childL = childKey ? LEVEL[childKey] : null;
  const kidKeys = kids[nodeKey] || [];
  const isOpen = open.has(nodeKey);

  if (n.deleted) {
    const below = ctx.countBelow(nodeKey);
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 my-0.5 rounded-lg bg-red-50/70">
        <span className="w-6 shrink-0" />
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
      <div ref={rowRef} className={`flex items-center gap-2 py-0.5 rounded-lg ${isFocus ? "bg-teal-50 ring-1 ring-teal-100" : ""}`}>
        {childKey ? (
          <button
            onClick={() => ctx.toggleOpen(nodeKey)}
            className="w-6 h-6 shrink-0 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-sm leading-none"
            aria-label={isOpen ? "Collapse" : "Expand"}
            aria-expanded={isOpen}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {readOnly ? (
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
        {!readOnly && (canDelete || n.isNew) ? (
          <button
            onClick={() => ctx.toggleDelete(nodeKey)}
            className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"
          >
            {n.isNew ? "Discard" : "Delete"}
          </button>
        ) : (
          !readOnly && <span className="w-[62px] shrink-0" />
        )}
      </div>
      {problems[nodeKey] && <p className="text-xs text-red-500 ml-8 mb-1">{problems[nodeKey]}</p>}
      {childKey && isOpen && (
        <div className="ml-3 pl-3 border-l border-gray-100">
          {kidKeys.map((k) => <TreeNode key={k} nodeKey={k} ctx={ctx} />)}
          {readOnly && kidKeys.length === 0 && (
            <p className="text-xs text-gray-400 py-1.5 pl-8">No {childL.label.toLowerCase()} yet.</p>
          )}
          {!readOnly && <AddRow noun={childL.singular.toLowerCase()} onAdd={(names) => ctx.addChildren(nodeKey, names)} />}
        </div>
      )}
    </div>
  );
}

function BranchPanel({
  levelKey, row, focus, bundle, lk, parentOptionsBy, canDelete, api,
  onClose, onSaved, onDiscard, onDirtyChange, onDelete,
}) {
  const isNew = !row;
  const L = LEVEL[levelKey];
  const parent = L.parent;
  const childKey = CHILD_OF[levelKey];
  const childL = childKey ? LEVEL[childKey] : null;
  const parentOptions = parentOptionsBy[levelKey] || [];

  const seq = useRef(1);
  const nameRef = useRef(null);
  const [{ nodes: initialNodes, rootKey }] = useState(() => buildDraft(bundle, levelKey, row));
  const [nodes, setNodes] = useState(initialNodes);
  // Rows opened at the start: the parents of a search hit, so it's visible.
  const [open, setOpen] = useState(() => {
    const s = new Set();
    const focusRow = focus ? lk.rowOf[focus.levelKey][focus.id] : null;
    if (focusRow) lk.pathOf(focus.levelKey, focusRow).slice(1).forEach((p) => s.add(`e:${p.id}`));
    return s;
  });
  const focusKey = focus ? `e:${focus.id}` : null;
  const origParentID = row && parent ? row[parent.field] || "" : "";
  const [parentID, setParentID] = useState(origParentID);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

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
  const addChildren = (parentKey, names) => {
    setNodes((s) => {
      const next = { ...s };
      const childLevel = CHILD_OF[s[parentKey].levelKey];
      names.forEach((name) => {
        const key = `n:${seq.current++}`;
        next[key] = { key, levelKey: childLevel, id: null, name, orig: "", parentKey, order: NEW_ORDER_BASE + seq.current, isNew: true, deleted: false };
      });
      return next;
    });
    setOpen((s) => new Set(s).add(parentKey)); // show what was just added
  };
  const countBelow = (key) => {
    let c = 0;
    const walk = (k) => (kids[k] || []).forEach((ck) => { if (!nodes[ck].isNew) c++; walk(ck); });
    walk(key);
    return c;
  };

  const root = nodes[rootKey];
  const rootKids = kids[rootKey] || [];

  // ── what would be saved ──
  const { ops, problems, removed, renamed, moved } = useMemo(() => {
    const ops = [];
    const problems = {};
    let removed = 0, renamed = 0, moved = 0;

    // root
    const rootName = root.name.trim();
    if (root.isNew) {
      ops.push({ op: "create", level: L.key, tempID: root.key, name: rootName, ...(L.parent ? { parentID } : {}) });
    } else if (rootName !== root.orig.trim() || (L.parent && parentID !== origParentID)) {
      if (rootName !== root.orig.trim()) renamed++;
      if (L.parent && parentID !== origParentID) moved++;
      ops.push({
        op: "update", level: L.key, id: root.id, name: rootName,
        ...(L.parent && parentID !== origParentID ? { parentID } : {}),
      });
    }
    if (!rootName && !root.isNew) problems[root.key] = "Name is required.";

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
  }, [nodes, kids, root, parentID, origParentID, L]);

  const created = ops.filter((o) => o.op === "create").length;
  const problemCount = Object.keys(problems).length;
  const rootNameMissing = root.isNew && !root.name.trim();
  const parentMissing = !!parent && !parentID;

  const dirty = isNew ? root.name.trim() !== "" || Object.keys(nodes).length > 1 : ops.length > 0;
  const canSave = !saving && ops.length > 0 && problemCount === 0 && !rootNameMissing && !parentMissing;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  const summary = [
    created && `${created} added`,
    renamed && `${renamed} renamed`,
    moved && `${moved} moved`,
    removed && `${removed.toLocaleString()} deleted`,
  ].filter(Boolean).join(" · ");

  const requestCancel = () => (dirty ? setConfirmDiscard(true) : onDiscard());

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api("/api/addresses/batch", {
        method: "POST",
        body: { ops, context: `${L.singular} ${root.name.trim() || root.orig}` },
      });
      await onSaved({
        msg: `${L.singular} saved: ${summary}.`,
        created: isNew ? { levelKey, id: res?.data?.ids?.[rootKey] } : null,
      });
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
    nodes, kids, open, problems, canDelete, readOnly: !editing, focusKey,
    rename, toggleDelete, toggleOpen, addChildren, countBelow,
  };

  // "9 provinces · 130 municipalities · 3,200 barangays"
  const below = row ? lk.countsBelow(levelKey, row[L.idField]) : null;
  const counts = below
    ? [
        levelKey === "regions" && below.provinces > 0 && plural(below.provinces, "province", "provinces"),
        (levelKey === "regions" || levelKey === "provinces") && below.municipalities > 0 && plural(below.municipalities, "municipality", "municipalities"),
        levelKey !== "barangays" && below.barangays > 0 && plural(below.barangays, "barangay", "barangays"),
      ].filter(Boolean)
    : [];
  const path = row ? lk.pathOf(levelKey, row) : [];

  const title = isNew ? root.name.trim() || "New region" : root.orig || "—";
  const subtitle = editing
    ? (problemCount ? `Fix ${problemCount} ${problemCount === 1 ? "name" : "names"} to save` : summary || "No changes yet")
    : counts.length
      ? counts.join(" · ")
      : childL ? "Nothing under it yet" : L.singular;

  return (
    <div className="space-y-4">
      {/* Header card — stays in view while the tree scrolls */}
      <div className={`${cardCls} p-5 sticky top-2 z-10`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-arl-dark text-base truncate">{title}</h2>
            <p className={`text-xs ${editing && problemCount ? "text-red-500" : "text-gray-400"}`}>{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={requestCancel} disabled={saving} className={btnGhost}>Cancel</button>
                <button onClick={save} disabled={!canSave} className={btnPrimary}>
                  {saving ? "Saving…" : isNew ? "Add region" : "Save changes"}
                </button>
              </>
            ) : (
              <>
                {canDelete && (
                  <button onClick={() => onDelete(levelKey, row)} className={`${actionBtn} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}>
                    Delete
                  </button>
                )}
                <button onClick={() => setEditing(true)} className={`${actionBtn} border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`}>
                  Edit
                </button>
                <button onClick={onClose} className={btnGhost}>Close</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content card */}
      <div className={`${cardCls} p-5 space-y-4`}>
        {editing && (
          <>
            <Field label={`${L.singular} name`} error={problems[rootKey]}>
              <input
                ref={nameRef}
                value={root.name}
                onChange={(e) => rename(rootKey, e.target.value)}
                placeholder={`${L.singular} name`}
                className={`${inputCls} ${problems[rootKey] ? "!border-red-300" : ""}`}
              />
            </Field>
            {parent && (
              <Field label={`Belongs to ${parent.singular.toLowerCase()}`}>
                <select className={inputCls} value={parentID} onChange={(e) => setParentID(e.target.value)}>
                  <option value="" disabled>Select {parent.singular.toLowerCase()}…</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            )}
          </>
        )}

        {!editing && path.length > 0 && (
          <p className="text-xs text-gray-400">Under {[...path].reverse().map((p) => p.name).join(", ")}</p>
        )}

        {childL ? (
          <div>
            <h3 className="text-sm font-semibold text-gray-700">{childL.label}</h3>
            <p className="text-xs text-gray-400 leading-relaxed mt-0.5 mb-2">
              {editing
                ? "Click a name to rename it. Open a row with ▸ and use the box at the bottom to add more (paste a list, one per line, to add many). Nothing is saved until you press Save changes."
                : "Open a row with ▸ to see what's under it."}
            </p>
            <div className="border border-gray-100 rounded-xl p-2">
              {rootKids.map((k) => <TreeNode key={k} nodeKey={k} ctx={ctx} />)}
              {!editing && rootKids.length === 0 && (
                <p className="text-xs text-gray-400 py-2 px-2">No {childL.label.toLowerCase()} yet. Use Edit to add some.</p>
              )}
              {editing && <AddRow noun={childL.singular.toLowerCase()} onAdd={(names) => addChildren(rootKey, names)} />}
            </div>
          </div>
        ) : (
          !editing && (
            <p className="text-sm text-gray-400">Nothing is under a barangay. Use Edit to rename it or move it to another municipality.</p>
          )
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          danger
          confirmLabel="Discard"
          onConfirm={onDiscard}
          onCancel={() => setConfirmDiscard(false)}
        >
          You have unsaved changes{summary ? ` (${summary})` : ""}. Close without saving?
        </ConfirmDialog>
      )}
    </div>
  );
}