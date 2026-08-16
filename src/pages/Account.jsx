import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc, getDoc, collection, query, where, getDocs,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "../fireabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import {
  fetchRegions,
  fetchProvinces,
  fetchMunicipalities,
  fetchBarangays,
} from "../utils/fireStoreLocation";

// How many days out an expiring (not yet expired) license starts showing
// the amber warning. Kept in sync by hand with the admin backend's
// LICENSE_WARNING_DAYS (jobs/midinghtFlush.job.js) — same threshold,
// two codebases, no shared config between them currently.
const LICENSE_WARNING_DAYS = 14;

function parseExpiryDate(val) {
  if (!val) return null;
  if (typeof val === "string") { const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
  if (typeof val?.toDate === "function") return val.toDate();
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000);
  return null;
}

/* ── Icons ── */
const IconMail = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const IconShield = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const IconLogout = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const IconPhone = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h2.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const IconUser = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const IconHome = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-9-2v10a1 1 0 001 1h3m6-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const IconEdit = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const IconWarning = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" />
  </svg>
);

const IconUpload = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12" />
  </svg>
);

const IconPalette = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="8.5" cy="10" r="1" fill="currentColor" />
    <circle cx="12" cy="8" r="1" fill="currentColor" />
    <circle cx="15.5" cy="10" r="1" fill="currentColor" />
    <path d="M7 15.5c1.38-1 5.62-1 9 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconLock = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconEye = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

const IconEyeOff = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.12 14.12a3 3 0 01-4.24-4.24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconClose = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/* ── Toggle switch (used by Dark Mode preference) ── */
function Toggle({ label, checked, onChange, isDark }) {
  return (
    <div className={`flex items-center justify-between border rounded-xl px-4 py-3 ${
      isDark ? "border-[#4FC3F7]/20" : "border-gray-100"
    }`}>
      <span className={`text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>{label}</span>
      <button onClick={() => onChange(!checked)}
        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
          checked
            ? isDark ? "bg-[#4FC3F7]" : "bg-arl-dark"
            : isDark ? "bg-[#212121]" : "bg-gray-300"
        }`}>
        <div className={`w-4 h-4 rounded-full shadow transform transition-transform ${
          checked ? "translate-x-6" : ""
        } ${isDark ? (checked ? "bg-[#212121]" : "bg-[#F5F5F5]/40") : "bg-white"}`} />
      </button>
    </div>
  );
}

/* ── Password input with show/hide toggle (used by Change Password) ── */
function PasswordInput({ label, value, onChange, isDark }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full border rounded-xl px-3 py-2 text-sm outline-none pr-10 transition-colors ${
            isDark
              ? "border-[#4FC3F7]/20 bg-[#212121]/40 text-[#F5F5F5] placeholder-[#F5F5F5]/20 focus:border-[#4FC3F7] focus:ring-1 focus:ring-[#4FC3F7]/30"
              : "border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-arl-light"
          }`}
        />
        <button type="button" onClick={() => setShow((s) => !s)}
          className={`absolute right-3 top-1/2 -translate-y-1/2 ${
            isDark ? "text-[#F5F5F5]/30 hover:text-[#4FC3F7]" : "text-gray-400 hover:text-gray-600"
          }`}>
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </div>
  );
}

/* ── Detail row ── */
function DetailRow({ icon, label, value, isDark }) {
  return (
    <div className={`flex items-center gap-3 py-3.5 border-b last:border-0 ${isDark ? "border-[#4FC3F7]/10" : "border-gray-50"}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
        isDark ? "bg-[#4FC3F7]/15 text-[#4FC3F7]" : "bg-arl-light text-arl-primary"
      }`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>{label}</p>
        <p className={`text-sm font-medium truncate ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>{value || "—"}</p>
      </div>
    </div>
  );
}

/* ── Editable field (used inside the Edit modal) ── */
function EditField({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={onChange}
        className="w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400"
      />
    </div>
  );
}

