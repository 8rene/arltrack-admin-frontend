import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  collection, getDocs, doc, updateDoc, addDoc,
  serverTimestamp, query, where, orderBy
} from "firebase/firestore";
import { db } from "../fireabase";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";

// ─── ROLE TABS ───────────────────────────────────────────────────────────────
// Role IDs are no longer resolved here at all (previously: hardcoded, then
// briefly a broken dynamic Firestore lookup). The list itself is now
// fetched via GET /api/users?role=<key> — the backend
// (utils/roles/role.util.js's resolveRoleID) owns turning a role name into
// a Firestore roleID, so this file doesn't need to know IDs at all anymore.
//
// visibleTo below must stay in sync with the backend's
// ROLE_LIST_VIEWABLE_BY (same file) — that's the second, and now only
// other, place this permission is expressed. The backend enforces it
// regardless of what this array says; this just controls what's shown.
const ROLE_TABS = [
  { key: "customer",   apiRole: "Customer",       label: "Customers",   labelSingular: "Customer",   visibleTo: [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR], hasDocsSubTab: true, hasEditRequestSubTab: true },
  { key: "driver",     apiRole: ROLES.DRIVER,     label: "Drivers",     labelSingular: "Driver",     visibleTo: [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR], hasDocsSubTab: true, hasEditRequestSubTab: true },
  { key: "supervisor", apiRole: ROLES.SUPERVISOR, label: "Supervisors", labelSingular: "Supervisor", visibleTo: [ROLES.OWNER, ROLES.ADMIN],                   hasDocsSubTab: true, hasEditRequestSubTab: true },
  { key: "admin",      apiRole: ROLES.ADMIN,      label: "Admins",      labelSingular: "Admin",      visibleTo: [ROLES.OWNER],                                hasDocsSubTab: false, hasEditRequestSubTab: false },
];

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const Icons = {
  Users: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  CheckCircle: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Moon: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  IdCard: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M14 9h4M14 12h4M14 15h2" />
    </svg>
  ),
  Flag: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  Refresh: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Trash: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  ),
  Edit: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  ArrowRight: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Close: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Check: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  X: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  AlertTriangle: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Document: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Steering: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 5.5V9.8M6.2 15.5l3.7-2.2M17.8 15.5l-3.7-2.2" />
    </svg>
  ),
  Shield: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z" />
    </svg>
  ),
  Star: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15 9 22 9.3 16.5 14 18.3 21 12 17 5.7 21 7.5 14 2 9.3 9 9" />
    </svg>
  ),
};

const ROLE_ICON = { customer: Icons.Users, driver: Icons.Steering, supervisor: Icons.Shield, admin: Icons.Star };

const PAGE_SIZE = 10;

// ─── PAGINATION ───────────────────────────────────────────────────────────────
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp if the list shrinks (filter/search/refresh) and we were on a now-empty page.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, start, count: items.length };
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (totalPages <= 1) return null;

  const nums = [];
  const add = (n) => nums.push(n);
  add(1);
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) add(n);
  if (totalPages > 1) add(totalPages);
  const dedup = [...new Set(nums)].sort((a, b) => a - b);

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

