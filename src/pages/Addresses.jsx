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
// Layout (same as Bookings / Maintenance): a searchable, paginated table with
// one tab per level (Regions · Provinces · Municipalities · Barangays).
//   • Table — one row per region (with how many provinces / municipalities /
//             barangays are under it). Typing in the search box, or picking a
//             level, swaps it for matches from that level, each with its
//             parents shown. View opens the entry.
//   • View  — the region and everything under it as a tree (only opened rows
//             are drawn). It opens read-only; Edit makes the same tree
//             editable in place. Edits are collected and saved together with
//             one Save changes (POST /api/addresses/batch). Close goes back
//             to the table.
//
// Backend: routes/addresses. View/add/edit — Owner, Admin, Supervisor.
// Delete — Owner and Admin only (mirrored here by `canDelete`). Deleting an
// entry also removes everything under it; the confirm dialog says how many.

const PAGE_SIZE = 10;

// ─── Pagination (same pattern as Bookings.jsx) ───────────────────────────────
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
        Showing {count === 0 ? 0 : start + 1}–{rangeEnd} of {count.toLocaleString()}
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
                n === page ? "bg-teal-600 text-white shadow" : "border text-gray-600 hover:bg-white"
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

// Clickable <th> that toggles asc/desc (same as the Bookings table).
function SortableTh({ label, sortKey: key, sortKeyState, sortDir, onSort }) {
  const active = sortKeyState === key;
  return (
    <th className="px-4 py-3 text-left select-none">
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

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

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Card + label-over-value cell, same as the Bookings details window.
function InfoSection({ title, aside, children, cols = 2 }) {
  return (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h3>
        {aside}
      </div>
      <div className={`p-4 grid ${cols === 3 ? "grid-cols-3" : "grid-cols-2"} gap-x-6 gap-y-4`}>{children}</div>
    </section>
  );
}
function InfoField({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-800 mt-0.5 break-words">{value || "—"}</div>
    </div>
  );
}

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
  const [tab, setTab] = useState("regions");
  const [sortKey, setSortKey] = useState(null); // null = the natural A–Z order by parent
  const [sortDir, setSortDir] = useState("asc");
  const [searchBy, setSearchBy] = useState("name"); // "name", or the level of one of the table's parent columns

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
          pathBy: Object.fromEntries(path.map((p) => [p.levelKey, norm(p.name)])),
          root: path[0] ? { levelKey: path[0].levelKey, id: path[0].id } : { levelKey: L.key, id },
        });
      });
    });
    return out;
  }, [bundle, lk]);

  const tokens = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  // The text a search looks at for an entry: its own name, or the name of one of its parents.
  const fieldOf = useCallback(
    (e) => (searchBy === "name" || searchBy === e.levelKey ? e.nameN : e.pathBy[searchBy] || ""),
    [searchBy]
  );

  // Matches per level. The tabs show these counts, so a search tells you where the hits are.
  const matches = useMemo(() => {
    const by = { regions: [], provinces: [], municipalities: [], barangays: [] };
    index.forEach((e) => {
      const f = fieldOf(e);
      if (tokens.every((t) => f.includes(t))) by[e.levelKey].push(e);
    });
    if (tokens.length) {
      const rank = (e) => {
        const f = fieldOf(e);
        return f.startsWith(tokens[0]) ? 0 : 1;
      };
      Object.values(by).forEach((list) => list.sort((a, b) => rank(a) - rank(b) || cmp(a.name, b.name)));
    }
    return by;
  }, [index, tokens, fieldOf]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Sort keys: "name", "p:<level>" for a parent column, "c:<level>" for a count column.
  const results = useMemo(() => {
    const list = matches[tab];
    if (!sortKey) return list;
    const [kind, lvl] = sortKey.split(":");
    const val = (e) => {
      if (sortKey === "name") return e.name;
      if (kind === "p") return e.path.find((p) => p.levelKey === lvl)?.name || "";
      return lk.countsBelow(e.levelKey, e.id)[lvl] || 0;
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      const d = typeof av === "number" ? av - bv : cmp(av, bv);
      return d * dir || cmp(a.name, b.name);
    });
  }, [matches, tab, sortKey, sortDir, lk]);

  const { page, setPage, totalPages, pageItems, start, count } = usePagination(results, PAGE_SIZE);
  useEffect(() => { setPage(1); }, [query, tab, searchBy, sortKey, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Open an entry on its own: just that entry and what is under it.
  const openEntry = (e) => guard(() => {
    dirtyRef.current = false;
    setCreating(false);
    setSelected({ levelKey: e.levelKey, id: e.id, focus: null });
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

  // Edits thrown away from inside the window: a new region closes, an existing one goes back to read-only.
  const discardEdit = () => {
    dirtyRef.current = false;
    if (creating) setCreating(false);
    else setVersion((v) => v + 1);
  };

  // After a save: reload and go back to read-only; a newly added region is opened.
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

  // Lock page scroll behind the modal.
  useEffect(() => {
    if (!hasPanel) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [hasPanel]);
  const panelProps = {
    bundle, lk, parentOptionsBy, canDelete, api,
    onClose: closePanel,
    onSaved: handleSaved,
    onDiscard: discardEdit,
    onDirtyChange: setDirty,
    onDelete: requestDelete,
  };

  const thCls = "px-4 py-3 text-left font-semibold";
  const skeleton = (cols) => Array.from({ length: 5 }).map((_, i) => (
    <tr key={i} className="border-b border-gray-50">
      {Array.from({ length: cols }).map((__, j) => (
        <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
      ))}
    </tr>
  ));
  const viewBtn = (onClick) => (
    <button onClick={onClick}
      className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">View</button>
  );
  // Columns per tab: the name, the parents it sits under, and what is under it.
  const col = (label, kind, key) => ({ label, kind, key, sortKey: kind === "name" ? "name" : `${kind === "parent" ? "p" : "c"}:${key}` });
  const COLS = {
    regions: [col("Region", "name"), col("Provinces", "count", "provinces"), col("Municipalities", "count", "municipalities"), col("Barangays", "count", "barangays")],
    provinces: [col("Province", "name"), col("Region", "parent", "regions"), col("Municipalities", "count", "municipalities"), col("Barangays", "count", "barangays")],
    municipalities: [col("Municipality", "name"), col("Province", "parent", "provinces"), col("Region", "parent", "regions"), col("Barangays", "count", "barangays")],
    barangays: [col("Barangay", "name"), col("Municipality", "parent", "municipalities"), col("Province", "parent", "provinces"), col("Region", "parent", "regions")],
  };
  const cols = COLS[tab].length + 1;
  // "Search by" mirrors the table's text columns (the counts aren't searchable).
  const searchOptions = COLS[tab]
    .filter((c) => c.kind !== "count")
    .map((c) => ({ key: c.kind === "name" ? "name" : c.key, label: c.label }));
  const searchLabel = searchOptions.find((o) => o.key === searchBy)?.label || "";

  return (
    <div className="w-full px-4 space-y-5">
      <Toast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-arl-dark">Addresses</h1>
      </div>

      <ErrorBanner onRetry={() => load()}>{error}</ErrorBanner>

        <div className="bg-white rounded-2xl border overflow-hidden">
          {/* TABS — one per level, with how many entries each holds (or matches) */}
          <div className="flex gap-1 px-4 pt-2 border-b overflow-x-auto overflow-y-hidden" role="tablist">
            {LEVELS.map((L) => {
              const active = tab === L.key;
              return (
                <button key={L.key} role="tab" aria-selected={active} onClick={() => { setTab(L.key); setSearchBy("name"); setSortKey(null); setSortDir("asc"); }}
                  className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    active ? "border-teal-600 text-teal-700" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  {L.label}
                  <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs ${active ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                    {matches[L.key].length.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* SEARCH — same layout as the Bookings page */}
          <div className="flex flex-wrap gap-3 items-end p-4 border-b">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
              <select value={searchBy} onChange={(e) => { setSearchBy(e.target.value); setQuery(""); }}
                className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white">
                {searchOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
              placeholder={`Enter ${searchLabel.toLowerCase()}...`}
              aria-label="Search addresses"
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none"
            />
            <div className="flex items-center gap-2">
              <button onClick={() => load()} disabled={loading}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-teal-300 text-teal-700 bg-white hover:bg-teal-50 disabled:opacity-50 flex items-center gap-1.5">
                <IconRefresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button onClick={startCreate} disabled={loading}
                className="px-4 py-2 text-sm rounded-xl bg-teal-600 text-white hover:bg-teal-700 font-semibold disabled:opacity-60">
                + Add region
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                  {COLS[tab].map((c) => (
                    <SortableTh key={c.label} label={c.label} sortKey={c.sortKey} sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  ))}
                  <th className={thCls}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? skeleton(cols) : count === 0 ? (
                  <tr>
                    <td colSpan={cols} className="text-center py-16 text-gray-400 text-sm">
                      {tokens.length ? "No matches." : tab === "regions" ? "No regions yet. Add the first one." : `No ${LEVEL[tab].label.toLowerCase()} yet.`}
                    </td>
                  </tr>
                ) : pageItems.map((e, i) => {
                  const below = tab === "barangays" ? null : lk.countsBelow(e.levelKey, e.id);
                  return (
                    <tr key={`${e.levelKey}:${e.id}`}
                      className={`border-b border-gray-50 last:border-0 hover:bg-teal-50/30 transition-colors ${i % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                      {COLS[tab].map((c) => (
                        c.kind === "name" ? (
                          <td key={c.label} className="px-4 py-3 font-semibold text-gray-800 text-sm">{e.name || "—"}</td>
                        ) : (
                          <td key={c.label} className="px-4 py-3 text-sm text-gray-600">
                            {c.kind === "parent"
                              ? e.path.find((p) => p.levelKey === c.key)?.name || "—"
                              : (below?.[c.key] || 0).toLocaleString()}
                          </td>
                        )
                      ))}
                      <td className="px-4 py-3 text-left whitespace-nowrap">{viewBtn(() => openEntry(e))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
        </div>

      {/* View opens as a modal over the table (same shell as the Bookings details window). */}
      {hasPanel && (creating ? (
        <BranchPanel key={`new:${version}`} levelKey="regions" row={null} focus={null} {...panelProps} />
      ) : (
        <BranchPanel
          key={`${selected.levelKey}:${selected.id}:${version}`}
          levelKey={selected.levelKey}
          row={selectedRow}
          focus={selected.focus}
          {...panelProps}
        />
      ))}

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
function AddRow({ noun, onAdd, indent = true }) {
  const [v, setV] = useState("");
  const commit = (text) => {
    const names = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (names.length) onAdd(names);
    setV("");
  };
  return (
    <div className="flex items-center gap-2 py-1.5">
      {indent && <span className="w-6 shrink-0" />}
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
      <div ref={rowRef} className={`flex items-center gap-2 py-1 rounded-lg border-b border-gray-100 hover:bg-gray-50 ${isFocus ? "bg-teal-50 ring-1 ring-teal-100" : ""}`}>
        {childKey ? (
          <button
            onClick={() => ctx.toggleOpen(nodeKey)}
            className="w-6 h-6 shrink-0 rounded-md text-gray-600 hover:bg-teal-50 hover:text-teal-700 text-base leading-none"
            aria-label={isOpen ? "Collapse" : "Expand"}
            aria-expanded={isOpen}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : null}
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <span className={`block truncate px-2.5 py-1.5 text-[15px] text-gray-900 ${childKey ? "font-semibold" : "font-medium"}`}>{n.name || "—"}</span>
          ) : (
            <NameInput value={n.name} invalid={!!problems[nodeKey]} onCommit={(v) => ctx.rename(nodeKey, v)} />
          )}
        </div>
        {n.isNew && (
          <span className="shrink-0 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5">NEW</span>
        )}
        {childL && (
          <span className="shrink-0 text-xs font-medium text-gray-500 whitespace-nowrap w-28 text-right">
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
        <div className="ml-3 pl-3 border-l-2 border-teal-100">
          {kidKeys.map((k) => <TreeNode key={k} nodeKey={k} ctx={ctx} />)}
          {readOnly && kidKeys.length === 0 && (
            <p className="text-xs text-gray-400 py-1.5 pl-8">No {childL.label.toLowerCase()} yet.</p>
          )}
          {!readOnly && <AddRow noun={childL.singular.toLowerCase()} indent={!!CHILD_OF[childKey]} onAdd={(names) => ctx.addChildren(nodeKey, names)} />}
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
  // Opening a row closes its siblings (and everything open under them), so only one is open at a time.
  const toggleOpen = (key) => setOpen((s) => {
    const t = new Set(s);
    const closeBranch = (k) => { t.delete(k); (kids[k] || []).forEach(closeBranch); };
    if (t.has(key)) {
      closeBranch(key);
    } else {
      (kids[nodes[key].parentKey] || []).forEach((sib) => { if (sib !== key) closeBranch(sib); });
      t.add(key);
    }
    return t;
  });
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

  const path = row ? lk.pathOf(levelKey, row) : [];

  const heading = isNew ? "Add Region" : editing ? `Edit ${L.singular}` : `${L.singular} Details`;
  // Only while editing: what would be saved. Viewing shows nothing up here.
  const subtitle = editing
    ? (problemCount ? `Fix ${problemCount} ${problemCount === 1 ? "name" : "names"} to save` : summary || "No changes yet")
    : "";
  const below = row ? lk.countsBelow(levelKey, row[L.idField]) : null;
  const deeper = LEVELS.slice(LEVELS.indexOf(L) + 1);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-lg text-gray-800">{heading}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Close">
              <IconX className="w-5 h-5" />
            </button>
          </div>
          {subtitle && <p className={`text-sm mt-1 truncate ${problemCount ? "text-red-500" : "text-gray-500"}`}>{subtitle}</p>}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {editing && (
            <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-gray-50 border-b">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Details</h3>
              </div>
              <div className="p-4 space-y-4">
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
              </div>
            </section>
          )}

          {/* Everything about this entry in one card: where it sits, its own name, and what is under it. */}
          {!editing && row && (
            <InfoSection title="Location" cols={3}>
              {path.map((p) => <InfoField key={p.levelKey} label={LEVEL[p.levelKey].singular} value={p.name} />)}
              <InfoField label={L.singular} value={root.orig} />
              {deeper.map((D) => <InfoField key={D.key} label={D.label} value={(below?.[D.key] || 0).toLocaleString()} />)}
            </InfoSection>
          )}

          {/* What is under it. A barangay has nothing under it, so it shows no list. */}
          {childL && (
            <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{childL.label}</h3>
              </div>
              <div className="p-4">
                <div className="border border-gray-200 rounded-xl p-2">
                  {rootKids.map((k) => <TreeNode key={k} nodeKey={k} ctx={ctx} />)}
                  {!editing && rootKids.length === 0 && (
                    <p className="text-xs text-gray-400 py-2 px-2">No {childL.label.toLowerCase()} yet. Use Edit to add some.</p>
                  )}
                  {editing && <AddRow noun={childL.singular.toLowerCase()} indent={!!CHILD_OF[childKey]} onAdd={(names) => addChildren(rootKey, names)} />}
                </div>
              </div>
            </section>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <button onClick={save} disabled={!canSave} className="w-full px-3 py-1.5 bg-teal-600 text-white font-semibold rounded-xl text-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">
                {saving ? "Saving…" : isNew ? "Add region" : "Save changes"}
              </button>
              <button onClick={requestCancel} disabled={saving} className="w-full py-1.5 border rounded-xl text-sm disabled:opacity-60">Cancel</button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <button onClick={() => setEditing(true)} className="w-full px-3 py-1.5 bg-teal-600 text-white font-semibold rounded-xl text-sm hover:bg-teal-700 transition-colors">Edit</button>
                {canDelete && (
                  <button onClick={() => onDelete(levelKey, row)} className="w-full px-3 py-1.5 border border-red-200 bg-red-50 text-red-600 font-semibold rounded-xl text-sm hover:bg-red-100 transition-colors">Delete</button>
                )}
              </div>
              <button onClick={onClose} className="w-full mt-1.5 py-1.5 border rounded-xl text-sm">Close</button>
            </>
          )}
        </div>
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