// Fields that can be edited from this page. Each entry says which
// Firestore collection it lives in so the save/request logic below knows
// where to write it. "user" fields live directly on the user doc (id ==
// uid); "userDetails"/"userAddress" live in their own doc, found by
// querying where userID == uid (same lookup Users.jsx already uses).
const EDITABLE_FIELDS = [
  { key: "phone",        label: "Phone",        source: "user" },
  { key: "username",     label: "Username",     source: "user" },
  { key: "firstName",    label: "First Name",   source: "userDetails" },
  { key: "middleName",   label: "Middle Name",  source: "userDetails" },
  { key: "lastName",     label: "Last Name",    source: "userDetails" },
  { key: "suffix",       label: "Suffix",       source: "userDetails" },
  { key: "birthDate",    label: "Birth Date",   source: "userDetails", type: "date" },
  { key: "street",       label: "Street",       source: "userAddress" },
  { key: "region",       label: "Region",       source: "userAddress" },
  { key: "province",     label: "Province",     source: "userAddress" },
  { key: "municipality", label: "Municipality", source: "userAddress" },
  { key: "city",         label: "City",         source: "userAddress" },
  { key: "barangay",     label: "Barangay",     source: "userAddress" },
  { key: "postalCode",   label: "Postal Code",  source: "userAddress" },
  { key: "village",      label: "Village",      source: "userAddress" },
  { key: "zipCode",      label: "Zip Code",     source: "userAddress" },
];

// These four are rendered as cascading dropdowns (LocationFieldsEditor)
// instead of the generic free-text EditField below.
const LOCATION_KEYS = ["region", "province", "city", "municipality", "barangay"];

// Grouping for the modal layout: personal info vs. address, so the two
// don't run together in one long undifferentiated grid.
const PROFILE_FIELD_KEYS = EDITABLE_FIELDS
  .filter(f => f.source === "user" || f.source === "userDetails")
  .map(f => f.key);
const ADDRESS_TEXT_FIELD_KEYS = EDITABLE_FIELDS
  .filter(f => f.source === "userAddress" && !LOCATION_KEYS.includes(f.key))
  .map(f => f.key);

/* ── Location fields editor — cascading Region → Province → Municipality →
   Barangay dropdowns fed by /api/location/*, same data source and pattern
   the customer signup flow uses. Replaces free-typed text inputs for these
   fields so users can't enter a location that doesn't exist. ── */