function fmtDate(val) {
  if (!val) return "—";
  try {
    let d;
    // Live Firestore Timestamp (has .toDate())
    if (typeof val?.toDate === "function") d = val.toDate();
    // Timestamp that went through JSON over the API — becomes a plain
    // {_seconds, _nanoseconds} object and loses .toDate(), which is what
    // was hitting the `new Date(val)` fallback below and producing
    // "Invalid Date" for things like a user's "Joined" date.
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

// Same Firestore-Timestamp-or-string-or-seconds handling as fmtDate above,
// but returns a raw millisecond number (or -Infinity for unparsable/empty
// values) so sort() has something numeric to compare rather than strings.
function toMillis(val) {
  if (!val) return -Infinity;
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    const ms = d.getTime();
    return isNaN(ms) ? -Infinity : ms;
  } catch {
    return -Infinity;
  }
}

// ─── SORT HEADER ────────────────────────────────────────────────────────────
// Clickable <th> that toggles asc/desc on the given sortKey. Shows a neutral
// up/down chevrons icon when the column isn't the active sort (so it reads
// as "sortable" even before you've clicked it), and a bold single arrow in
// the active color once it is.
function IconChevronsUpDown({ className = "w-3.5 h-3.5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSortArrow({ dir, className = "w-3.5 h-3.5" }) {
  return (
    <svg
      className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`}
      viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortableTh({ label, sortKey: key, sortKeyState, sortDir, onSort, className = "" }) {
  const active = sortKeyState === key;
  return (
    <th className={`px-5 py-3 text-left select-none ${className}`}>
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

function getDocImages(docu) {
  if (!docu) return {};
  return {
    driverLicense: docu.driverLicenseUrl || "",
    governmentId:  docu.governmentIdUrl  || "",
    documentImage: docu.documentImageUrl || "",
    selfieWithId:  docu.selfieWithIdUrl  || "",
  };
}

// Stored as a plain "YYYY-MM-DD" string (matches an <input type="date">
// directly) — same normalization whether it arrives as that string, a
// Firestore Timestamp, or nothing yet.
function toDateInputValue(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val?.toDate === "function") return val.toDate().toISOString().slice(0, 10);
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000).toISOString().slice(0, 10);
  return "";
}

// Editable driver's-license expiry field, used inside both DocDetailModal
// (new submission review) and ViewDetailsModal's Documents tab (renewal
// later on). Admin types/confirms the date while looking at the license
// photo right next to it — no OCR, see earlier discussion on why.
function ExpiryField({ userID, docId, currentValue, onSaved }) {
  const [value, setValue] = useState(toDateInputValue(currentValue));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isExpired = value && value < today;

  const handleSave = async () => {
    if (!value) return;
    setSaving(true);
    try {
      if (docId) {
        await updateDoc(doc(db, "userDocument", docId), { driverLicenseExpiry: value, updatedAt: serverTimestamp() });
      } else {
        // No userDocument doc exists yet for this user (shouldn't normally
        // happen if they've uploaded a license, but guards against it).
        await addDoc(collection(db, "userDocument"), { userID, driverLicenseExpiry: value, createdAt: serverTimestamp() });
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved?.();
    } catch (e) {
      console.error("Expiry save error:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-400 mb-1">Driver's License Expiry</p>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-400 ${isExpired ? "border-red-300 text-red-600" : ""}`}
        />
        <button
          onClick={handleSave}
          disabled={saving || !value || value === toDateInputValue(currentValue)}
          className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "..." : savedFlash ? "Saved ✓" : "Save"}
        </button>
      </div>
      {isExpired && <p className="text-xs text-red-500 mt-1">This date is already in the past.</p>}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Users() {
  const { user: viewer } = useAuth();
  const viewerRole = viewer?.role;

  // Which role-tabs this logged-in account is allowed to see.
  const availableRoleTabs = useMemo(
    () => ROLE_TABS.filter(t => t.visibleTo.includes(viewerRole)),
    [viewerRole]
  );

  const [roleTab, setRoleTab] = useState(null);
  useEffect(() => {
    if (availableRoleTabs.length && !roleTab) setRoleTab(availableRoleTabs[0].key);
  }, [availableRoleTabs, roleTab]);

  const activeRole = availableRoleTabs.find(t => t.key === roleTab) || availableRoleTabs[0];

  const [subTab, setSubTab]   = useState("directory"); // "directory" (List) | "documents" (Document Request) | "editRequests" (Edit Request) — customers only

  // Deep-link support from Dashboard's Alert/Warning cards — e.g.
  // /users?role=driver&tab=editRequests&open=<uid>. Only handles
  // switching to the right role tab + sub-tab here; `open` itself is left
  // in the URL for whichever child tab (DirectoryTab / EditRequestsTab)
  // mounts next, since each already knows how to consume its own `open`
  // param and clear it once handled.
  //
  // deepLinkTabRef exists because changing roleTab also triggers the
  // "reset subTab to directory on role change" effect further down — the
  // ref lets that effect know "this particular roleTab change came from a
  // deep link, don't stomp the tab I just set" for exactly one run.
  const deepLinkTabRef = useRef(null);
  const [topLevelSearchParams, setTopLevelSearchParams] = useSearchParams();
  useEffect(() => {
    const roleParam = topLevelSearchParams.get("role");
    const tabParam  = topLevelSearchParams.get("tab");
    if (!roleParam && !tabParam) return;
    if (roleParam && availableRoleTabs.some(t => t.key === roleParam)) {
      deepLinkTabRef.current = tabParam || null;
      setRoleTab(roleParam);
    }
    if (tabParam) setSubTab(tabParam);
    setTopLevelSearchParams((prev) => {
      prev.delete("role");
      prev.delete("tab");
      return prev;
    }, { replace: true });
  }, [topLevelSearchParams, availableRoleTabs, setTopLevelSearchParams]);


  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);

  // Lifted up (rather than local to DirectoryTab) so the stat cards above
  // can double as quick filters — clicking one needs to reach into the
  // same state DirectoryTab's search bar / status pills already use.
  const [directoryFilter, setDirectoryFilter] = useState("All");
  useEffect(() => { setDirectoryFilter("All"); }, [roleTab]);

  // Only Admin and Owner accounts get 200s from DELETE /api/users/:uid
  // today (see user.routes.js). Hiding the action for everyone else avoids
  // a button that always ends in a 403 — this is a UI guard only, not the
  // real gate.
  const canDelete = viewerRole === ROLES.ADMIN || viewerRole === ROLES.OWNER;

  const fetchUsers = useCallback(async () => {
    if (!activeRole?.apiRole) { setUsers([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [listRes, detailsSnap, addressSnap, docSnap, bookingsSnap] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL}/api/users?role=${encodeURIComponent(activeRole.apiRole)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }),
        getDocs(collection(db, "userDetails")),
        getDocs(collection(db, "userAddress")),
        getDocs(collection(db, "userDocument")),
        getDocs(collection(db, "bookings")),
      ]);

      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error(err.message || `Failed to load ${activeRole.label} list.`);
      }
      const { data: baseUsers } = await listRes.json();

      const detailsMap = Object.fromEntries(detailsSnap.docs.map(d => [d.data().userID || d.id, { docId: d.id, ...d.data() }]));
      const addressMap = Object.fromEntries(addressSnap.docs.map(d => [d.data().userID || d.id, { docId: d.id, ...d.data() }]));
      const docMap     = Object.fromEntries(docSnap.docs.map(d => [d.data().userID || d.id, { docId: d.id, ...d.data() }]));
      const bookingCount = {};
      bookingsSnap.docs.forEach(d => {
        const uid = d.data().userID;
        if (uid) bookingCount[uid] = (bookingCount[uid] || 0) + 1;
      });

      const merged = baseUsers.map(u => ({
        ...u,
        details:      detailsMap[u.id] || {},
        address:      addressMap[u.id] || {},
        document:     docMap[u.id]     || {},
        bookingCount: bookingCount[u.id] || 0,
      }));

      setUsers(merged);
    } catch (e) {
      console.error("Users fetch error:", e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [activeRole]);

  const [pendingEditReqCount, setPendingEditReqCount] = useState(0);
  const fetchEditReqCounts = useCallback(async () => {
    try {
      const [editSnap, idSnap] = await Promise.all([
        getDocs(query(collection(db, "editRequests"), where("status", "==", "pending"))),
        getDocs(query(collection(db, "idResubmitRequests"), where("status", "==", "pending"))),
      ]);
      setPendingEditReqCount(editSnap.size + idSnap.size);
    } catch (e) {
      console.error("Edit request count fetch error:", e);
    }
  }, []);
  useEffect(() => { fetchEditReqCounts(); }, [fetchEditReqCounts]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  // Reset to the directory sub-tab whenever the role-tab changes (e.g. the
  // "Documents" sub-tab only exists under Customers).
  useEffect(() => {
    if (deepLinkTabRef.current) {
      setSubTab(deepLinkTabRef.current);
      deepLinkTabRef.current = null;
      return;
    }
    setSubTab("directory");
  }, [roleTab]);

  if (availableRoleTabs.length && !activeRole) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-2xl border p-8 text-center text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!activeRole) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-2xl border p-8 text-center text-gray-400">
          Your account role doesn't have access to this page.
        </div>
      </div>
    );
  }

  const pendingDocs = users
    .filter(u => u.isVerified !== true)
    .sort((a, b) => {
      const aT = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const bT = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return bT - aT;
    });
  const verifiedCount = users.filter(u => u.isVerified === true).length;
  const flaggedCount  = users.filter(u => u.isFlagged === true).length;
  const showVerification = activeRole.hasDocsSubTab; // ID verification stat cards apply to any role with a Document Request tab

  const RefreshBtn = () => (
    <button onClick={fetchUsers}
      className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
      <Icons.Refresh className="w-4 h-4" />
      Refresh
    </button>
  );

  return (
    <div className="p-4 space-y-5 font-sans">
      {/* ROLE TABS */}
      <div className="flex gap-2 flex-wrap">
        {availableRoleTabs.map(t => {
          const Icon = ROLE_ICON[t.key] || Icons.Users;
          return (
            <button key={t.key} onClick={() => setRoleTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                roleTab === t.key ? "bg-gray-900 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"
              }`}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* STAT CARDS — also act as quick filters for the List tab below */}
      <div className={`grid gap-4 ${showVerification ? "grid-cols-5" : "grid-cols-3"}`}>
        <StatCard title="Total"    value={users.length} Icon={Icons.Users}       color="teal"
          selected={directoryFilter === "All"}      onClick={() => { setDirectoryFilter("All");      setSubTab("directory"); }} />
        <StatCard title="Active"   value={users.filter(u => u.status?.toLowerCase() === "active").length}   Icon={Icons.CheckCircle} color="green"
          selected={directoryFilter === "active"}   onClick={() => { setDirectoryFilter("active");   setSubTab("directory"); }} />
        <StatCard title="Inactive" value={users.filter(u => u.status?.toLowerCase() === "inactive").length} Icon={Icons.Moon}        color="gray"
          selected={directoryFilter === "inactive"} onClick={() => { setDirectoryFilter("inactive"); setSubTab("directory"); }} />
        {showVerification && <StatCard title="ID Verified" value={verifiedCount} Icon={Icons.IdCard} color="blue"
          selected={directoryFilter === "verified"} onClick={() => { setDirectoryFilter("verified"); setSubTab("directory"); }} />}
        {showVerification && <StatCard title="Flagged"     value={flaggedCount}  Icon={Icons.Flag}   color="red"
          selected={directoryFilter === "flagged"}  onClick={() => { setDirectoryFilter("flagged");  setSubTab("directory"); }} />}
      </div>

      {/* SUB-TABS + REFRESH */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button onClick={() => setSubTab("directory")}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${subTab === "directory" ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            <Icons.Users className="w-4 h-4" />
            List
            <span className="ml-1 opacity-70">{users.length}</span>
          </button>
          {activeRole.hasDocsSubTab && (
            <button onClick={() => setSubTab("documents")}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${subTab === "documents" ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
              <Icons.IdCard className="w-4 h-4" />
              Document Request
              <span className="ml-1 opacity-70 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">{pendingDocs.length}</span>
            </button>
          )}
          {activeRole.hasEditRequestSubTab && (
            <button onClick={() => setSubTab("editRequests")}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${subTab === "editRequests" ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
              <Icons.Edit className="w-4 h-4" />
              Edit Request
              <span className="ml-1 opacity-70 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">{pendingEditReqCount}</span>
            </button>
          )}
        </div>
        <RefreshBtn />
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="bg-white rounded-2xl border p-8 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : subTab === "directory" ? (
        <DirectoryTab users={users} onRefresh={fetchUsers} roleLabel={activeRole.label} roleLabelSingular={activeRole.labelSingular} canDelete={canDelete} showBookings={activeRole.key === "customer"}
          filterStatus={directoryFilter} setFilterStatus={setDirectoryFilter} viewerRole={viewerRole} currentRoleName={activeRole.apiRole} />
      ) : subTab === "documents" ? (
        <DocumentsTab users={pendingDocs} onRefresh={fetchUsers} roleLabel={activeRole.label} />
      ) : (
        <EditRequestsTab onCountChange={fetchEditReqCounts} />
      )}
    </div>
  );
}

// ─── DIRECTORY TAB (used for Customers, Drivers, Supervisors, Admins) ─────────
function DirectoryTab({ users, onRefresh, roleLabel, roleLabelSingular, canDelete, showBookings, filterStatus, setFilterStatus, viewerRole, currentRoleName }) {
  const [search, setSearch]       = useState("");
  const setFilter = setFilterStatus;
  const [detailUser, setDetailUser]       = useState(null);
  const [editUser, setEditUser]           = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchParams, setSearchParams]   = useSearchParams();
  const [sortKey, setSortKey]       = useState(null); // null = default/unsorted (API order)
  const [sortDir, setSortDir]       = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const fullNameOf = (u) => {
    const fn = u.details?.firstName || "";
    const ln = u.details?.lastName  || "";
    return `${fn} ${ln}`.trim() || u.username || u.email || "—";
  };

  // Opens the exact user a notification click pointed to (?open=<refID>,
  // set by Header.jsx). Runs once this tab's users are loaded so the
  // record is there to find; strips the param afterward. Since this
  // DirectoryTab is now shared across Customer/Driver/Supervisor/Admin
  // role-tabs (not just Customers), this only finds a match if the
  // notification's refID belongs to whichever role-tab happens to be
  // active when the param is read — e.g. a new-signup notification
  // (refCollection: "user") opens correctly if you're on the Customer
  // tab already, since userWatcher.js only fires that type for customers.
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || users.length === 0) return;
    const match = users.find((u) => u.id === openID);
    if (match) setDetailUser(match);
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [searchParams, users, setSearchParams]);

  const handleDelete = async (user) => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Delete failed");
      }
      setConfirmDelete(null);
      onRefresh();
    } catch (e) { console.error("Delete/archive error:", e); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const fullName = `${u.details?.firstName || ""} ${u.details?.lastName || ""}`.toLowerCase();
    const matchSearch = !search || fullName.includes(q) || (u.email || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q);
    const matchStatus =
      filterStatus === "All" ||
      (filterStatus === "flagged"  && u.isFlagged) ||
      (filterStatus === "verified" && u.isVerified === true) ||
      (filterStatus !== "flagged" && filterStatus !== "verified" && (u.status || "").toLowerCase() === filterStatus);
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    if (sortKey === "name") return sortDir === "asc"
      ? fullNameOf(a).localeCompare(fullNameOf(b))
      : fullNameOf(b).localeCompare(fullNameOf(a));
    if (sortKey === "bookings") {
      const av = a.bookingCount || 0;
      const bv = b.bookingCount || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    }
    if (sortKey === "account") return sortDir === "asc"
      ? (a.status || "").localeCompare(b.status || "")
      : (b.status || "").localeCompare(a.status || "");
    if (sortKey === "joined") {
      const av = toMillis(a.createdAt);
      const bv = toMillis(b.createdAt);
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return 0;
  });

  const { page, setPage, totalPages, pageItems, start, count } = usePagination(sorted);
  // Jump back to page 1 whenever the visible set changes shape (new search/filter/role tab).
  useEffect(() => { setPage(1); }, [search, filterStatus, users]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-400" />
        {["All", "active", "inactive", "locked", "flagged"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${filterStatus === s ? "bg-teal-600 text-white shadow" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-800">All {roleLabel} <span className="text-gray-400 text-sm font-normal">({filtered.length})</span></h2>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No {roleLabel.toLowerCase()} found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase bg-gray-50">
                <tr>
                  <SortableTh label={roleLabelSingular} sortKey="name" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3 text-left">Contact</th>
                  <th className="px-5 py-3 text-left">ID Status</th>
                  {showBookings && <SortableTh label="Bookings" sortKey="bookings" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  <SortableTh label="Account" sortKey="account" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Joined" sortKey="joined" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(u => {
                  const fn = u.details?.firstName || "";
                  const ln = u.details?.lastName  || "";
                  const fullName = `${fn} ${ln}`.trim() || u.username || u.email || "—";
                  const initials = ((fn[0] || u.email?.[0] || "?") + (ln[0] || "")).toUpperCase();
                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 flex items-center gap-1">
                              {fullName}
                              {u.isFlagged && (
                                <Icons.Flag className="w-3.5 h-3.5 text-red-500 fill-red-500 stroke-red-500" />
                              )}
                            </p>
                            <p className="text-xs text-gray-400">@{u.username || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-gray-700">{u.phone || "—"}</p>
                        <p className="text-xs text-gray-400">{u.email || "—"}</p>
                      </td>
                      <td className="px-5 py-3">
                        {u.isVerified
                          ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 border border-green-200 text-green-700 font-medium">
                              <Icons.Check className="w-3 h-3" /> Verified
                            </span>
                          : <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 inline-block" />Pending
                            </span>
                        }
                      </td>
                      {showBookings && <td className="px-5 py-3 font-semibold text-gray-700">{u.bookingCount}</td>}
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium capitalize text-black ${
                          u.status?.toLowerCase() === "active"   ? "bg-blue-50 border border-blue-200" :
                          u.status?.toLowerCase() === "locked"   ? "bg-red-50 border border-red-200" :
                          "bg-gray-50 border border-gray-200"
                        }`}>{u.status || "—"}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(u.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end">
                          {canDelete && (
                            <button onClick={() => setConfirmDelete(u)}
                              className="p-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50">
                              <Icons.Trash className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => setEditUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                            <Icons.Edit className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button onClick={() => setDetailUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700">
                            Details
                            <Icons.ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>

      {detailUser    && <ViewDetailsModal user={detailUser} roleLabelSingular={roleLabelSingular} onClose={() => setDetailUser(null)} onEdit={() => { setDetailUser(null); setEditUser(detailUser); }} />}
      {editUser      && <EditUserModal   user={editUser}   roleLabelSingular={roleLabelSingular}   onClose={() => setEditUser(null)}   onSaved={() => { setEditUser(null); onRefresh(); }}
        viewerRole={viewerRole} currentRoleName={currentRoleName} />}
      {confirmDelete && <ConfirmDeleteModal name={confirmDelete.details?.firstName || confirmDelete.username || "this user"} roleLabelSingular={roleLabelSingular} onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
    </>
  );
}

// ─── VIEW DETAILS MODAL (Information / Documents sub-tabs) ────────────────────
function ViewDetailsModal({ user, roleLabelSingular, onClose, onEdit }) {
  const [tab, setTab] = useState("information"); // "information" | "documents"
  const det  = user.details  || {};
  const addr = user.address  || {};
  const docu = user.document || {};
  const fullName = `${det.firstName || ""} ${det.middleName ? det.middleName + " " : ""}${det.lastName || ""}${det.suffix ? " " + det.suffix : ""}`.trim() || user.username || "—";
  const imgs = getDocImages(docu);
  const hasImgs = Object.values(imgs).some(v => v && v.trim() !== "");

  const Field = ({ label, value }) => (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800 mt-0.5 break-words">{value || "—"}</p>
    </div>
  );
  const Section = ({ title, children }) => (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-xl text-gray-800 flex items-center gap-2">
              {fullName}
              {user.isFlagged && <Icons.Flag className="w-4 h-4 text-red-500 fill-red-500 stroke-red-500" />}
            </h2>
            <p className="text-sm text-gray-400">{roleLabelSingular} · @{user.username || "—"} · {user.email}</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700">
              <Icons.Edit className="w-4 h-4" />
              Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <Icons.Close className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Information / Documents sub-tabs */}
        <div className="flex gap-2 px-5 pt-4">
          <button onClick={() => setTab("information")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === "information" ? "bg-teal-600 text-white shadow" : "bg-gray-50 border text-gray-600 hover:bg-gray-100"}`}>
            <Icons.Users className="w-4 h-4" /> Information
          </button>
          <button onClick={() => setTab("documents")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === "documents" ? "bg-teal-600 text-white shadow" : "bg-gray-50 border text-gray-600 hover:bg-gray-100"}`}>
            <Icons.Document className="w-4 h-4" /> Documents
          </button>
        </div>

        <div className="p-5 space-y-6">
          {tab === "information" ? (
            <>
              <Section title="Account">
                <Field label="Email"     value={user.email} />
                <Field label="Phone"     value={user.phone} />
                <Field label="Username"  value={user.username} />
                <Field label="Status"    value={user.status} />
                <Field label="ID Status" value={user.isVerified ? "✓ Verified" : "Pending"} />
                <Field label="Flagged"   value={user.isFlagged ? "Yes" : "No"} />
                <Field label="Joined"    value={fmtDate(user.createdAt)} />
              </Section>
              <Section title="Personal Details">
                <Field label="First Name"  value={det.firstName} />
                <Field label="Middle Name" value={det.middleName} />
                <Field label="Last Name"   value={det.lastName} />
                <Field label="Suffix"      value={det.suffix} />
                <Field label="Birth Date"  value={det.birthDate ? fmtDate(det.birthDate) : "—"} />
              </Section>
              <Section title="Address">
                <Field label="Street"       value={addr.street} />
                <Field label="Barangay"     value={addr.barangay} />
                <Field label="Municipality" value={addr.municipality} />
                <Field label="City"         value={addr.city} />
                <Field label="Province"     value={addr.province} />
                <Field label="Postal Code"  value={addr.postalCode} />
                <Field label="Village"      value={addr.village} />
                <Field label="Zip Code"     value={addr.zipCode} />
              </Section>
            </>
          ) : (
            <>
              <Section title="Document Info">
                <Field label="Document Type"   value={docu.documentType} />
                <Field label="Document Number" value={docu.documentNumber} />
                <Field label="ID Status"       value={user.isVerified ? "✓ Verified" : "Pending"} />
              </Section>
              {hasImgs ? (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Uploaded Documents</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DocImg label="Driver License"  url={imgs.driverLicense} />
                    <DocImg label="Government ID"   url={imgs.governmentId} />
                    <DocImg label="Document Image"  url={imgs.documentImage} />
                    <DocImg label="Selfie with ID"  url={imgs.selfieWithId} />
                  </div>
                  {imgs.driverLicense && (
                    <div className="mt-3">
                      <ExpiryField userID={user.id} docId={docu.docId} currentValue={docu.driverLicenseExpiry} />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No documents uploaded yet</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DocImg({ label, url }) {
  if (!url || (typeof url === "string" && url.trim() === "")) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <img src={url} alt={label} className="w-full h-36 object-cover rounded-xl border"
        onError={e => { e.target.style.display="none"; e.target.nextSibling && (e.target.nextSibling.style.display="flex"); }}
      />
      <div style={{display:"none"}} className="w-full h-36 border rounded-xl items-center justify-center text-xs text-gray-400 bg-gray-50">
        Could not load image
      </div>
    </div>
  );
}

// ─── DOCUMENTS TAB (customer ID verification queue) ───────────────────────────
function DocumentsTab({ users, onRefresh, roleLabel = "Customers" }) {
  const [detailUser, setDetailUser] = useState(null);
  const [loadingId, setLoadingId]   = useState(null);
  const [sortKey, setSortKey]       = useState(null); // null = default/unsorted (API order)
  const [sortDir, setSortDir]       = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const fullNameOf = (u) => {
    const fn = u.details?.firstName || "";
    const ln = u.details?.lastName  || "";
    return `${fn} ${ln}`.trim() || u.username || u.email || "—";
  };

  const sorted = [...users].sort((a, b) => {
    if (!sortKey) return 0;
    if (sortKey === "name") return sortDir === "asc"
      ? fullNameOf(a).localeCompare(fullNameOf(b))
      : fullNameOf(b).localeCompare(fullNameOf(a));
    if (sortKey === "submitted") {
      const av = toMillis(a.document?.createdAt);
      const bv = toMillis(b.document?.createdAt);
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return 0;
  });

  const handleVerify = async (user, approve) => {
    setLoadingId(user.id);
    try {
      await updateDoc(doc(db, "user", user.id), { isVerified: approve });
      onRefresh();
    } catch (e) { console.error("Verify error:", e); }
    finally { setLoadingId(null); }
  };

  const hasUploads = (u) => {
    const imgs = getDocImages(u.document || {});
    return Object.values(imgs).some(v => v && v.trim() !== "");
  };

  const { page, setPage, totalPages, pageItems, start, count } = usePagination(sorted);
  useEffect(() => { setPage(1); }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-800">Pending ID Verifications <span className="text-gray-400 text-sm font-normal">({users.length})</span></h2>
          <p className="text-xs text-gray-400 mt-0.5">{roleLabel} awaiting ID approval</p>
        </div>
        {users.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <Icons.CheckCircle className="w-7 h-7 text-green-500" />
              </div>
            </div>
            <p>No pending verifications</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase bg-gray-50">
                <tr>
                  <SortableTh label={roleLabel.replace(/s$/, "")} sortKey="name" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3 text-left">Document Type</th>
                  <th className="px-5 py-3 text-left">Document No.</th>
                  <th className="px-5 py-3 text-left">ID Status</th>
                  <th className="px-5 py-3 text-left">Flagged</th>
                  <SortableTh label="Submitted" sortKey="submitted" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(u => {
                  const fn = u.details?.firstName || "";
                  const ln = u.details?.lastName  || "";
                  const fullName = `${fn} ${ln}`.trim() || u.username || u.email || "—";
                  const initials = ((fn[0] || u.email?.[0] || "?") + (ln[0] || "")).toUpperCase();
                  const uploaded = hasUploads(u);
                  const isLoading = loadingId === u.id;

                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{initials}</div>
                          <div>
                            <p className="font-semibold text-gray-800">{fullName}</p>
                            <p className="text-xs text-gray-400">@{u.username || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{u.document?.documentType || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{u.document?.documentNumber || "—"}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 inline-block" />Pending
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {u.isFlagged
                          ? <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-red-50 border border-red-200 text-black font-medium">
                              <Icons.Flag className="w-3 h-3 text-red-500 fill-red-500 stroke-red-500" />
                              Flagged
                            </span>
                          : <span className="text-gray-400 text-xs">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(u.document?.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setDetailUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                            View IDs
                            <Icons.ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleVerify(u, false)} disabled={isLoading || !uploaded}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Icons.X className="w-3.5 h-3.5" />
                            {isLoading ? "..." : "Reject"}
                          </button>
                          <button onClick={() => handleVerify(u, true)} disabled={isLoading || !uploaded}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Icons.Check className="w-3.5 h-3.5" />
                            {isLoading ? "..." : "Approve"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>

      {detailUser && (
        <DocDetailModal
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onApprove={() => { handleVerify(detailUser, true);  setDetailUser(null); }}
          onReject={()  => { handleVerify(detailUser, false); setDetailUser(null); }}
        />
      )}
    </>
  );
}

// ─── EDIT REQUEST TAB ───────────────────────────────────────────────────────
// Two request types, two sections, both driven straight off Firestore
// (same pattern the rest of this file already uses — no backend route
// needed, matches how Profile.jsx writes editRequests directly):
//   1. "editRequests"      — profile field changes (Profile.jsx's EditProfileModal)
//   2. "idResubmitRequests" — new driver's license photo submissions
//      (Profile.jsx's "resubmit" flow, triggered from the expiry warning)
function EditRequestsTab({ onCountChange }) {
  const [profileReqs, setProfileReqs] = useState([]);
  const [idReqs, setIdReqs]           = useState([]);
  const [userLookup, setUserLookup]   = useState({}); // uid -> { name, username, email }
  const [loading, setLoading]         = useState(true);
  const [busyId, setBusyId]           = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // { kind, id }
  const [viewUserID, setViewUserID]     = useState(null); // userID whose full request history is open

  // Deep-link from Dashboard: /users?...&open=<uid> lands here once this
  // tab is mounted (top-level Users() already switched role tab + subTab).
  // Auto-opens that person's request history once data has actually
  // loaded — before that, profileReqs is empty and there'd be nothing to
  // match against yet.
  const [highlightUserID, setHighlightUserID] = useState(null); // ID-resubmit row highlighted via deep link
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || loading) return;

    const hasProfileReq = profileReqs.some(r => r.userID === openID);
    if (hasProfileReq) {
      setViewUserID(openID);
    } else {
      // Deep-linked user only has an ID resubmit request (no profile edit
      // request) — that section isn't grouped/modal-based like this one,
      // so scroll to it and briefly highlight instead of opening an empty modal.
      setHighlightUserID(openID);
      setTimeout(() => {
        document.getElementById(`idreq-user-${openID}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      setTimeout(() => setHighlightUserID(null), 3000);
    }
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [searchParams, loading, profileReqs, setSearchParams]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [editSnap, idSnap, userSnap, detailsSnap] = await Promise.all([
        getDocs(query(collection(db, "editRequests"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "idResubmitRequests"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "user")),
        getDocs(collection(db, "userDetails")),
      ]);

      const detailsMap = Object.fromEntries(detailsSnap.docs.map(d => [d.data().userID || d.id, d.data()]));
      const lookup = {};
      userSnap.docs.forEach(d => {
        const u = d.data();
        const det = detailsMap[d.id] || {};
        const name = `${det.firstName || ""} ${det.lastName || ""}`.trim();
        lookup[d.id] = { name: name || u.username || u.email || d.id, username: u.username || "", email: u.email || "" };
      });
      setUserLookup(lookup);
      setProfileReqs(editSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIdReqs(idSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Edit/ID request fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Applies each changed field to the collection/doc it actually lives in —
  // mirrors exactly what Profile.jsx's own "canEditDirectly" branch does,
  // just running as the reviewing admin instead of the user themself.
  const applyProfileChanges = async (req) => {
    const byCollection = { user: {}, userDetails: {}, userAddress: {} };
    req.changes.forEach(c => { byCollection[c.collection][c.field] = c.newValue; });

    if (Object.keys(byCollection.user).length) {
      await updateDoc(doc(db, "user", req.userID), { ...byCollection.user, updatedAt: serverTimestamp() });
    }
    for (const col of ["userDetails", "userAddress"]) {
      if (!Object.keys(byCollection[col]).length) continue;
      const existing = await getDocs(query(collection(db, col), where("userID", "==", req.userID)));
      if (!existing.empty) {
        await updateDoc(doc(db, col, existing.docs[0].id), { ...byCollection[col], updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, col), { userID: req.userID, ...byCollection[col], createdAt: serverTimestamp() });
      }
    }
  };

  const handleApproveProfile = async (req) => {
    setBusyId(req.id);
    try {
      await applyProfileChanges(req);
      await updateDoc(doc(db, "editRequests", req.id), {
        status: "approved", reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      fetchAll();
      onCountChange?.();
    } catch (e) { console.error("Approve profile request failed:", e); }
    finally { setBusyId(null); }
  };

  // ID resubmit approve: the new photo becomes the license of record.
  // Deliberately does NOT touch driverLicenseExpiry — admin re-confirms the
  // date against the new photo separately (ExpiryField, in the Documents
  // tab / Document Request review), same "human looks at the actual card"
  // principle as the original review.
  const handleApproveId = async (req) => {
    setBusyId(req.id);
    try {
      const existing = await getDocs(query(collection(db, "userDocument"), where("userID", "==", req.userID)));
      if (!existing.empty) {
        await updateDoc(doc(db, "userDocument", existing.docs[0].id), {
          driverLicenseUrl: req.newLicenseUrl, updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "userDocument"), {
          userID: req.userID, driverLicenseUrl: req.newLicenseUrl, createdAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, "idResubmitRequests", req.id), {
        status: "approved", reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      fetchAll();
      onCountChange?.();
    } catch (e) { console.error("Approve ID resubmit failed:", e); }
    finally { setBusyId(null); }
  };

  const handleReject = async (kind, id, note) => {
    setBusyId(id);
    try {
      const col = kind === "profile" ? "editRequests" : "idResubmitRequests";
      await updateDoc(doc(db, col, id), {
        status: "rejected", reviewNote: note || null, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setRejectTarget(null);
      fetchAll();
      onCountChange?.();
    } catch (e) { console.error("Reject failed:", e); }
    finally { setBusyId(null); }
  };

  // Grouped by person, not by document — a supervisor with 3 requests over
  // time (1 pending, 2 resolved) is one row, not three. Newest-activity
  // person first; within a person, their own requests stay newest-first.
  const profileByUser = Object.values(
    profileReqs.reduce((acc, req) => {
      if (!acc[req.userID]) acc[req.userID] = { userID: req.userID, requests: [] };
      acc[req.userID].requests.push(req);
      return acc;
    }, {})
  ).sort((a, b) => {
    const ta = a.requests[0]?.createdAt?.toMillis?.() ?? a.requests[0]?.createdAt?._seconds ?? 0;
    const tb = b.requests[0]?.createdAt?.toMillis?.() ?? b.requests[0]?.createdAt?._seconds ?? 0;
    return tb - ta;
  });

  const pendingProfile = profileReqs.filter(r => r.status === "pending");
  const pendingId = idReqs.filter(r => r.status === "pending");
  const reviewedId = idReqs.filter(r => r.status !== "pending");

  const StatusPill = ({ status }) => {
    const map = {
      pending:   "bg-yellow-50 border-yellow-200 text-yellow-700",
      approved:  "bg-green-50 border-green-200 text-green-700",
      rejected:  "bg-red-50 border-red-200 text-red-600",
      cancelled: "bg-gray-50 border-gray-200 text-gray-500",
    };
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${map[status] || map.cancelled}`}>{status}</span>;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border p-8 space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* PROFILE EDIT REQUESTS */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-800">Profile Edit Requests <span className="text-gray-400 text-sm font-normal">({pendingProfile.length} pending)</span></h2>
          <p className="text-xs text-gray-400 mt-0.5">Field changes submitted from a Driver/Supervisor's own profile page</p>
        </div>
        {profileByUser.length === 0 ? (
          <div className="text-center text-gray-400 py-10">No profile edit requests yet.</div>
        ) : (
          <div className="divide-y">
            {profileByUser.map(({ userID, requests }) => {
              const u = userLookup[userID] || {};
              const pendingCount = requests.filter(r => r.status === "pending").length;
              const latest = requests[0]; // already newest-first from the query sort
              return (
                <div key={userID} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{u.name || userID}</p>
                    <p className="text-xs text-gray-400">
                      @{u.username || "—"} · {requests.length} request{requests.length === 1 ? "" : "s"} · last {fmtDate(latest.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {pendingCount > 0 ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-yellow-50 border-yellow-200 text-yellow-700">
                        {pendingCount} pending
                      </span>
                    ) : (
                      <StatusPill status={latest.status} />
                    )}
                    <button onClick={() => setViewUserID(userID)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                      View
                      <Icons.ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ID RESUBMIT REQUESTS */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-800">ID Resubmit Requests <span className="text-gray-400 text-sm font-normal">({pendingId.length} pending)</span></h2>
          <p className="text-xs text-gray-400 mt-0.5">New driver's license photos submitted for a close-to-expiring or expired ID</p>
        </div>
        {idReqs.length === 0 ? (
          <div className="text-center text-gray-400 py-10">No ID resubmit requests yet.</div>
        ) : (
          <div className="divide-y">
            {[...pendingId, ...reviewedId].map(req => {
              const u = userLookup[req.userID] || {};
              const isHighlighted = highlightUserID === req.userID;
              return (
                <div key={req.id} id={`idreq-user-${req.userID}`}
                  className={`p-4 flex flex-col gap-3 transition-all ${isHighlighted ? "ring-2 ring-inset ring-orange-400 bg-orange-50/40" : ""}`}>                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-800">{u.name || req.userID}</p>
                      <p className="text-xs text-gray-400">@{u.username || "—"} · {fmtDate(req.createdAt)}</p>
                    </div>
                    <StatusPill status={req.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <DocImg label="Current License" url={req.currentLicenseUrl} />
                    <DocImg label="New License"     url={req.newLicenseUrl} />
                  </div>
                  {req.status === "rejected" && req.reviewNote && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">Reason: {req.reviewNote}</p>
                  )}
                  {req.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setRejectTarget({ kind: "id", id: req.id })} disabled={busyId === req.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:opacity-40">
                        <Icons.X className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button onClick={() => handleApproveId(req)} disabled={busyId === req.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700 disabled:opacity-40">
                        <Icons.Check className="w-3.5 h-3.5" /> {busyId === req.id ? "..." : "Approve"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejectTarget && (
        <RejectNoteModal
          onCancel={() => setRejectTarget(null)}
          onConfirm={(note) => handleReject(rejectTarget.kind, rejectTarget.id, note)}
        />
      )}

      {viewUserID && (
        <ProfileRequestHistoryModal
          userID={viewUserID}
          user={userLookup[viewUserID]}
          requests={profileByUser.find(g => g.userID === viewUserID)?.requests || []}
          busyId={busyId}
          onClose={() => setViewUserID(null)}
          onApprove={(req) => handleApproveProfile(req)}
          onReject={(req) => { setRejectTarget({ kind: "profile", id: req.id }); setViewUserID(null); }}
        />
      )}
    </div>
  );
}

function ProfileRequestHistoryModal({ userID, user, requests, busyId, onClose, onApprove, onReject }) {
  const StatusPill = ({ status }) => {
    const map = {
      pending:   "bg-yellow-50 border-yellow-200 text-yellow-700",
      approved:  "bg-green-50 border-green-200 text-green-700",
      rejected:  "bg-red-50 border-red-200 text-red-600",
      cancelled: "bg-gray-50 border-gray-200 text-gray-500",
    };
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${map[status] || map.cancelled}`}>{status}</span>;
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-lg text-gray-800">{user?.name || userID}</h2>
            <p className="text-xs text-gray-400">@{user?.username || "—"} · {requests.length} request{requests.length === 1 ? "" : "s"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><Icons.X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {requests.map(req => (
            <div key={req.id} className="border rounded-xl overflow-hidden">
              <div className="flex justify-between items-center px-4 py-2.5 bg-gray-50 border-b">
                <span className="text-xs text-gray-400">{fmtDate(req.createdAt)}</span>
                <StatusPill status={req.status} />
              </div>

              <div>
                <div className="grid grid-cols-[1fr_1fr_1fr] text-xs font-semibold text-gray-400 uppercase bg-gray-50/50 px-4 py-2">
                  <span>Field</span>
                  <span>Current</span>
                  <span>Requested</span>
                </div>
                {(req.changes || []).map((c, i) => {
                  const changed = c.newValue !== c.oldValue;
                  return (
                    <div key={i} className={`grid grid-cols-[1fr_1fr_1fr] px-4 py-2.5 border-t text-sm items-center ${changed ? "bg-orange-50" : ""}`}>
                      <span className="text-gray-500">{c.label}</span>
                      <span className="text-gray-600">{c.oldValue || "—"}</span>
                      <span className={changed ? "font-medium text-orange-600" : "text-gray-600"}>{c.newValue || "—"}</span>
                    </div>
                  );
                })}
              </div>

              {req.status === "rejected" && req.reviewNote && (
                <p className="text-xs text-red-500 bg-red-50 p-2 border-t">Reason: {req.reviewNote}</p>
              )}

              {req.status === "pending" && (
                <div className="flex justify-end gap-2 p-3 border-t bg-gray-50/50">
                  <button onClick={() => onReject(req)} disabled={busyId === req.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:opacity-40">
                    <Icons.X className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button onClick={() => onApprove(req)} disabled={busyId === req.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700 disabled:opacity-40">
                    <Icons.Check className="w-3.5 h-3.5" /> {busyId === req.id ? "..." : "Approve"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RejectNoteModal({ onCancel, onConfirm }) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-800">Reject request</h3>
        <p className="text-xs text-gray-400">Optional — this note is shown to the requester so a rejection isn't a dead end.</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          placeholder="e.g. Photo is blurry, please retake"
          className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300" />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm(note.trim())} className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">Reject</button>
        </div>
      </div>
    </div>
  );
}


function DocDetailModal({ user, onClose, onApprove, onReject }) {
  const det  = user.details  || {};
  const docu = user.document || {};
  const fullName = `${det.firstName || ""} ${det.lastName || ""}`.trim() || user.username || "—";
  const imgs = getDocImages(docu);
  const hasUploads = Object.values(imgs).some(v => v && v.trim() !== "");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-lg text-gray-800">{fullName}</h2>
            <p className="text-sm text-gray-400">@{user.username || "—"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[["Document Type", docu.documentType], ["Document No.", docu.documentNumber], ["ID Status", "Pending"]].map(([label, val]) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-medium text-gray-800 mt-0.5">{val || "—"}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Uploaded IDs</h3>
            {!hasUploads ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No documents uploaded yet</p>
            ) : (
              <div className="space-y-3">
                <DocImg label="Driver License"  url={imgs.driverLicense} />
                <DocImg label="Government ID"   url={imgs.governmentId} />
                <DocImg label="Document Image"  url={imgs.documentImage} />
                <DocImg label="Selfie with ID"  url={imgs.selfieWithId} />
                {imgs.driverLicense && (
                  <ExpiryField userID={user.id} docId={docu.docId} currentValue={docu.driverLicenseExpiry} />
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Close</button>
            {hasUploads && (
              <>
                <button onClick={onReject}  className="flex items-center gap-2 px-5 py-2 border border-red-200 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50">
                  <Icons.X className="w-4 h-4" /> Reject
                </button>
                <button onClick={onApprove} className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700">
                  <Icons.Check className="w-4 h-4" /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT USER MODAL ──────────────────────────────────────────────────────────
// Role change is a separate, higher-stakes action, so it's kept out of
// `form` (which maps 1:1 onto a plain updateDoc) and only offered to Owner
// and Admin — both here (hides the field otherwise) and on the backend
// (PATCH /api/users/:uid/role is gated to Owner+Admin, see user.routes.js).
// Owner is intentionally excluded from the options: promoting someone to
// Owner isn't something this modal should be able to do, and — separately
// — an Owner account can never be the *target* of this modal in the first
// place, since it has no tab in ROLE_TABS/ROLE_LIST_VIEWABLE_BY. The
// backend also enforces that on the target side (see updateUserRole).
const ASSIGNABLE_ROLES = [
  { value: "Customer",        label: "Customer" },
  { value: ROLES.DRIVER,      label: "Driver" },
  { value: ROLES.SUPERVISOR,  label: "Supervisor" },
  { value: ROLES.ADMIN,       label: "Admin" },
];

function EditUserModal({ user, roleLabelSingular, onClose, onSaved, viewerRole, currentRoleName }) {
  const [form, setForm] = useState({
    status:    user.status    || "active",
    isFlagged: user.isFlagged || false,
  });
  const canEditRole = viewerRole === ROLES.OWNER || viewerRole === ROLES.ADMIN;
  // Starts empty (not currentRoleName) — the dropdown shows a disabled
  // "Currently: X" placeholder plus only the OTHER roles as real choices,
  // so re-picking the role someone is already in isn't an option at all,
  // rather than being an option that happens to be a no-op on save.
  const [role, setRole] = useState("");
  const assignableRoleOptions = ASSIGNABLE_ROLES.filter(r => r.value !== currentRoleName);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await updateDoc(doc(db, "user", user.id), { ...form, updatedAt: serverTimestamp() });

      // role can only ever be "" (placeholder, untouched) or one of the
      // OTHER roles now — currentRoleName was filtered out of the options
      // entirely, so there's no "picked the same role" case to guard against.
      if (canEditRole && role) {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/users/${user.id}/role`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ role }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Role update failed.");
        }
      }

      onSaved();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="font-bold text-lg text-gray-800">Edit {roleLabelSingular}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Read-only info */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
            <p className="text-xs text-gray-400 font-medium mb-2">Account Info (read-only)</p>
            <p className="text-gray-600"><span className="font-medium">Email:</span> {user.email || "—"}</p>
            <p className="text-gray-600"><span className="font-medium">Phone:</span> {user.phone || "—"}</p>
            <p className="text-gray-600"><span className="font-medium">Username:</span> {user.username || "—"}</p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked</option>
            </select>
          </div>

          {/* Role — Owner and Admin only */}
          {canEditRole && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400">
                <option value="" disabled>Currently: {roleLabelSingular}</option>
                {assignableRoleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {role && (
                <p className="text-xs text-amber-600 mt-1">
                  This will move {user.details?.firstName || user.username || "this user"} out of the {roleLabelSingular} list into {role}.
                </p>
              )}
            </div>
          )}

          {/* Flagged toggle */}
          <div className="flex items-center justify-between p-3 border rounded-xl">
            <div className="flex items-center gap-2">
              <Icons.Flag className={`w-4 h-4 ${form.isFlagged ? "text-red-500 fill-red-500 stroke-red-500" : "text-gray-400"}`} />
              <div>
                <p className="text-sm font-medium text-gray-700">Flag this {roleLabelSingular.toLowerCase()}</p>
                <p className="text-xs text-gray-400">Mark as suspicious or problematic</p>
              </div>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, isFlagged: !f.isFlagged }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.isFlagged ? "bg-red-500" : "bg-gray-200"}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.isFlagged ? "left-6" : "left-0.5"}`} />
            </button>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIRM DELETE ───────────────────────────────────────────────────────────
function ConfirmDeleteModal({ name, roleLabelSingular, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <Icons.Trash className="w-7 h-7 text-red-500" />
            </div>
          </div>
          <h3 className="font-bold text-gray-800 text-lg">Delete {roleLabelSingular}?</h3>
          <p className="text-sm text-gray-500 mt-1">
            Delete <strong>{name}</strong>? Their data will be moved to the archive and cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}  className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">Delete & Archive</button>
        </div>
      </div>
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ title, value, Icon, color, selected, onClick }) {
  const colors = {
    teal:  "bg-teal-50 text-teal-600",
    green: "bg-green-50 text-green-600",
    gray:  "bg-gray-100 text-gray-500",
    blue:  "bg-blue-50 text-blue-600",
    red:   "bg-red-50 text-red-500",
  };
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3 transition-all ${
        clickable ? "cursor-pointer hover:shadow-md hover:border-teal-200" : ""
      } ${selected ? "border-teal-500 ring-2 ring-teal-100" : ""}`}
    >
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${colors[color] || colors.gray}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500">{title}</div>
      </div>
    </div>
  );
}