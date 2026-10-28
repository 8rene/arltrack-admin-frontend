import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  collection, getDocs, query, where, orderBy
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../fireabase";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/pagePermissions";
import UserActivityTab from "../components/UserActivityTab";

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
  Lock: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
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
  Eye: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
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
  Activity: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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

// Time-of-day only (e.g. "3:45 PM") — shown under the date in the Joined column.
function fmtTime(val) {
  const ms = toMillis(val);
  if (!isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

// "YYYY-MM-DD" (local day) of any date value the table shows, or null — what
// the date picker in "Search by" is compared against.
function dayKey(val) {
  const ms = toMillis(val);
  if (!isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "Search by" options — mirror the table's columns. Account status / ID Status
// are NOT here: they have their own dropdown. User ID and Referral Code have no
// column but stay searchable (they were covered by the old single search box).
// The "name" label is swapped for the role's singular label (Customer, Driver…).
const SEARCH_BY = [
  { key: "joined",   label: "Joined",      type: "date" },
  { key: "name",     label: null,          type: "text" },
  { key: "email",    label: "Email",       type: "text" },
  { key: "phone",    label: "Contact No.", type: "text" },
  { key: "userID",   label: "User ID",     type: "text" },
  { key: "referral", label: "Referral Code", type: "text" },
];

// Status dropdown options — same values the stat cards above the table set.
const STATUS_OPTIONS = [
  { key: "All",      label: "All statuses" },
  { key: "active",   label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "locked",   label: "Locked" },
  { key: "verified", label: "ID Verified", needsVerification: true },
  { key: "flagged",  label: "Flagged",     needsVerification: true },
];

// ─── SORT HEADER ────────────────────────────────────────────────────────────
// Clickable <th> that toggles asc/desc on the given sortKey. Shows a neutral
// up/down chevrons icon when the column isn't the active sort (so it reads
// as "sortable" even before you've clicked it), and a bold single arrow in
// the active color once it is.
// ─── REFERRAL / NEW-SIGNUP HELPERS ────────────────────────────────────────────
// `user.referral` is added by the admin backend (attachReferralInfo in
// user.controller.js): { code, referredBy, invited[], invitedCount }.

// A brand-new signup = locked account whose ID hasn't been verified yet.
const isNewSignup = (u) =>
  String(u?.status || "").toLowerCase() === "locked" && u?.isVerified !== true;

// Profile photo with an initials fallback — used when the account has no
// photo, or the image can't be loaded (e.g. removed from Storage). Pass a
// `key` that changes with `src` so a failed load is retried on a new photo.
function UserAvatar({ src, initials, className = "w-9 h-9 text-sm", onClick }) {
  const [failed, setFailed] = useState(false);
  const base = `${className} rounded-xl flex-shrink-0`;
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        onClick={onClick}
        className={`${base} object-cover bg-gray-100 ${onClick ? "cursor-zoom-in" : ""}`}
      />
    );
  }
  return (
    <div className={`${base} bg-teal-600 text-white flex items-center justify-center font-bold`}>
      {initials}
    </div>
  );
}

// "Juan Dela Cruz (@juan)" / "@juan" / "ARL-XXXX (account removed)" / null
function referrerLabel(by) {
  if (!by) return null;
  if (by.removed) return `${by.code || "—"} (account removed)`;
  if (by.name && by.username) return `${by.name} (@${by.username})`;
  if (by.name)     return by.name;
  if (by.username) return `@${by.username}`;
  if (by.code)     return `${by.code} (no matching account)`;
  return null;
}

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
function ExpiryField({ userID, docId, currentValue, onSaved, canEdit = true }) {
  const [value, setValue] = useState(toDateInputValue(currentValue));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isExpired = value && value < today;

  const handleSave = async () => {
    if (!value) return;
    setSaving(true);
    try {
      // PUT /api/users/:uid/document upserts — same one-doc-per-user
      // shape as before, but the docId/no-docId branching is no longer
      // needed client-side since the backend looks that up itself.
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/users/${userID}/document`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ driverLicenseExpiry: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Save failed.");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved?.();
    } catch (e) {
      console.error("Expiry save error:", e);
    } finally {
      setSaving(false);
    }
  };

  // Changing the date is an Owner/Admin job (the backend enforces it); everyone else just sees it.
  if (!canEdit) {
    return (
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-xs text-gray-400 mb-1">Driver's License Expiry</p>
        <p className={`text-sm font-medium ${isExpired ? "text-red-600" : "text-gray-800"}`}>{value || "—"}</p>
        {isExpired && <p className="text-xs text-red-500 mt-1">This date is already in the past.</p>}
      </div>
    );
  }

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

  const [subTab, setSubTab]   = useState("directory"); // "directory" (List) | "documents" (Document Request: new IDs + resubmits) | "editRequests" (Edit Request: profile changes) — customers only

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
      const completedCount = {};
      bookingsSnap.docs.forEach(d => {
        const { userID: uid, status } = d.data();
        if (!uid) return;
        bookingCount[uid] = (bookingCount[uid] || 0) + 1;
        if (String(status || "").toLowerCase() === "completed") completedCount[uid] = (completedCount[uid] || 0) + 1;
      });

      const merged = baseUsers.map(u => ({
        ...u,
        details:      detailsMap[u.id] || {},
        address:      addressMap[u.id] || {},
        document:     docMap[u.id]     || {},
        bookingCount: bookingCount[u.id] || 0,
        completedBookingCount: completedCount[u.id] || 0,
      }));

      setUsers(merged);
    } catch (e) {
      console.error("Users fetch error:", e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [activeRole]);

  const [pendingEditReqUIDs, setPendingEditReqUIDs] = useState([]); // userIDs with a pending profile edit request
  const [pendingIdReqUIDs, setPendingIdReqUIDs]       = useState([]); // userIDs with a pending license/document resubmit (shown under Document Request)
  // The people in the role tab that is open right now. Requests are only shown / counted for these,
  // so a customer's request never appears under Drivers (and vice versa).
  const roleUserIDs = useMemo(() => new Set(users.map(u => u.id)), [users]);
  const pendingEditReqCount = pendingEditReqUIDs.filter(id => roleUserIDs.has(id)).length;
  const pendingIdReqCount   = pendingIdReqUIDs.filter(id => roleUserIDs.has(id)).length;
  const fetchEditReqCounts = useCallback(async () => {
    try {
      const [editSnap, idSnap] = await Promise.all([
        getDocs(query(collection(db, "editRequests"), where("status", "==", "pending"))),
        getDocs(query(collection(db, "idResubmitRequests"), where("status", "==", "pending"))),
      ]);
      setPendingEditReqUIDs(editSnap.docs.map(d => d.data().userID));
      setPendingIdReqUIDs(idSnap.docs.map(d => d.data().userID));
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
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 transition-colors">
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
      <div className={`grid gap-4 ${showVerification ? "grid-cols-3 xl:grid-cols-6" : "grid-cols-2 md:grid-cols-4"}`}>
        <StatCard title="Total"    value={users.length} Icon={Icons.Users}       color="teal"
          selected={directoryFilter === "All"}      onClick={() => { setDirectoryFilter("All");      setSubTab("directory"); }} />
        <StatCard title="Active"   value={users.filter(u => u.status?.toLowerCase() === "active").length}   Icon={Icons.CheckCircle} color="green"
          selected={directoryFilter === "active"}   onClick={() => { setDirectoryFilter("active");   setSubTab("directory"); }} />
        <StatCard title="Inactive" value={users.filter(u => u.status?.toLowerCase() === "inactive").length} Icon={Icons.Moon}        color="gray"
          selected={directoryFilter === "inactive"} onClick={() => { setDirectoryFilter("inactive"); setSubTab("directory"); }} />
        <StatCard title="Locked"   value={users.filter(u => u.status?.toLowerCase() === "locked").length}   Icon={Icons.Lock}        color="amber"
          selected={directoryFilter === "locked"}   onClick={() => { setDirectoryFilter("locked");   setSubTab("directory"); }} />
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
              <span className="ml-1 opacity-70 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">{pendingDocs.length + pendingIdReqCount}</span>
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
        <DirectoryTab users={users} onRefresh={fetchUsers} roleLabel={activeRole.label} roleLabelSingular={activeRole.labelSingular} canDelete={canDelete} showBookings={activeRole.key === "customer"} showVerification={showVerification}
          filterStatus={directoryFilter} setFilterStatus={setDirectoryFilter} viewerRole={viewerRole} currentRoleName={activeRole.apiRole} />
      ) : subTab === "documents" ? (
        <DocumentsTab users={pendingDocs} roleUserIDs={roleUserIDs} onRefresh={fetchUsers} roleLabel={activeRole.label} onCountChange={fetchEditReqCounts} />
      ) : (
        <EditRequestsTab roleUserIDs={roleUserIDs} onCountChange={fetchEditReqCounts} />
      )}
    </div>
  );
}

// ─── DIRECTORY TAB (used for Customers, Drivers, Supervisors, Admins) ─────────
function DirectoryTab({ users, onRefresh, roleLabel, roleLabelSingular, canDelete, showBookings, showVerification, filterStatus, setFilterStatus, viewerRole, currentRoleName }) {
  const [search, setSearch]       = useState("");
  const [searchBy, setSearchBy]   = useState("name");
  const [dateValue, setDateValue] = useState(""); // "YYYY-MM-DD" from the date picker
  const [detailUser, setDetailUser]       = useState(null);
  const [editUser, setEditUser]           = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // keep the open details window in step with a refreshed list, so a save shows up straight away
  useEffect(() => {
    setDetailUser((cur) => (cur ? users.find((u) => u.id === cur.id) || cur : cur));
  }, [users]);
  const [deleteError, setDeleteError]     = useState(null);
  const [searchParams, setSearchParams]   = useSearchParams();
  const [sortKey, setSortKey]       = useState("joined"); // newest registrations on top by default
  const [sortDir, setSortDir]       = useState("desc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "joined" ? "desc" : "asc");
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
    setDeleteError(null);
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
    } catch (e) {
      console.error("Delete/archive error:", e);
      setDeleteError(e.message || "Delete failed. Please try again.");
    }
  };

  const searchType = SEARCH_BY.find(o => o.key === searchBy)?.type || "text";
  const searchLabel = searchBy === "name" ? roleLabelSingular : (SEARCH_BY.find(o => o.key === searchBy)?.label || "");
  const hasFilters = !!search.trim() || !!dateValue || filterStatus !== "All";
  const clearFilters = () => { setSearch(""); setDateValue(""); setFilterStatus("All"); };

  const filtered = users.filter(u => {
    let matchSearch = true;
    if (searchType === "date") {
      if (dateValue) matchSearch = dayKey(u.createdAt) === dateValue;
    } else {
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = {
          // "name" covers the full name and the @username shown under it
          name:     `${u.details?.firstName || ""} ${u.details?.lastName || ""} ${u.username || ""}`,
          email:    u.email,
          phone:    u.phone,
          userID:   u.id,
          referral: u.referral?.code,
        }[searchBy];
        matchSearch = String(hay || "").toLowerCase().includes(q);
      }
    }
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
    if (sortKey === "invited") {
      const av = a.referral?.invitedCount || 0;
      const bv = b.referral?.invitedCount || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    }
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
  useEffect(() => { setPage(1); }, [search, searchBy, dateValue, filterStatus, users]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="flex flex-wrap gap-3 items-end p-4 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search by</span>
            <select
              value={searchBy}
              onChange={e => { setSearchBy(e.target.value); setSearch(""); setDateValue(""); }}
              className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white"
            >
              {SEARCH_BY.map(o => <option key={o.key} value={o.key}>{o.key === "name" ? roleLabelSingular : o.label}</option>)}
            </select>
          </div>
          {searchType === "date" ? (
            <input
              type="date"
              value={dateValue}
              onChange={e => setDateValue(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-400"
            />
          ) : (
            <input
              type="text"
              placeholder={`Enter ${searchLabel.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-52 px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-400"
            />
          )}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm text-gray-700 outline-none bg-white"
          >
            {STATUS_OPTIONS.filter(o => !o.needsVerification || showVerification).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 rounded-xl transition-colors">
              Clear
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No {roleLabel.toLowerCase()} found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase bg-gray-50">
                <tr>
                  <SortableTh label="Joined" sortKey="joined" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label={roleLabelSingular} sortKey="name" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3 text-left">Email</th>
                  <th className="px-5 py-3 text-left">Contact No.</th>
                  <th className="px-5 py-3 text-left">ID Status</th>
                  {showBookings && <SortableTh label="Bookings" sortKey="bookings" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  <SortableTh label="Account" sortKey="account" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
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
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="text-gray-700">{fmtDate(u.createdAt)}</span>
                        {fmtTime(u.createdAt) && (<><span className="mx-1.5 text-gray-300">|</span><span className="text-gray-500">{fmtTime(u.createdAt)}</span></>)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar key={u.profileImage || "none"} src={u.profileImage} initials={initials} />
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
                      <td className="px-5 py-3 text-gray-600 break-all">{u.email || "—"}</td>
                      <td className="px-5 py-3 text-gray-700 whitespace-nowrap">{u.phone || "—"}</td>
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
                            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700">
                            View
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

      {detailUser    && <ViewDetailsModal user={detailUser} users={users} roleLabelSingular={roleLabelSingular} viewerRole={viewerRole} onClose={() => setDetailUser(null)} onEdit={() => { setDetailUser(null); setEditUser(detailUser); }} />}
      {editUser      && <EditUserModal   user={editUser}   roleLabelSingular={roleLabelSingular}   onClose={() => setEditUser(null)}   onSaved={() => { setEditUser(null); onRefresh(); }}
        viewerRole={viewerRole} currentRoleName={currentRoleName} onDocumentsChanged={onRefresh} />}
      {confirmDelete && <ConfirmDeleteModal name={confirmDelete.details?.firstName || confirmDelete.username || "this user"} roleLabelSingular={roleLabelSingular} error={deleteError} onConfirm={() => handleDelete(confirmDelete)} onCancel={() => { setConfirmDelete(null); setDeleteError(null); }} />}
    </>
  );
}

// ─── VIEW DETAILS MODAL (Information / Documents sub-tabs) ────────────────────
function ViewDetailsModal({ user, users, roleLabelSingular, viewerRole, onClose, onEdit }) {
  const [tab, setTab] = useState("information"); // "information" | "documents" | "activity"
  // Activity exists for Customers (recent feed), Drivers (current trips + history), and Supervisors / Admins (their audit-log entries).
  const hasActivity = ["Customer", "Driver", "Supervisor", "Admin"].includes(roleLabelSingular);
  // Drilling into a referrer's or an invited user's own record, without
  // leaving this modal — resolved locally from the already-loaded `users`
  // list (same role tab, which referrals are always within in practice),
  // so this costs no extra request. Recursive: the nested modal is the
  // same component, so a referrer's own referrer can be drilled into too.
  const [nestedUserID, setNestedUserID] = useState(null);
  const [showPhoto, setShowPhoto] = useState(false); // enlarged profile photo
  const nestedUser = nestedUserID ? users?.find((u) => u.id === nestedUserID) : null;
  const det  = user.details  || {};
  const addr = user.address  || {};
  const docu = user.document || {};
  const fullName = `${det.firstName || ""} ${det.middleName ? det.middleName + " " : ""}${det.lastName || ""}${det.suffix ? " " + det.suffix : ""}`.trim() || user.username || "—";
  const imgs = getDocImages(docu);
  const hasImgs = Object.values(imgs).some(v => v && v.trim() !== "");
  const ref = user.referral || {};
  const joined = user.createdAt ? `${fmtDate(user.createdAt)}${fmtTime(user.createdAt) ? " | " + fmtTime(user.createdAt) : ""}` : "—";

  const statusKey = (user.status || "").toLowerCase();
  const statusChip =
    statusKey === "active" ? "bg-blue-50 border-blue-200 text-blue-700" :
    statusKey === "locked" ? "bg-red-50 border-red-200 text-red-700" :
    "bg-gray-50 border-gray-200 text-gray-600";

  // Plain label-over-value cell — the card around it does the separating.
  const Field = ({ label, value, wide }) => (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5 break-words">{value || "—"}</p>
    </div>
  );
  // Each section is its own bordered card with a titled header strip.
  const Section = ({ title, icon: Icon, children, aside }) => (
    <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {Icon && <Icon className="w-4 h-4 text-teal-600" />}
          {title}
        </h3>
        {aside}
      </div>
      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4">{children}</div>
    </section>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className="flex items-center gap-4 p-5 border-b sticky top-0 bg-white z-10">
          <UserAvatar
            key={user.profileImage || "none"}
            src={user.profileImage}
            initials={((det.firstName?.[0] || user.email?.[0] || "?") + (det.lastName?.[0] || "")).toUpperCase()}
            className="w-16 h-16 text-xl"
            onClick={user.profileImage ? () => setShowPhoto(true) : undefined}
          />
          {showPhoto && user.profileImage && (
            <div
              className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
              onClick={(e) => { e.stopPropagation(); setShowPhoto(false); }}
            >
              <img src={user.profileImage} alt={fullName} className="max-w-full max-h-full rounded-2xl object-contain" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-xl text-gray-800 flex items-center gap-2">
              {fullName}
              {user.isFlagged && <Icons.Flag className="w-4 h-4 text-red-500 fill-red-500 stroke-red-500" />}
            </h2>
            <p className="text-sm text-gray-400 truncate">{roleLabelSingular} · @{user.username || "—"}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${statusChip}`}>{user.status || "—"}</span>
              {user.isVerified
                ? <span className="px-2 py-0.5 rounded-full border text-[11px] font-medium bg-green-50 border-green-200 text-green-700">ID Verified</span>
                : <span className="px-2 py-0.5 rounded-full border text-[11px] font-medium bg-yellow-50 border-yellow-200 text-yellow-700">ID Pending</span>}
              {user.isFlagged && <span className="px-2 py-0.5 rounded-full border text-[11px] font-medium bg-red-50 border-red-200 text-red-700">Flagged</span>}
            </div>
          </div>
          <div className="flex gap-2 items-center self-start">
            {onEdit && (
              <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700">
                <Icons.Edit className="w-4 h-4" />
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <Icons.Close className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="px-5 pt-4">
          <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1">
            <button onClick={() => setTab("information")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "information" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icons.Users className="w-4 h-4" /> Information
            </button>
            <button onClick={() => setTab("documents")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "documents" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Icons.Document className="w-4 h-4" /> Documents
            </button>
            {hasActivity && (
              <button onClick={() => setTab("activity")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "activity" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                <Icons.Activity className="w-4 h-4" /> Activity
              </button>
            )}
          </div>
        </div>

        {/* BODY — soft grey backdrop so the white cards stand apart */}
        <div className="p-5 space-y-4">
          {tab === "information" ? (
            <>
              <Section title="Account" icon={Icons.Shield}>
                <Field label="Email"      value={user.email} />
                <Field label="Contact No." value={user.phone} />
                <Field label="Username"   value={user.username} />
                <Field label="Joined"     value={joined} />
                <Field label="Status"     value={user.status} />
                <Field label="ID Status"  value={user.isVerified ? "✓ Verified" : "Pending"} />
                <Field label="Flagged"    value={user.isFlagged ? "Yes" : "No"} />
                {roleLabelSingular === "Customer" && (
                  <Field label="Bookings" value={`${user.bookingCount || 0} total · ${user.completedBookingCount || 0} completed`} />
                )}
              </Section>

              <Section title="Personal Details" icon={Icons.Users}>
                <Field label="First Name"  value={det.firstName} />
                <Field label="Middle Name" value={det.middleName} />
                <Field label="Last Name"   value={det.lastName} />
                <Field label="Suffix"      value={det.suffix} />
                <Field label="Birth Date"  value={det.birthDate ? fmtDate(det.birthDate) : "—"} />
              </Section>

              <Section title="Address" icon={Icons.Flag}>
                <Field label="Street"       value={addr.street} />
                <Field label="Barangay"     value={addr.barangay} />
                <Field label="Municipality" value={addr.municipality} />
                <Field label="City"         value={addr.city} />
                <Field label="Province"     value={addr.province} />
                <Field label="Village"      value={addr.village} />
                <Field label="Postal Code"  value={addr.postalCode || addr.zipCode} />
              </Section>

              <Section title="Referral" icon={Icons.Star}>
                <Field label="Referral Code"  value={ref.code} />
                <Field label="People Invited" value={String(ref.invitedCount || 0)} />
                <div className="col-span-2 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Referred By</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5 break-words">{referrerLabel(ref.referredBy) || "None"}</p>
                  </div>
                  {ref.referredBy?.id && users?.some((u) => u.id === ref.referredBy.id) && (
                    <button
                      onClick={() => setNestedUserID(ref.referredBy.id)}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 border border-teal-200 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-50"
                    >
                      <Icons.Eye className="w-3.5 h-3.5" /> View
                    </button>
                  )}
                </div>
              </Section>

              {ref.invited?.length > 0 && (
                <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 bg-gray-50 border-b">
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      <Icons.Users className="w-4 h-4 text-teal-600" />
                      Invited Users
                      <span className="text-gray-400 font-normal normal-case">({ref.invited.length})</span>
                    </h3>
                  </div>
                  <ul className="divide-y">
                    {ref.invited.map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-2">
                        <span className="text-gray-700 min-w-0 truncate">
                          {p.name || "—"} {p.username && <span className="text-gray-400">(@{p.username})</span>}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                          {(() => {
                            const iu = users?.find((u) => u.id === p.id);
                            return iu ? <span>{iu.bookingCount || 0} {iu.bookingCount === 1 ? "booking" : "bookings"}</span> : null;
                          })()}
                          {fmtDate(p.createdAt)}
                          <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${
                            p.status?.toLowerCase() === "locked" ? "bg-red-50 text-red-600" :
                            p.status?.toLowerCase() === "active" ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-600"
                          }`}>{p.status || "—"}</span>
                          {users?.some((u) => u.id === p.id) && (
                            <button
                              onClick={() => setNestedUserID(p.id)}
                              className="flex items-center gap-1 px-2 py-0.5 border border-teal-200 text-teal-700 rounded-lg font-semibold hover:bg-teal-50"
                            >
                              <Icons.Eye className="w-3 h-3" /> View
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : tab === "activity" && hasActivity ? (
            <UserActivityTab user={user} kind={roleLabelSingular} viewerRole={viewerRole} />
          ) : (
            <>
              <Section title="Document Info" icon={Icons.IdCard}>
                <Field label="Document Type"   value={docu.documentType} />
                <Field label="Document Number" value={docu.documentNumber} />
                <Field label="ID Status"       value={user.isVerified ? "✓ Verified" : "Pending"} />
              </Section>
              {hasImgs ? (
                <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 bg-gray-50 border-b">
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      <Icons.Document className="w-4 h-4 text-teal-600" />
                      Uploaded Documents
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <DocImg label="Driver License"  url={imgs.driverLicense} />
                      <DocImg label="Government ID"   url={imgs.documentImage} />
                      <DocImg label="Selfie with ID"  url={imgs.selfieWithId} />
                    </div>
                    {imgs.driverLicense && (
                      <div className="mt-3">
                        <ExpiryField userID={user.id} docId={docu.docId} currentValue={docu.driverLicenseExpiry} canEdit={false} />
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No documents uploaded yet</p>
              )}
            </>
          )}
        </div>
      </div>
      {nestedUser && (
        <ViewDetailsModal
          user={nestedUser}
          users={users}
          roleLabelSingular={roleLabelSingular}
          viewerRole={viewerRole}
          onClose={() => setNestedUserID(null)}
        />
      )}
    </div>
  );
}

// ─── EDIT PROFILE (Owner/Admin) ───────────────────────────────────────────────
// These fields live inside the main Edit window (EditUserModal). Name, phone, username, birth date, address and the referral
// code; email is NOT editable (it is the login). Only fields that actually changed are sent; the backend re-checks the allowed
// list and writes the old → new values to the audit log.
const PROFILE_FIELDS = [
  { key: "firstName",    label: "First Name",   source: "userDetails", group: "name" },
  { key: "middleName",   label: "Middle Name",  source: "userDetails", group: "name" },
  { key: "lastName",     label: "Last Name",    source: "userDetails", group: "name" },
  { key: "suffix",       label: "Suffix",       source: "userDetails", group: "name" },
  { key: "birthDate",    label: "Birth Date",   source: "userDetails", group: "name", type: "date" },
  { key: "username",     label: "Username",     source: "user",        group: "account" },
  { key: "phone",        label: "Contact No.",  source: "user",        group: "account" },
  { key: "referralCode", label: "Referral Code", source: "user",       group: "account" },
  { key: "referredByCode", label: "Referred By (their code)", source: "referral", group: "account" },
  { key: "street",       label: "Street",       source: "userAddress", group: "address" },
  { key: "barangay",     label: "Barangay",     source: "userAddress", group: "address" },
  { key: "municipality", label: "Municipality", source: "userAddress", group: "address" },
  { key: "city",         label: "City",         source: "userAddress", group: "address" },
  { key: "province",     label: "Province",     source: "userAddress", group: "address" },
  { key: "village",      label: "Village",      source: "userAddress", group: "address" },
  { key: "postalCode",   label: "Postal Code",  source: "userAddress", group: "address" },
];

const modalInput = "w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50";

// ─── REPLACE DOCUMENT (Owner/Admin) ────────────────────────────────────────────
// Upload a new photo of the driver's license (needs its expiry date) or the government ID (needs type + number). It is
// applied straight away — the admin is the reviewer — and recorded in the audit log.
function ReplaceDocumentModal({ user, kind, onClose, onSaved }) {
  const isLicense = kind === "license";
  const docu = user.document || {};
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [expiry, setExpiry] = useState(toDateInputValue(docu.driverLicenseExpiry));
  const [docType, setDocType] = useState(docu.documentType || "");
  const [docNumber, setDocNumber] = useState(docu.documentNumber || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Please choose an image file.");
    if (f.size > 8 * 1024 * 1024) return setError("The image is larger than 8 MB.");
    setError(null); setFile(f); setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!file) return setError(`Choose a photo of the ${isLicense ? "driver's license" : "ID document"} first.`);
    if (isLicense && !expiry) return setError("Enter the expiry date shown on the license.");
    if (!isLicense && (!docType.trim() || !docNumber.trim())) return setError("Enter the document type and number shown on the ID.");
    setSaving(true); setError(null);
    try {
      const folder = isLicense ? "driverLicenseResubmit" : "documentResubmit";
      const sRef = storageRef(storage, `${folder}/${user.id}_${Date.now()}_${file.name.replace(/[^\w.-]/g, "_")}`);
      await uploadBytes(sRef, file);
      const newUrl = await getDownloadURL(sRef);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/users/${user.id}/document/replace`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          documentKind: kind, newUrl,
          ...(isLicense ? { driverLicenseExpiry: expiry } : { documentType: docType.trim(), documentNumber: docNumber.trim() }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Save failed.");
      onSaved();
    } catch (e) { setError(e.message || "Upload failed. Please try again."); } finally { setSaving(false); }
  };

  const currentUrl = isLicense ? docu.driverLicenseUrl : docu.documentImageUrl;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="font-bold text-lg text-gray-800">Replace {isLicense ? "driver's license" : "ID document"}</h2>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 p-1"><Icons.Close className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Current</p>
              {currentUrl
                ? <img src={currentUrl} alt="Current" className="w-full h-32 object-cover rounded-xl border" />
                : <div className="w-full h-32 rounded-xl border bg-gray-50 flex items-center justify-center text-xs text-gray-400">None uploaded</div>}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">New</p>
              {preview
                ? <img src={preview} alt="New" className="w-full h-32 object-cover rounded-xl border" />
                : <div className="w-full h-32 rounded-xl border-2 border-dashed bg-gray-50 flex items-center justify-center text-xs text-gray-400">No photo chosen</div>}
            </div>
          </div>
          <label className="block">
            <span className="inline-block px-4 py-2 border border-teal-200 text-teal-700 rounded-xl text-sm font-medium hover:bg-teal-50 cursor-pointer">
              {file ? "Choose a different photo" : "Choose photo"}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={saving} />
          </label>

          {isLicense ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">License expiry date</label>
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={saving} className={modalInput} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Document type</label>
                <input value={docType} onChange={(e) => setDocType(e.target.value)} disabled={saving} placeholder="e.g. Passport" className={modalInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Document number</label>
                <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} disabled={saving} className={modalInput} />
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
            {saving ? "Uploading…" : "Replace"}
          </button>
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

// ─── SHARED HELPERS FOR THE REQUEST TABS ─────────────────────────────────────
function RequestStatusPill({ status }) {
  const map = {
    pending:   "bg-yellow-50 border-yellow-200 text-yellow-700",
    approved:  "bg-green-50 border-green-200 text-green-700",
    rejected:  "bg-red-50 border-red-200 text-red-600",
    cancelled: "bg-gray-50 border-gray-200 text-gray-500",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${map[status] || map.cancelled}`}>{status}</span>;
}

// Date on top, time underneath — used for the "Submitted" first column.
function DateTimeCell({ value }) {
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <>
      <p className="text-gray-700">{fmtDate(value)}</p>
      <p className="text-xs text-gray-400">{fmtTime(value)}</p>
    </>
  );
}

// Date and time in their own cells/columns (Document Request + Edit Request tables).
function DateOnlyCell({ value }) {
  if (!value) return <span className="text-gray-300">—</span>;
  return <span className="text-gray-700">{fmtDate(value)}</span>;
}
function TimeOnlyCell({ value }) {
  const t = fmtTime(value);
  if (!t) return <span className="text-gray-300">—</span>;
  return <span className="text-gray-500">{t}</span>;
}

// Before / After photo slot — shows a placeholder instead of vanishing when
// there is no photo (e.g. first-ever upload has no "before").
function BeforeAfterImg({ label, url, emptyText }) {
  if (!url || (typeof url === "string" && url.trim() === "")) {
    return (
      <div>
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <div className="w-full h-36 border border-dashed rounded-xl flex items-center justify-center text-xs text-gray-400 bg-gray-50">{emptyText}</div>
      </div>
    );
  }
  return <DocImg label={label} url={url} />;
}

// Small authed-fetch helper — throws on failure so callers' try/catch works.
async function reviewFetch(path, options = {}) {
  const res = await fetch(`${process.env.REACT_APP_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json.data;
}

// uid -> { name, username, email } for every account, used to label requests.
async function fetchUserLookup() {
  const [userSnap, detailsSnap] = await Promise.all([
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
  return lookup;
}

// Pending / History segmented switch shared by Document Request + Edit Request.
function PendingHistorySwitch({ view, setView, pendingCount, historyCount }) {
  const btn = (key, label, n, pendingStyle) => (
    <button onClick={() => setView(key)}
      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === key ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${pendingStyle && n > 0 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>{n}</span>
    </button>
  );
  return (
    <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1">
      {btn("pending", "Pending", pendingCount, true)}
      {btn("history", "History", historyCount, false)}
    </div>
  );
}

// ─── NEW ID SUBMISSIONS (first-time ID verification queue) ───────────────────
function NewIdSubmissions({ users, onRefresh, roleLabel = "Customers" }) {
  const [detailUser, setDetailUser] = useState(null);
  const [loadingId, setLoadingId]   = useState(null);
  const [sortKey, setSortKey]       = useState("submitted"); // newest submissions on top
  const [sortDir, setSortDir]       = useState("desc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "submitted" ? "desc" : "asc");
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

  const handleVerify = async (user, approve, driverLicenseExpiry) => {
    setLoadingId(user.id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/users/${user.id}/verify`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ isVerified: approve, ...(driverLicenseExpiry ? { driverLicenseExpiry } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Verify failed.");
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
          <h2 className="font-bold text-lg text-gray-800">New ID Submissions <span className="text-gray-400 text-sm font-normal">({users.length})</span></h2>
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
                  <SortableTh label="Submitted" sortKey="submitted" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label={roleLabel.replace(/s$/, "")} sortKey="name" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-5 py-3 text-left">Document Type</th>
                  <th className="px-5 py-3 text-left">Document No.</th>
                  <th className="px-5 py-3 text-left">Referred By</th>
                  <th className="px-5 py-3 text-left">ID Status</th>
                  <th className="px-5 py-3 text-left">Flagged</th>
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
                  const hasLicense = !!u.document?.driverLicenseUrl;
                  const isLoading = loadingId === u.id;

                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap"><DateTimeCell value={u.document?.createdAt} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar key={u.profileImage || "none"} src={u.profileImage} initials={initials} />
                          <div>
                            <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                              {fullName}
                            </p>
                            <p className="text-xs text-gray-400">@{u.username || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{u.document?.documentType || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{u.document?.documentNumber || "—"}</td>
                      <td className="px-5 py-3 text-gray-600 text-xs">
                        {referrerLabel(u.referral?.referredBy) || <span className="text-gray-300">—</span>}
                      </td>
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
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setDetailUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                            View IDs
                          </button>
                          <button onClick={() => handleVerify(u, false)} disabled={isLoading || !uploaded}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            <Icons.X className="w-3.5 h-3.5" />
                            {isLoading ? "..." : "Reject"}
                          </button>
                          <button onClick={() => handleVerify(u, true)} disabled={isLoading || !uploaded || hasLicense}
                            title={hasLicense ? "Use 'View IDs' to enter the license expiry date before approving" : undefined}
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
          onApprove={(expiry) => { handleVerify(detailUser, true, expiry);  setDetailUser(null); }}
          onReject={()  => { handleVerify(detailUser, false); setDetailUser(null); }}
        />
      )}
    </>
  );
}

// ─── RESUBMISSION TABLE (license / document photo resubmits) ────────────────
// mode "pending" → just the queue; mode "history" → also Status + Reviewed.
function ResubmitTable({ rows, mode, userLookup, onOpen }) {
  const [sortDir, setSortDir] = useState("desc"); // newest submitted first
  const history = mode === "history";
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = toMillis(a.createdAt), y = toMillis(b.createdAt);
      return dir * ((x > y) - (x < y));
    });
  }, [rows, sortDir]);
  const { page, setPage, totalPages, pageItems, start, count } = usePagination(sorted);
  useEffect(() => { setPage(1); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs uppercase bg-gray-50">
            <tr>
              <SortableTh label="Submitted Date" sortKey="submitted" sortKeyState="submitted" sortDir={sortDir}
                onSort={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))} />
              <th className="px-5 py-3 text-left">Submitted Time</th>
              <th className="px-5 py-3 text-left">User</th>
              <th className="px-5 py-3 text-left">Type</th>
              {history && <th className="px-5 py-3 text-left">Status</th>}
              {history && <th className="px-5 py-3 text-left">Reviewed Date</th>}
              {history && <th className="px-5 py-3 text-left">Reviewed Time</th>}
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(req => {
              const u = userLookup[req.userID] || {};
              const isLicense = (req.documentKind || "license") === "license";
              return (
                <tr key={req.id} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 whitespace-nowrap"><DateOnlyCell value={req.createdAt} /></td>
                  <td className="px-5 py-3 whitespace-nowrap"><TimeOnlyCell value={req.createdAt} /></td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-800">{u.name || req.userID}</p>
                    <p className="text-xs text-gray-400">@{u.username || "—"}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{isLicense ? "Driver's License" : "Document"}</td>
                  {history && <td className="px-5 py-3"><RequestStatusPill status={req.status} /></td>}
                  {history && <td className="px-5 py-3 whitespace-nowrap"><DateOnlyCell value={req.reviewedAt} /></td>}
                  {history && <td className="px-5 py-3 whitespace-nowrap"><TimeOnlyCell value={req.reviewedAt} /></td>}
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <button onClick={() => onOpen(req.id)}
                        className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700">
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
    </>
  );
}

// Review one resubmitted license/document: current vs new photo, expiry entry
// (license only), approve / reject. Read-only once the request is reviewed.
function ResubmitReviewModal({ req, user, busy, onClose, onApprove, onReject }) {
  const isLicense = (req.documentKind || "license") === "license";
  const currentUrl = isLicense ? req.currentLicenseUrl : req.currentDocumentUrl;
  const newUrl     = isLicense ? req.newLicenseUrl     : req.newDocumentUrl;
  const pending = req.status === "pending";
  const [expiry, setExpiry] = useState("");
  const needsExpiry = isLicense && pending && !expiry;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3 p-5 border-b sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-gray-800 truncate">{user?.name || req.userID}</h2>
            <p className="text-xs text-gray-400">
              @{user?.username || "—"} · {isLicense ? "Driver's License" : "Document"} resubmission
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <RequestStatusPill status={req.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><Icons.X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-gray-50 border-b">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Before &amp; After</h3>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {/* "Before" is the photo on file when the user submitted (stored on the
                  request), so it stays the PREVIOUS photo in History even after approval. */}
              <BeforeAfterImg label={`Before — Previous ${isLicense ? "License" : "Document"}`} url={currentUrl} emptyText="No previous photo on file" />
              <BeforeAfterImg label={`After — ${req.status === "approved" ? "Approved" : req.status === "rejected" ? "Rejected" : "Submitted"} ${isLicense ? "License" : "Document"}`} url={newUrl} emptyText="No photo" />
            </div>
          </section>

          <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-gray-50 border-b">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Submission</h3>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Submitted Date</p>
                <p className="text-sm font-medium text-gray-800 mt-0.5">{fmtDate(req.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Submitted Time</p>
                <p className="text-sm font-medium text-gray-800 mt-0.5">{fmtTime(req.createdAt) || "—"}</p>
              </div>
              {!pending && req.reviewedAt && (
                <>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Reviewed Date</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5">{fmtDate(req.reviewedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Reviewed Time</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5">{fmtTime(req.reviewedAt) || "—"}</p>
                  </div>
                </>
              )}
            </div>
          </section>

          {!isLicense && (req.documentType || req.documentNumber) && (
            <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-gray-50 border-b">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Document Info</h3>
              </div>
              <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Document Type</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{req.documentType || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Document Number</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{req.documentNumber || "—"}</p>
                </div>
              </div>
            </section>
          )}

          {isLicense && pending && (
            <section className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-gray-50 border-b">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  License Expiry Date <span className="text-red-500">*</span>
                </h3>
              </div>
              <div className="p-4">
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-teal-400" />
                <p className="text-[11px] text-gray-400 mt-1">Required to approve — enter the date shown on the new card above.</p>
              </div>
            </section>
          )}

          {req.status === "rejected" && req.reviewNote && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg p-3">Reason: {req.reviewNote}</p>
          )}

          {pending && (
            <div className="flex justify-end gap-2">
              <button onClick={() => onReject(req)} disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-200 rounded-xl text-sm text-red-500 hover:bg-red-50 disabled:opacity-40">
                <Icons.X className="w-4 h-4" /> Reject
              </button>
              <button onClick={() => onApprove(req, expiry)} disabled={busy || needsExpiry}
                title={needsExpiry ? "Enter the license expiry date first" : undefined}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm hover:bg-teal-700 disabled:opacity-40">
                <Icons.Check className="w-4 h-4" /> {busy ? "..." : "Approve"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DOCUMENT REQUEST TAB ────────────────────────────────────────────────────
// Pending: first-time ID submissions (users not yet verified) + resubmitted
// license/document photos waiting for review. History: reviewed resubmissions.
// (Resubmits used to live under "Edit Request"; they're document reviews, so
// they sit here now.)
function DocumentsTab({ users, roleUserIDs, onRefresh, roleLabel = "Customers", onCountChange }) {
  const [view, setView]               = useState("pending"); // "pending" | "history"
  const [allIdReqs, setIdReqs]        = useState([]);
  // Only the resubmissions that belong to the role tab that is open.
  const idReqs = useMemo(() => allIdReqs.filter(r => roleUserIDs?.has(r.userID)), [allIdReqs, roleUserIDs]);
  const [userLookup, setUserLookup]   = useState({});
  const [reqLoading, setReqLoading]   = useState(true);
  const [busyId, setBusyId]           = useState(null);
  const [rejectID, setRejectID]       = useState(null);
  const [reviewID, setReviewID]       = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchResubmits = useCallback(async (silent = false) => {
    if (!silent) setReqLoading(true);
    try {
      const [idSnap, lookup] = await Promise.all([
        getDocs(query(collection(db, "idResubmitRequests"), orderBy("createdAt", "desc"))),
        fetchUserLookup(),
      ]);
      setUserLookup(lookup);
      setIdReqs(idSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("ID resubmit fetch error:", e);
    } finally {
      setReqLoading(false);
    }
  }, []);
  useEffect(() => { fetchResubmits(); }, [fetchResubmits]);

  // Deep-link from Dashboard / notifications: ?open=<uid> opens that person's
  // resubmission (the pending one if there is one) once the data has loaded.
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || reqLoading) return;
    const mine = idReqs.filter(r => r.userID === openID);
    if (mine.length) {
      const target = mine.find(r => r.status === "pending") || mine[0];
      setView(target.status === "pending" ? "pending" : "history");
      setReviewID(target.id);
    }
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [searchParams, reqLoading, idReqs, setSearchParams]);

  // Approve: the new photo becomes the license/document of record. License
  // needs the reviewer's expiry date (also enforced server-side — see
  // approveIdResubmitRequest in profileRequests.service.js).
  const handleApprove = async (req, expiry) => {
    setBusyId(req.id);
    try {
      const isLicense = (req.documentKind || "license") === "license";
      const body = isLicense ? { driverLicenseExpiry: expiry } : {};
      await reviewFetch(`/api/id-resubmit-requests/${req.id}/approve`, { method: "POST", body: JSON.stringify(body) });
      setReviewID(null);
      fetchResubmits(true);
      onCountChange?.();
    } catch (e) { console.error("Approve ID resubmit failed:", e); }
    finally { setBusyId(null); }
  };

  const handleReject = async (id, note) => {
    setBusyId(id);
    try {
      await reviewFetch(`/api/review-requests/id/${id}/reject`, { method: "PATCH", body: JSON.stringify({ note }) });
      setRejectID(null);
      fetchResubmits(true);
      onCountChange?.();
    } catch (e) { console.error("Reject failed:", e); }
    finally { setBusyId(null); }
  };

  const pendingReqs = idReqs.filter(r => r.status === "pending");
  const historyReqs = idReqs.filter(r => r.status !== "pending");
  const reviewReq   = idReqs.find(r => r.id === reviewID);

  return (
    <div className="space-y-4">
      <PendingHistorySwitch view={view} setView={setView}
        pendingCount={users.length + pendingReqs.length} historyCount={historyReqs.length} />

      {view === "pending" ? (
        <>
          <NewIdSubmissions users={users} onRefresh={onRefresh} roleLabel={roleLabel} />

          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-bold text-lg text-gray-800">ID Resubmissions <span className="text-gray-400 text-sm font-normal">({pendingReqs.length})</span></h2>
              <p className="text-xs text-gray-400 mt-0.5">New license or document photos submitted for review</p>
            </div>
            {reqLoading ? (
              <div className="p-5 space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : pendingReqs.length === 0 ? (
              <div className="text-center text-gray-400 py-10">No pending resubmissions.</div>
            ) : (
              <ResubmitTable rows={pendingReqs} mode="pending" userLookup={userLookup} onOpen={setReviewID} />
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-bold text-lg text-gray-800">Resubmission History <span className="text-gray-400 text-sm font-normal">({historyReqs.length})</span></h2>
            <p className="text-xs text-gray-400 mt-0.5">Approved and rejected license / document resubmissions</p>
          </div>
          {reqLoading ? (
            <div className="p-5 space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : historyReqs.length === 0 ? (
            <div className="text-center text-gray-400 py-10">No reviewed resubmissions yet.</div>
          ) : (
            <ResubmitTable rows={historyReqs} mode="history" userLookup={userLookup} onOpen={setReviewID} />
          )}
        </div>
      )}

      {reviewReq && (
        <ResubmitReviewModal
          key={reviewReq.id}
          req={reviewReq}
          user={userLookup[reviewReq.userID]}
          busy={busyId === reviewReq.id}
          onClose={() => setReviewID(null)}
          onApprove={handleApprove}
          onReject={(req) => { setRejectID(req.id); setReviewID(null); }}
        />
      )}
      {rejectID && (
        <RejectNoteModal
          onCancel={() => setRejectID(null)}
          onConfirm={(note) => handleReject(rejectID, note)}
        />
      )}
    </div>
  );
}

// ─── EDIT REQUEST TAB (profile field changes only) ───────────────────────────
// "editRequests" — field changes submitted from Profile.jsx / Account.jsx.
// ID/license resubmits are reviewed under the Document Request tab instead.
// Pending = waiting for review; History = approved / rejected / cancelled.
function changesSummary(req) {
  const all = req.changes || [];
  const changed = all.filter(c => c.newValue !== c.oldValue);
  const labels = (changed.length ? changed : all).map(c => c.label).filter(Boolean);
  if (labels.length === 0) return "—";
  return labels.length > 3 ? `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more` : labels.join(", ");
}

function ProfileRequestsTable({ rows, mode, userLookup, onOpen }) {
  const [sortDir, setSortDir] = useState("desc"); // newest submitted first
  const history = mode === "history";
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = toMillis(a.createdAt), y = toMillis(b.createdAt);
      return dir * ((x > y) - (x < y));
    });
  }, [rows, sortDir]);
  const { page, setPage, totalPages, pageItems, start, count } = usePagination(sorted);
  useEffect(() => { setPage(1); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs uppercase bg-gray-50">
            <tr>
              <SortableTh label="Submitted Date" sortKey="submitted" sortKeyState="submitted" sortDir={sortDir}
                onSort={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))} />
              <th className="px-5 py-3 text-left">Submitted Time</th>
              <th className="px-5 py-3 text-left">User</th>
              <th className="px-5 py-3 text-left">Changes</th>
              {history && <th className="px-5 py-3 text-left">Status</th>}
              {history && <th className="px-5 py-3 text-left">Reviewed Date</th>}
              {history && <th className="px-5 py-3 text-left">Reviewed Time</th>}
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(req => {
              const u = userLookup[req.userID] || {};
              return (
                <tr key={req.id} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 whitespace-nowrap"><DateOnlyCell value={req.createdAt} /></td>
                  <td className="px-5 py-3 whitespace-nowrap"><TimeOnlyCell value={req.createdAt} /></td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-800">{u.name || req.userID}</p>
                    <p className="text-xs text-gray-400">@{u.username || "—"}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{changesSummary(req)}</td>
                  {history && <td className="px-5 py-3"><RequestStatusPill status={req.status} /></td>}
                  {history && <td className="px-5 py-3 whitespace-nowrap"><DateOnlyCell value={req.reviewedAt} /></td>}
                  {history && <td className="px-5 py-3 whitespace-nowrap"><TimeOnlyCell value={req.reviewedAt} /></td>}
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <button onClick={() => onOpen(req.id)}
                        className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700">
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
    </>
  );
}

function EditRequestsTab({ roleUserIDs, onCountChange }) {
  const [view, setView]               = useState("pending"); // "pending" | "history"
  const [allProfileReqs, setProfileReqs] = useState([]);
  // Only the edit requests that belong to the role tab that is open.
  const profileReqs = useMemo(() => allProfileReqs.filter(r => roleUserIDs?.has(r.userID)), [allProfileReqs, roleUserIDs]);
  const [userLookup, setUserLookup]   = useState({}); // uid -> { name, username, email }
  const [loading, setLoading]         = useState(true);
  const [busyId, setBusyId]           = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // request id
  const [viewReqID, setViewReqID]     = useState(null);   // request whose details modal is open

  // Deep-link from Dashboard: /users?...&tab=editRequests&open=<uid>. Once
  // data has loaded, switch to the right view and open that person's pending
  // request (or their latest one if nothing is pending).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || loading) return;
    const mine = profileReqs.filter(r => r.userID === openID);
    if (mine.length) {
      const target = mine.find(r => r.status === "pending") || mine[0];
      setView(target.status === "pending" ? "pending" : "history");
      setViewReqID(target.id);
    }
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [searchParams, loading, profileReqs, setSearchParams]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [editSnap, lookup] = await Promise.all([
        getDocs(query(collection(db, "editRequests"), orderBy("createdAt", "desc"))),
        fetchUserLookup(),
      ]);
      setUserLookup(lookup);
      setProfileReqs(editSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Edit request fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // POST /api/edit-requests/:id/approve applies each changed field to the
  // collection it actually lives in (user / userDetails / userAddress)
  // AND marks the request approved, in one authenticated call.
  const handleApprove = async (req) => {
    setBusyId(req.id);
    try {
      await reviewFetch(`/api/edit-requests/${req.id}/approve`, { method: "POST" });
      setViewReqID(null);
      fetchAll(true);
      onCountChange?.();
    } catch (e) { console.error("Approve profile request failed:", e); }
    finally { setBusyId(null); }
  };

  const handleReject = async (id, note) => {
    setBusyId(id);
    try {
      await reviewFetch(`/api/review-requests/profile/${id}/reject`, { method: "PATCH", body: JSON.stringify({ note }) });
      setRejectTarget(null);
      fetchAll(true);
      onCountChange?.();
    } catch (e) { console.error("Reject failed:", e); }
    finally { setBusyId(null); }
  };

  const pendingReqs = profileReqs.filter(r => r.status === "pending");
  const historyReqs = profileReqs.filter(r => r.status !== "pending");
  const viewReq     = profileReqs.find(r => r.id === viewReqID);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border p-8 space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PendingHistorySwitch view={view} setView={setView}
        pendingCount={pendingReqs.length} historyCount={historyReqs.length} />

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-800">
            {view === "pending" ? "Pending Profile Edit Requests" : "Profile Edit History"}{" "}
            <span className="text-gray-400 text-sm font-normal">({view === "pending" ? pendingReqs.length : historyReqs.length})</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {view === "pending" ? "Field changes waiting for your review" : "Approved, rejected and cancelled profile edit requests"}
          </p>
        </div>
        {(view === "pending" ? pendingReqs : historyReqs).length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            {view === "pending" ? "No pending profile edit requests." : "No reviewed profile edit requests yet."}
          </div>
        ) : (
          <ProfileRequestsTable
            rows={view === "pending" ? pendingReqs : historyReqs}
            mode={view}
            userLookup={userLookup}
            onOpen={setViewReqID}
          />
        )}
      </div>

      {rejectTarget && (
        <RejectNoteModal
          onCancel={() => setRejectTarget(null)}
          onConfirm={(note) => handleReject(rejectTarget, note)}
        />
      )}

      {viewReq && (
        <ProfileRequestHistoryModal
          userID={viewReq.userID}
          user={userLookup[viewReq.userID]}
          requests={[viewReq]}
          busyId={busyId}
          onClose={() => setViewReqID(null)}
          onApprove={handleApprove}
          onReject={(req) => { setRejectTarget(req.id); setViewReqID(null); }}
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
            <p className="text-xs text-gray-400">@{user?.username || "—"} · {requests.length === 1 ? "Profile edit request" : `${requests.length} requests`}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><Icons.X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {requests.map(req => (
            <div key={req.id} className="border rounded-xl overflow-hidden">
              <div className="flex justify-between items-center px-4 py-2.5 bg-gray-50 border-b">
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Submitted Date: <span className="text-gray-600 font-medium">{fmtDate(req.createdAt)}</span></span>
                  <span>Submitted Time: <span className="text-gray-600 font-medium">{fmtTime(req.createdAt) || "—"}</span></span>
                </div>
                <StatusPill status={req.status} />
              </div>

              <div>
                <div className="grid grid-cols-[1fr_1fr_1fr] text-xs font-semibold text-gray-400 uppercase bg-gray-50/50 px-4 py-2">
                  <span>Field</span>
                  <span>Before</span>
                  <span>After</span>
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

  // Captured here rather than via ExpiryField's own independent save
  // button — the whole point is that Approve and "enter the expiry you
  // see on the card" happen as ONE action, not two separate steps an
  // admin could forget to pair up. ExpiryField itself stays unchanged
  // for its other use (ViewDetailsModal's Documents tab — correcting/
  // renewing a date outside of this approval moment).
  const [licenseExpiry, setLicenseExpiry] = useState(toDateInputValue(docu.driverLicenseExpiry));
  const needsExpiry = !!imgs.driverLicense && !licenseExpiry;

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

          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p className="text-xs text-gray-400">Referred By</p>
            <p className="font-medium text-gray-800 mt-0.5">
              {referrerLabel(user.referral?.referredBy) || "No referral code used"}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Uploaded IDs</h3>
            {!hasUploads ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No documents uploaded yet</p>
            ) : (
              <div className="space-y-3">
                <DocImg label="Driver License"  url={imgs.driverLicense} />
                <DocImg label="Government ID"   url={imgs.documentImage} />
                <DocImg label="Selfie with ID"  url={imgs.selfieWithId} />
                {imgs.driverLicense && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <label className="text-xs text-gray-400 block mb-1">
                      License Expiry Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={licenseExpiry}
                      onChange={(e) => setLicenseExpiry(e.target.value)}
                      className="w-full text-sm border rounded-lg px-3 py-1.5"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Required to approve — enter the date shown on the card above.
                    </p>
                  </div>
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
                <button
                  onClick={() => onApprove(licenseExpiry)}
                  disabled={needsExpiry}
                  title={needsExpiry ? "Enter the license expiry date first" : undefined}
                  className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-teal-600"
                >
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
// `form` (which maps 1:1 onto the PATCH /api/users/:uid/status body) and only offered to Owner
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

// One window for everything about a user. Admin sees all of it: name, phone, username, referral code, referred-by, address,
// documents, plus status, flag and role (OTP). Owner sees status, flag and role only; Supervisors see status + flag only. Email is never editable. Saves in this order: profile,
// documents, status/flag, role — an error stops the chain and is shown, and what was already saved stays saved.
function EditUserModal({ user, roleLabelSingular, onClose, onSaved, viewerRole, currentRoleName, onDocumentsChanged }) {
  const KNOWN_STATUSES = ["active", "inactive", "locked"];
  const [form, setForm] = useState({
    status:    KNOWN_STATUSES.includes((user.status || "").toLowerCase()) ? user.status : "active",
    isFlagged: user.isFlagged || false,
  });
  const canEditRole = viewerRole === ROLES.OWNER || viewerRole === ROLES.ADMIN;   // role + status (OTP-protected role change)
  // Editing a user's name / phone / address / referral / documents is an ADMIN-only job (the backend enforces it too).
  // The Owner keeps role + status above, but does not see these sections.
  const canEditProfile = viewerRole === ROLES.ADMIN;
  // Starts empty (not currentRoleName) — the dropdown shows a disabled "Currently: X" placeholder plus only the OTHER roles
  // as real choices, so re-picking the role someone is already in isn't an option at all.
  const [role, setRole] = useState("");
  const assignableRoleOptions = ASSIGNABLE_ROLES.filter(r => r.value !== currentRoleName);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  // ── profile fields ──
  const det = user.details || {};
  const addr = user.address || {};
  const docu = user.document || {};
  const initialProfile = useMemo(() => {
    const src = { user, userDetails: det, userAddress: addr };
    const out = {};
    PROFILE_FIELDS.forEach((f) => {
      let v = src[f.source]?.[f.key];
      if (f.key === "postalCode") v = addr.postalCode ?? addr.zipCode;          // zipCode is the retired name for postalCode
      if (f.key === "referralCode") v = user.referral?.code ?? user.referralCode;
      if (f.key === "referredByCode") v = user.referral?.referredBy?.code;
      out[f.key] = f.type === "date" ? toDateInputValue(v) : String(v ?? "");
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);
  const [profile, setProfile] = useState(initialProfile);
  const setP = (key, upper = false) => (e) => {
    const v = upper ? e.target.value.toUpperCase() : e.target.value;
    setProfile((p) => ({ ...p, [key]: v })); setError(null);
  };

  // ── document fields (photos are replaced through ReplaceDocumentModal) ──
  const initialDoc = useMemo(() => ({
    driverLicenseExpiry: toDateInputValue(docu.driverLicenseExpiry),
    documentType: docu.documentType || "",
    documentNumber: docu.documentNumber || "",
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user.id]);
  const [docForm, setDocForm] = useState(initialDoc);
  const [docReplace, setDocReplace] = useState(null);   // "license" | "document"

  // Role changes are high-stakes, so on top of the Owner/Admin gate above, the acting admin has to confirm a one-time code
  // sent to THEIR OWN email (never the target user's) before the change is applied. The backend enforces this too
  // (PATCH /api/users/:uid/role requires and consumes a valid otp) — this is just the UI for it.
  const [otp, setOtp]           = useState("");
  const [otpSent, setOtpSent]   = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpNotice, setOtpNotice]   = useState(null);
  const [otpCooldown, setOtpCooldown] = useState(0);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  const handleSendOtp = async () => {
    setSendingOtp(true); setOtpNotice(null); setError(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Could not send verification code.");
      setOtpSent(true);
      setOtpNotice(body.emailSent === false ? body.message : "Code sent — check your email.");
      setOtpCooldown(60);
    } catch (e) {
      setOtpNotice(e.message);
    } finally {
      setSendingOtp(false);
    }
  };

  const authed = (method, path, body) => fetch(`${process.env.REACT_APP_API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Save failed.");
    return json;
  });

  const handleSave = async () => {
    // ── checks first, so nothing is half-saved because of a typo ──
    const clean = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v.trim()]));
    if (canEditProfile) {
      if (!clean.firstName || !clean.lastName) return setError("First and last name are required.");
      if (!clean.username) return setError("Username is required.");
      if (clean.phone && !/^[0-9+\-\s()]{7,20}$/.test(clean.phone)) return setError("Enter a valid contact number.");
      if (clean.referralCode && !/^[A-Z0-9-]{4,20}$/.test(clean.referralCode)) return setError("Referral code must be 4–20 characters: letters, numbers or hyphens.");
      if (initialProfile.referralCode.trim() && !clean.referralCode) return setError("A referral code can't be left empty.");
      if (clean.referredByCode && !/^[A-Z0-9-]{4,20}$/.test(clean.referredByCode)) return setError("Referred-by must be a referral code like ARL-ABCD1234 (or leave it empty for none).");
      if (clean.referredByCode && clean.referredByCode === clean.referralCode) return setError("A user can't be referred by their own code.");
    }
    // Role changes need a verified code first — everything else can still be saved without one.
    if (canEditRole && role && !otp) return setError("Enter the verification code sent to your email to confirm this role change.");

    setSaving(true); setError(null);
    try {
      if (canEditProfile) {
        const changes = PROFILE_FIELDS
          .filter((f) => clean[f.key] !== initialProfile[f.key].trim())
          .map((f) => ({ collection: f.source, field: f.key, newValue: clean[f.key] }));
        if (changes.length) await authed("PUT", `/api/users/${user.id}/profile`, { changes });

        const docChanges = Object.fromEntries(Object.entries(docForm).filter(([k, v]) => v.trim() !== initialDoc[k].trim()).map(([k, v]) => [k, v.trim()]));
        if (Object.keys(docChanges).length) await authed("PUT", `/api/users/${user.id}/document`, docChanges);
      }

      await authed("PATCH", `/api/users/${user.id}/status`, form);

      // role can only ever be "" (placeholder, untouched) or one of the OTHER roles — currentRoleName was filtered out.
      if (canEditRole && role) await authed("PATCH", `/api/users/${user.id}/role`, { role, otp });

      onSaved();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const inputCls2 = "w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50";
  const heading = (t) => <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{t}</p>;
  const pField = (f) => (
    <div key={f.key}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
      <input
        type={f.type || "text"} value={profile[f.key]} disabled={saving} className={inputCls2}
        onChange={setP(f.key, f.key === "referralCode" || f.key === "referredByCode")}
        placeholder={f.key === "referredByCode" ? "None — enter the referrer's code" : undefined}
      />
    </div>
  );
  const group = (g) => PROFILE_FIELDS.filter((f) => f.group === g).map(pField);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className={`bg-white rounded-2xl w-full ${canEditProfile ? "max-w-2xl" : "max-w-sm"} max-h-[92vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="font-bold text-lg text-gray-800">Edit {roleLabelSingular}</h2>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 p-1">
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* New signup awaiting approval — this is the "unlock" moment, so show who referred them */}
          {isNewSignup(user) && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-sm text-teal-800">
              <p className="font-semibold">New signup — waiting for account review</p>
              <p className="text-xs mt-0.5">
                Referred by: <span className="font-medium">{referrerLabel(user.referral?.referredBy) || "nobody (no code used)"}</span>
              </p>
              <p className="text-xs mt-0.5 text-teal-700">Set Status to Active to unlock the account.</p>
            </div>
          )}

          {/* Email is the login — read-only for everyone. Supervisors also see the rest read-only. */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
            <p className="text-xs text-gray-400 font-medium mb-2">Account Info{canEditProfile ? "" : " (read-only)"}</p>
            <p className="text-gray-600"><span className="font-medium">Email:</span> {user.email || "—"} {canEditProfile && <span className="text-xs text-gray-400">· can't be changed</span>}</p>
            {!canEditProfile && (
              <>
                <p className="text-gray-600"><span className="font-medium">Phone:</span> {user.phone || "—"}</p>
                <p className="text-gray-600"><span className="font-medium">Username:</span> {user.username || "—"}</p>
              </>
            )}
            <p className="text-gray-600"><span className="font-medium">Referred by:</span> {referrerLabel(user.referral?.referredBy) || "None"}</p>
          </div>

          {canEditProfile && (
            <>
              <div>{heading("Personal")}<div className="grid grid-cols-2 gap-3">{group("name")}</div></div>
              <div>
                {heading("Account")}
                <div className="grid grid-cols-2 gap-3">{group("account")}</div>
                {profile.referralCode.trim() !== initialProfile.referralCode.trim() && (
                  <p className="text-xs text-amber-600 mt-1.5">Changing the referral code means the old one stops working for new sign-ups.</p>
                )}
                <p className="text-xs text-gray-400 mt-1.5">
                  Referred by now: <span className="font-medium text-gray-600">{referrerLabel(user.referral?.referredBy) || "nobody"}</span>
                  {profile.referredByCode.trim() !== initialProfile.referredByCode.trim() && (
                    <span className="text-amber-600"> — {profile.referredByCode.trim() ? "will change to the owner of that code" : "will be cleared"} when you save.</span>
                  )}
                </p>
              </div>
              <div>{heading("Address")}<div className="grid grid-cols-2 gap-3">{group("address")}</div></div>

              <div>
                {heading("Documents")}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">License expiry</label>
                    <input type="date" value={docForm.driverLicenseExpiry} disabled={saving} className={inputCls2}
                      onChange={(e) => setDocForm((d) => ({ ...d, driverLicenseExpiry: e.target.value }))} />
                  </div>
                  <div />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">ID document type</label>
                    <input value={docForm.documentType} disabled={saving} className={inputCls2} placeholder="e.g. Passport"
                      onChange={(e) => setDocForm((d) => ({ ...d, documentType: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">ID document number</label>
                    <input value={docForm.documentNumber} disabled={saving} className={inputCls2}
                      onChange={(e) => setDocForm((d) => ({ ...d, documentNumber: e.target.value }))} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" onClick={() => setDocReplace("license")} disabled={saving}
                    className="px-3 py-1.5 border border-teal-200 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-50 disabled:opacity-50">
                    Replace license photo
                  </button>
                  <button type="button" onClick={() => setDocReplace("document")} disabled={saving}
                    className="px-3 py-1.5 border border-teal-200 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-50 disabled:opacity-50">
                    Replace ID photo
                  </button>
                </div>
              </div>
            </>
          )}

          <div>
            {canEditProfile && heading("Account status")}
            <div className="space-y-4">
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
                    <>
                      <p className="text-xs text-amber-600 mt-1">
                        This will move {user.details?.firstName || user.username || "this user"} out of the {roleLabelSingular} list into {role}.
                      </p>

                      {/* Verification step — required before a role change can be saved */}
                      <div className="mt-3 p-3 border rounded-xl bg-gray-50 space-y-2">
                        <p className="text-xs font-medium text-gray-600">Verify it's you</p>
                        <p className="text-xs text-gray-400">
                          We'll send a 6-digit code to your own account email to confirm this role change.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={sendingOtp || otpCooldown > 0}
                            className="px-3 py-2 text-xs font-medium rounded-xl border border-teal-300 text-teal-700 hover:bg-teal-50 disabled:opacity-50 whitespace-nowrap"
                          >
                            {sendingOtp ? "Sending..." : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : otpSent ? "Resend code" : "Send code"}
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="Enter 6-digit code"
                            value={otp}
                            onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400"
                          />
                        </div>
                        {otpNotice && <p className="text-xs text-gray-500">{otpNotice}</p>}
                      </div>
                    </>
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
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl p-3">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={onClose} disabled={saving} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* stopPropagation: clicks inside the Replace window must not reach this window's backdrop-click-to-close */}
      {docReplace && (
        <div onClick={(e) => e.stopPropagation()}>
          <ReplaceDocumentModal user={user} kind={docReplace} onClose={() => setDocReplace(null)}
            onSaved={() => { setDocReplace(null); onDocumentsChanged?.(); }} />
        </div>
      )}
    </div>
  );
}

// ─── CONFIRM DELETE ───────────────────────────────────────────────────────────
function ConfirmDeleteModal({ name, roleLabelSingular, error, onConfirm, onCancel }) {
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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 text-center">
            {error}
          </div>
        )}
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
    amber: "bg-amber-50 text-amber-600",
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