function LocationFieldsEditor({ values, onChange, token }) {
  const [regions,        setRegions]        = useState([]);
  const [provinces,      setProvinces]      = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [barangays,      setBarangays]      = useState([]);
  const [loadingReg,  setLoadingReg]  = useState(false);
  const [loadingProv, setLoadingProv] = useState(false);
  const [loadingMun,  setLoadingMun]  = useState(false);
  const [loadingBar,  setLoadingBar]  = useState(false);
  const [selRegion, setSelRegion] = useState(null);
  const [selProv,   setSelProv]   = useState(null);
  const [selMun,    setSelMun]    = useState(null);
  const [selBar,    setSelBar]    = useState(null);

  // Names to auto-match against each list once it loads, so opening the
  // modal doesn't blank out the user's existing address.
  const prefill = useRef({
    region:       values.region       || "",
    province:     values.province     || "",
    municipality: values.municipality || values.city || "",
    barangay:     values.barangay     || "",
  });

  // Skip pushing a change on each field's very first effect run (mount),
  // so an unresolved/no-match prefill doesn't wipe out the original value.
  const firstReg  = useRef(true);
  const firstProv = useRef(true);
  const firstMun  = useRef(true);
  const firstBar  = useRef(true);

  useEffect(() => {
    setLoadingReg(true);
    fetchRegions(token).then(setRegions).catch(console.error).finally(() => setLoadingReg(false));
  }, [token]);

  useEffect(() => {
    if (!regions.length || selRegion) return;
    const match = regions.find((r) => r.regionName === prefill.current.region);
    if (match) setSelRegion(match);
  }, [regions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selRegion) { setProvinces([]); return; }
    setLoadingProv(true);
    setProvinces([]); setSelProv(null); setMunicipalities([]); setSelMun(null); setBarangays([]); setSelBar(null);
    fetchProvinces(selRegion.regionID, token).then(setProvinces).catch(console.error).finally(() => setLoadingProv(false));
  }, [selRegion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!provinces.length || selProv) return;
    const match = provinces.find((p) => p.provinceName === prefill.current.province);
    if (match) setSelProv(match);
  }, [provinces]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selProv) { setMunicipalities([]); return; }
    setLoadingMun(true);
    setMunicipalities([]); setSelMun(null); setBarangays([]); setSelBar(null);
    fetchMunicipalities(selProv.provinceID, token).then(setMunicipalities).catch(console.error).finally(() => setLoadingMun(false));
  }, [selProv]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!municipalities.length || selMun) return;
    const match = municipalities.find((m) => m.municipalityName === prefill.current.municipality);
    if (match) setSelMun(match);
  }, [municipalities]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selMun) { setBarangays([]); return; }
    setLoadingBar(true);
    setBarangays([]); setSelBar(null);
    fetchBarangays(selMun.municipalityID, token).then(setBarangays).catch(console.error).finally(() => setLoadingBar(false));
  }, [selMun]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!barangays.length || selBar) return;
    const match = barangays.find((b) => b.barangayName === prefill.current.barangay);
    if (match) setSelBar(match);
  }, [barangays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push each resolved selection up into the parent form.
  useEffect(() => {
    if (firstReg.current) { firstReg.current = false; return; }
    onChange({ region: selRegion?.regionName || "" });
  }, [selRegion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (firstProv.current) { firstProv.current = false; return; }
    onChange({ province: selProv?.provinceName || "" });
  }, [selProv]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (firstMun.current) { firstMun.current = false; return; }
    onChange({ city: selMun?.municipalityName || "", municipality: selMun?.municipalityName || "" });
  }, [selMun]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (firstBar.current) { firstBar.current = false; return; }
    onChange({ barangay: selBar?.barangayName || "" });
  }, [selBar]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegion = (e) => { prefill.current = {}; setSelRegion(regions.find((r) => r.regionID === e.target.value) || null); };
  const handleProv   = (e) => { prefill.current = {}; setSelProv(provinces.find((p) => p.provinceID === e.target.value) || null); };
  const handleMun    = (e) => { prefill.current = {}; setSelMun(municipalities.find((m) => m.municipalityID === e.target.value) || null); };
  const handleBar    = (e) => { prefill.current = {}; setSelBar(barangays.find((b) => b.barangayID === e.target.value) || null); };

  const selectCls = "w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50 disabled:text-gray-400";

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Region</label>
        <select className={selectCls} value={selRegion?.regionID || ""} onChange={handleRegion} disabled={loadingReg}>
          <option value="">{loadingReg ? "Loading…" : "— Select Region —"}</option>
          {regions.map((r) => <option key={r.regionID} value={r.regionID}>{r.regionName}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Province</label>
        <select className={selectCls} value={selProv?.provinceID || ""} onChange={handleProv} disabled={!selRegion || loadingProv}>
          <option value="">{loadingProv ? "Loading…" : selRegion ? "— Select Province —" : "— Select a region first —"}</option>
          {provinces.map((p) => <option key={p.provinceID} value={p.provinceID}>{p.provinceName}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Municipality / City</label>
        <select className={selectCls} value={selMun?.municipalityID || ""} onChange={handleMun} disabled={!selProv || loadingMun}>
          <option value="">{loadingMun ? "Loading…" : selProv ? "— Select Municipality —" : "— Select a province first —"}</option>
          {municipalities.map((m) => <option key={m.municipalityID} value={m.municipalityID}>{m.municipalityName}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Barangay</label>
        <select className={selectCls} value={selBar?.barangayID || ""} onChange={handleBar} disabled={!selMun || loadingBar}>
          <option value="">{loadingBar ? "Loading…" : selMun ? "— Select Barangay —" : "— Select a municipality first —"}</option>
          {barangays.map((b) => <option key={b.barangayID} value={b.barangayID}>{b.barangayName}</option>)}
        </select>
      </div>
    </>
  );
}

/* ── Edit Profile Modal ── */
function EditProfileModal({ current, canEditDirectly, pendingRequest, onClose, onSaved, onCancelledRequest }) {
  const { getToken } = useAuth();
  const token = getToken();
  const [form, setForm] = useState(() =>
    Object.fromEntries(EDITABLE_FIELDS.map(f => [f.key, current[f.key] || ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Local copy so cancelling flips this modal straight into the edit form
  // without needing to close/reopen it.
  const [activePending, setActivePending] = useState(pendingRequest);

  const handleChange = (key) => (e) => {
    const val = e.target.value;
    // Postal Code and Zip Code are the same value stored twice (the
    // customer backend already does this on save) — keep them in sync
    // here too so admins don't have to type it twice.
    if (key === "postalCode") {
      setForm(f => ({ ...f, postalCode: val, zipCode: val }));
    } else {
      setForm(f => ({ ...f, [key]: val }));
    }
  };

  const handleCancelRequest = async () => {
    if (!activePending) return;
    setCancelling(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/profile/edit-requests/${activePending.id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not cancel the pending request.");
      setActivePending(null);
      onCancelledRequest?.();
    } catch (e) {
      setError(e.message || "Could not cancel the pending request.");
    } finally {
      setCancelling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (canEditDirectly) {
        // Owner/Admin: applied straight to the underlying docs server-side,
        // no approval needed — same shape as an edit request's `changes`,
        // just applied immediately instead of going through review.
        const changes = [];
        EDITABLE_FIELDS.forEach(f => {
          if (form[f.key] === (current[f.key] || "")) return; // unchanged
          changes.push({ field: f.key, collection: f.source, newValue: form[f.key] });
        });

        if (changes.length) {
          const res = await fetch(`${process.env.REACT_APP_API_URL}/api/profile/fields`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ changes }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.message || "Save failed.");
        }
        onSaved({ submitted: false });
      } else {
        const hasAnyChange = EDITABLE_FIELDS.some(f => form[f.key] !== (current[f.key] || ""));
        if (!hasAnyChange) {
          onClose();
          return;
        }

        // Every field goes in, not just the changed ones — keeps the admin
        // review side a plain full comparison (old vs requested) instead of
        // a diff they have to piece together field by field.
        const changes = EDITABLE_FIELDS.map(f => ({
          field: f.key,
          label: f.label,
          collection: f.source,
          oldValue: current[f.key] || "",
          newValue: form[f.key] || "",
        }));

        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/profile/edit-requests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ role: current.role, changes }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Could not submit request.");
        onSaved({ submitted: true });
      }
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg text-gray-800">Edit Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        {!canEditDirectly && activePending ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              You already have a pending edit request. Cancel it below if you want to submit different changes instead.
            </div>

            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 text-xs font-semibold text-gray-400 uppercase bg-gray-50 px-4 py-2">
                <span>Current</span>
                <span>Requested</span>
              </div>
              {(activePending.changes || []).map((c, i) => {
                const changed = c.newValue !== c.oldValue;
                return (
                  <div key={i} className={`grid grid-cols-2 px-4 py-2.5 border-t text-sm ${changed ? "bg-orange-50" : ""}`}>
                    <div>
                      <p className="text-xs text-gray-400">{c.label}</p>
                      <p className="text-gray-600">{c.oldValue || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{c.label}</p>
                      <p className={changed ? "font-medium text-orange-600" : "text-gray-800"}>{c.newValue || "—"}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button onClick={handleCancelRequest} disabled={cancelling}
                className="px-5 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-60">
                {cancelling ? "Cancelling..." : "Cancel Request"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              {!canEditDirectly && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  Your changes will be sent to an admin for review before they take effect.
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Profile Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {EDITABLE_FIELDS.filter(f => PROFILE_FIELD_KEYS.includes(f.key)).map(f => (
                    <EditField
                      key={f.key}
                      label={f.label}
                      type={f.type}
                      value={form[f.key]}
                      onChange={handleChange(f.key)}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <LocationFieldsEditor
                    values={{
                      region: form.region, province: form.province,
                      city: form.city, municipality: form.municipality, barangay: form.barangay,
                    }}
                    onChange={(patch) => setForm(f => ({ ...f, ...patch }))}
                    token={token}
                  />
                  {EDITABLE_FIELDS.filter(f => ADDRESS_TEXT_FIELD_KEYS.includes(f.key)).map(f =>
                    f.key === "zipCode" ? (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Zip Code</label>
                        <input
                          type="text"
                          value={form.postalCode || ""}
                          disabled
                          className="w-full border rounded-xl px-3 py-2 text-sm outline-none bg-gray-50 text-gray-400 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-400 mt-1">Same as Postal Code</p>
                      </div>
                    ) : (
                      <EditField
                        key={f.key}
                        label={f.label}
                        type={f.type}
                        value={form[f.key]}
                        onChange={handleChange(f.key)}
                      />
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t sticky bottom-0 bg-white">
              <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : canEditDirectly ? "Save Changes" : "Send Request Edit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Resubmit ID Modal — upload a new license photo for admin review ── */
function ResubmitIdModal({ current, onClose, onSubmitted }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file) { setError("Please choose a photo of your license first."); return; }
    setSaving(true);
    setError(null);
    try {
      const path = `driverLicenseResubmit/${current.uid}_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const newLicenseUrl = await getDownloadURL(storageRef);

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/profile/id-resubmit-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          role: current.role,
          currentLicenseUrl: current.driverLicenseUrl || "",
          newLicenseUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Upload failed. Please try again.");
      onSubmitted();
    } catch (e) {
      setError(e.message || "Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="font-bold text-lg text-gray-800">Resubmit Driver's License</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><IconClose /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Upload a clear photo of your updated (renewed) driver's license. An admin will review it and confirm the new expiry date before it's applied to your account.
          </p>

          {current.driverLicenseUrl && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Current on file</p>
              <img src={current.driverLicenseUrl} alt="Current license" className="w-full h-32 object-cover rounded-xl border" />
            </div>
          )}

          <label className="block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer hover:bg-gray-50">
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            {preview ? (
              <img src={preview} alt="New license preview" className="w-full h-32 object-cover rounded-lg mx-auto" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400 py-4">
                <IconUpload className="w-6 h-6" />
                <span className="text-sm">Tap to choose a photo</span>
              </div>
            )}
          </label>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
              {saving ? "Uploading..." : "Submit for Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared by every role (Owner, Admin, Supervisor, Driver).
export default function Account() {
  const navigate = useNavigate();
  const { user, logout, previewRole, setPreviewRole } = useAuth();
  const { isDark, toggleDark } = useTheme();

  const [profile, setProfile] = useState(null); // merged user + userDetails + userAddress
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);
  const [notice, setNotice] = useState(null);
  const [profileTab, setProfileTab] = useState("details"); // "details" | "document"

  const [pendingProfileReq, setPendingProfileReq] = useState(false);
  const [pendingIdReq, setPendingIdReq]           = useState(false);
  const [allProfileReqs, setAllProfileReqs]       = useState([]);

  // ── Change Password ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw,      setChangingPw]      = useState(false);
  const [pwNotice,        setPwNotice]        = useState(null); // { msg, type: "success"|"error" }

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword || !currentPassword) {
      setPwNotice({ msg: "Please fill in all password fields.", type: "error" }); return;
    }
    if (newPassword.length < 6) {
      setPwNotice({ msg: "New password must be at least 6 characters.", type: "error" }); return;
    }
    if (newPassword !== confirmPassword) {
      setPwNotice({ msg: "Passwords do not match.", type: "error" }); return;
    }
    setChangingPw(true);
    try {
      const firebaseUser = auth.currentUser;
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPwNotice({ msg: "Password changed successfully.", type: "success" });
    } catch (e) {
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        setPwNotice({ msg: "Current password is incorrect.", type: "error" });
      } else {
        setPwNotice({ msg: e.message, type: "error" });
      }
    } finally {
      setChangingPw(false);
    }
  };

  const canEditDirectly = user?.role === "Owner" || user?.role === "Admin";
  // Driver's license expiry only matters for Driver/Supervisor accounts —
  // Owner/Admin don't drive, Customer is out of scope on this side.
  const tracksLicense = user?.role === "Driver" || user?.role === "Supervisor";

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [userSnap, detailsSnap, addressSnap, docSnap, editReqSnap, idReqSnap] = await Promise.all([
        getDoc(doc(db, "user", user.uid)),
        getDocs(query(collection(db, "userDetails"), where("userID", "==", user.uid))),
        getDocs(query(collection(db, "userAddress"), where("userID", "==", user.uid))),
        getDocs(query(collection(db, "userDocument"), where("userID", "==", user.uid))),
        // No orderBy here on purpose — where + orderBy on a different field
        // needs a Firestore composite index that doesn't exist yet. Sorting
        // happens client-side below instead, same visible result without
        // needing an index created per collection.
        getDocs(query(collection(db, "editRequests"), where("requestedBy", "==", user.uid))),
        getDocs(query(collection(db, "idResubmitRequests"), where("requestedBy", "==", user.uid))),
      ]);

      const userData    = userSnap.exists() ? userSnap.data() : {};
      const detailsDoc   = detailsSnap.docs[0];
      const addressDoc   = addressSnap.docs[0];
      const documentDoc  = docSnap.docs[0];

      setProfile({
        uid: user.uid,
        email: user.email,
        role: user.role,
        username: userData.username || user.username || "",
        phone: userData.phone || "",
        status: userData.status || "active",
        isVerified: userData.isVerified || false,
        createdAt: userData.createdAt || null,
        ...(detailsDoc ? detailsDoc.data() : {}),
        ...(addressDoc ? addressDoc.data() : {}),
        driverLicenseUrl: documentDoc?.data()?.driverLicenseUrl || "",
        driverLicenseExpiry: documentDoc?.data()?.driverLicenseExpiry || null,
        governmentIdUrl: documentDoc?.data()?.governmentIdUrl || "",
        documentImageUrl: documentDoc?.data()?.documentImageUrl || "",
        documentType: documentDoc?.data()?.documentType || "",
        documentNumber: documentDoc?.data()?.documentNumber || "",
        _detailsDocId: detailsDoc?.id || null,
        _addressDocId: addressDoc?.id || null,
      });

      const byNewestFirst = (a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? a.createdAt?._seconds ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? b.createdAt?._seconds ?? 0;
        return tb - ta;
      };
      const profileReqs = editReqSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewestFirst);
      const idReqs       = idReqSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewestFirst);
      setAllProfileReqs(profileReqs);
      setPendingProfileReq(profileReqs.some(r => r.status === "pending"));
      setPendingIdReq(idReqs.some(r => r.status === "pending"));
    } catch (e) {
      console.error("Profile fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const expiryDate = tracksLicense ? parseExpiryDate(profile?.driverLicenseExpiry) : null;
  const daysToExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const licenseExpired = expiryDate ? daysToExpiry < 0 : false;
  const licenseExpiringSoon = expiryDate ? (!licenseExpired && daysToExpiry <= LICENSE_WARNING_DAYS) : false;

  if (!user) return null;

  const initials = (user.username || user.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await logout();
    navigate("/");
  };

  const fullName = profile
    ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || user.username || "—"
    : "—";

  const card = `rounded-2xl border shadow-card overflow-hidden ${
    isDark ? "bg-[#1A5F7A] border-[#4FC3F7]/20" : "bg-white"
  }`;

  return (
    <div className={`p-4 max-w-2xl mx-auto space-y-6 ${isDark ? "dark" : ""}`}>

      {notice && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.submitted ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700"}`}>
          {notice.submitted
            ? notice.idResubmit
              ? "Your new license photo was submitted and is pending admin review."
              : "Your edit request was submitted and is pending admin approval."
            : "Your profile was updated."}
        </div>
      )}

      {/* HEADER CARD */}
      <div className={card}>
        <div className="bg-arl-primary px-6 py-8 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-lg font-semibold truncate">{fullName !== "—" ? fullName : (user.username || "User")}</p>
            <p className="text-white/70 text-sm truncate">{user.email}</p>
            <span className="inline-block mt-1 text-xs font-semibold text-white bg-white/15 px-2.5 py-0.5 rounded-full">
              {user.role}
            </span>
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            <IconEdit className="w-4 h-4" />
            Edit
          </button>
        </div>

        {/* Details / Document sub-tabs */}
        <div className="flex gap-2 px-6 pt-4">
          <button onClick={() => setProfileTab("details")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              profileTab === "details"
                ? "bg-teal-600 text-white shadow"
                : isDark ? "bg-[#212121]/40 border border-[#4FC3F7]/20 text-[#F5F5F5]/60 hover:bg-[#212121]/60" : "bg-gray-50 border text-gray-600 hover:bg-gray-100"
            }`}>
            Details
          </button>
          <button onClick={() => setProfileTab("document")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              profileTab === "document"
                ? "bg-teal-600 text-white shadow"
                : isDark ? "bg-[#212121]/40 border border-[#4FC3F7]/20 text-[#F5F5F5]/60 hover:bg-[#212121]/60" : "bg-gray-50 border text-gray-600 hover:bg-gray-100"
            }`}>
            Document
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className={`h-10 rounded-xl animate-pulse ${isDark ? "bg-[#212121]/50" : "bg-gray-100"}`} />)}
          </div>
        ) : profileTab === "details" ? (
          <div className="px-6 py-2">
            {/* BADGES — sits right before Email, inside the Details panel */}
            {(pendingProfileReq || pendingIdReq || licenseExpiringSoon || licenseExpired) && (
              <div className={`flex flex-wrap gap-2 py-3.5 border-b ${isDark ? "border-[#4FC3F7]/10" : "border-gray-50"}`}>
                {pendingProfileReq && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700">
                    Pending Profile Update Request
                  </span>
                )}
                {pendingIdReq && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700">
                    Pending ID Update Request
                  </span>
                )}
                {(licenseExpiringSoon || licenseExpired) && !pendingIdReq && (
                  <button
                    onClick={() => setShowResubmit(true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      licenseExpired ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    <IconWarning className="w-3.5 h-3.5" />
                    {licenseExpired
                      ? "Driver's license is expired, please update"
                      : `Driver's license expires in ${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"} — please update`}
                  </button>
                )}
              </div>
            )}

            <DetailRow icon={<IconMail />}        label="Email"    value={user.email} isDark={isDark} />
            <DetailRow icon={<IconPhone />}       label="Phone"    value={profile?.phone} isDark={isDark} />
            <DetailRow icon={<IconUser />}        label="Full Name" value={fullName} isDark={isDark} />
            <DetailRow icon={<IconHome />}        label="Address"
              value={[profile?.street, profile?.barangay, profile?.city, profile?.province].filter(Boolean).join(", ")} isDark={isDark} />
            <DetailRow icon={<IconShield />}      label="Role"     value={user.role} isDark={isDark} />
          </div>
        ) : (
          <div className="px-6 py-4 space-y-5">
            {!tracksLicense && !profile?.governmentIdUrl && !profile?.driverLicenseUrl ? (
              <p className={`text-sm text-center py-6 ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>No documents on file.</p>
            ) : (
              <>
                {tracksLicense && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className={`text-xs font-semibold uppercase ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>Driver's License</p>
                      <button
                        onClick={() => setShowResubmit(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700"
                      >
                        <IconEdit className="w-3.5 h-3.5" />
                        Resubmit
                      </button>
                    </div>
                    {profile?.driverLicenseUrl ? (
                      <img src={profile.driverLicenseUrl} alt="Driver's License" className="w-full h-48 object-cover rounded-xl border" />
                    ) : (
                      <p className={`text-sm rounded-xl p-4 text-center ${isDark ? "text-[#F5F5F5]/40 bg-[#212121]/40" : "text-gray-400 bg-gray-50"}`}>No license photo on file yet.</p>
                    )}
                    <DetailRow
                      icon={<IconWarning />}
                      label="Expiry Date"
                      value={expiryDate ? expiryDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Not set — pending admin review"}
                    />
                  </div>
                )}

                {/* Valid ID / Government ID — display only, no resubmit flow.
                    Expiry tracking/auto-lock is scoped to the driver's license
                    only (see earlier decision — PH government ID types don't
                    expire consistently enough to enforce the same way). */}
                {(profile?.governmentIdUrl || profile?.documentType) && (
                  <div className={`space-y-3 pt-2 border-t ${isDark ? "border-[#4FC3F7]/10" : ""}`}>
                    <p className={`text-xs font-semibold uppercase ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>Valid ID</p>
                    {profile?.governmentIdUrl ? (
                      <img src={profile.governmentIdUrl} alt="Valid ID" className="w-full h-48 object-cover rounded-xl border" />
                    ) : (
                      <p className={`text-sm rounded-xl p-4 text-center ${isDark ? "text-[#F5F5F5]/40 bg-[#212121]/40" : "text-gray-400 bg-gray-50"}`}>No ID photo on file yet.</p>
                    )}
                    <DetailRow icon={<IconUser />} label="ID Type"   value={profile.documentType} isDark={isDark} />
                    <DetailRow icon={<IconUser />} label="ID Number" value={profile.documentNumber} isDark={isDark} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* PREFERENCES — Dark Mode (moved here from the old Settings page; this is a personal preference, not a system setting) */}
      <div className={`${card} px-6 py-4 space-y-3`}>
        <h2 className={`font-semibold text-sm flex items-center gap-2 ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>
          <IconPalette className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} /> Appearance
        </h2>
        <Toggle label="Dark Mode" checked={isDark} onChange={() => toggleDark()} isDark={isDark} />
      </div>

      {/* VIEW SYSTEM AS — Admin-only cosmetic role preview. Never shown to
          Owner/Supervisor/Driver, and gated on the real user.role (not
          effectiveRole) so this control stays visible and usable no matter
          which role is currently being previewed — it's how you get back. */}
      {user.role === "Admin" && (
        <div className={`${card} px-6 py-4 space-y-3`}>
          <h2 className={`font-semibold text-sm flex items-center gap-2 ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>
            <IconEye className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} /> View System As
          </h2>
          <p className={`text-xs ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>
            Preview the sidebar and pages as another role sees them. This only changes what's shown to you —
            your actions still use your real Admin permissions underneath.
          </p>

          <div className="space-y-2">
            {[
              { value: "", label: "Admin (You) — no preview" },
              { value: "Owner", label: "Owner" },
              { value: "Supervisor", label: "Supervisor" },
              { value: "Driver", label: "Driver" },
            ].map((opt) => {
              const checked = (previewRole || "") === opt.value;
              return (
                <label
                  key={opt.value || "off"}
                  className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors ${
                    checked
                      ? isDark ? "border-[#4FC3F7] bg-[#4FC3F7]/10" : "border-arl-dark bg-arl-dark/5"
                      : isDark ? "border-[#4FC3F7]/20" : "border-gray-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="previewRole"
                    checked={checked}
                    onChange={() => setPreviewRole(opt.value || null)}
                    className="accent-arl-dark"
                  />
                  <span className={`text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* SECURITY — Change Password (moved here from the old Settings page) */}
      <div className={`${card} px-6 py-4 space-y-4`}>
        <h2 className={`font-semibold text-sm flex items-center gap-2 ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>
          <IconLock className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} /> Security
        </h2>
        {pwNotice && (
          <div className={`rounded-xl border px-4 py-2.5 text-sm ${
            pwNotice.type === "success"
              ? isDark ? "bg-[#1A5F7A] text-[#4FC3F7] border-[#4FC3F7]/30" : "bg-green-50 text-green-700 border-green-200"
              : "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/30"
          }`}>{pwNotice.msg}</div>
        )}
        <PasswordInput label="Current Password"     value={currentPassword} onChange={setCurrentPassword} isDark={isDark} />
        <PasswordInput label="New Password"         value={newPassword}     onChange={setNewPassword}     isDark={isDark} />
        <PasswordInput label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} isDark={isDark} />
        <button onClick={handleChangePassword} disabled={changingPw}
          className={`w-full px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-all ${
            isDark
              ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]"
              : "bg-arl-dark hover:opacity-90 text-white"
          }`}>
          {changingPw ? "Changing Password…" : "Change Password"}
        </button>
      </div>

      {/* ACTIONS */}
      <div className={`${card} px-6 py-4`}>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-red-500 text-sm font-semibold hover:text-red-600 transition-colors"
        >
          <IconLogout className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      {showEdit && profile && (
        <EditProfileModal
          current={profile}
          canEditDirectly={canEditDirectly}
          pendingRequest={allProfileReqs.find(r => r.status === "pending") || null}
          onClose={() => { setShowEdit(false); fetchProfile(); }}
          onSaved={(result) => {
            setShowEdit(false);
            setNotice(result);
            fetchProfile();
            setTimeout(() => setNotice(null), 5000);
          }}
          onCancelledRequest={fetchProfile}
        />
      )}

      {showResubmit && profile && (
        <ResubmitIdModal
          current={profile}
          onClose={() => setShowResubmit(false)}
          onSubmitted={() => {
            setShowResubmit(false);
            setNotice({ submitted: true, idResubmit: true });
            fetchProfile();
            setTimeout(() => setNotice(null), 5000);
          }}
        />
      )}

    </div>
  );
}