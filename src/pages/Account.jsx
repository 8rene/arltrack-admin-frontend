import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc, getDoc, collection, query, where, getDocs,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../fireabase";
import { useAuth } from "../context/AuthContext";

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

const IconClose = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/* ── Detail row ── */
function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-gray-50 last:border-0">
      <div className="w-9 h-9 rounded-full bg-arl-light flex items-center justify-center text-arl-primary shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-arl-dark truncate">{value || "—"}</p>
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
  { key: "barangay",     label: "Barangay",     source: "userAddress" },
  { key: "municipality", label: "Municipality", source: "userAddress" },
  { key: "city",         label: "City",         source: "userAddress" },
  { key: "province",     label: "Province",     source: "userAddress" },
  { key: "postalCode",   label: "Postal Code",  source: "userAddress" },
  { key: "village",      label: "Village",      source: "userAddress" },
  { key: "zipCode",      label: "Zip Code",     source: "userAddress" },
];

/* ── Edit Profile Modal ── */
function EditProfileModal({ current, canEditDirectly, pendingRequest, onClose, onSaved, onCancelledRequest }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(EDITABLE_FIELDS.map(f => [f.key, current[f.key] || ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Local copy so cancelling flips this modal straight into the edit form
  // without needing to close/reopen it.
  const [activePending, setActivePending] = useState(pendingRequest);

  const handleChange = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  // Routed through the backend now instead of a direct Firestore
  // updateDoc/addDoc — same reasoning as ResubmitIdModal's authedFetch:
  // this bypassed audit logging and (for the direct-apply path) the
  // server-side role check entirely.
  const authedFetch = async (method, path, body) => {
    const res = await fetch(`${process.env.REACT_APP_API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Request failed.");
    return json;
  };

  const handleCancelRequest = async () => {
    if (!activePending) return;
    setCancelling(true);
    try {
      await authedFetch("PATCH", `/api/profile/edit-requests/${activePending.id}/cancel`);
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
        // Owner/Admin: applies straight to the underlying docs server-side,
        // no approval needed. Only send fields that actually changed —
        // mirrors the old direct-Firestore branch's behavior.
        const changedFields = EDITABLE_FIELDS
          .filter(f => form[f.key] !== (current[f.key] || ""))
          .map(f => ({ field: f.key, collection: f.source, newValue: form[f.key] || "" }));

        if (!changedFields.length) {
          onClose();
          return;
        }

        await authedFetch("PUT", "/api/profile/fields", { changes: changedFields });
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

        await authedFetch("POST", "/api/profile/edit-requests", { role: current.role, changes });
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

              <div className="grid grid-cols-2 gap-4">
                {EDITABLE_FIELDS.map(f => (
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

/* ── Resubmit ID Modal — upload a new license or document photo ──
   documentKind: "license" | "document". For Driver/Supervisor
   (canEditDirectly=false) this submits to idResubmitRequests for admin
   review. For Owner/Admin (canEditDirectly=true) it applies immediately
   via the direct-apply endpoint, no review step — matching the same
   trust boundary EditProfileModal already uses for basic fields.
   Routed through the backend now instead of a direct Firestore
   addDoc/updateDoc — that bypassed audit logging and (for license) the
   required-expiry rule entirely. */
function ResubmitIdModal({ current, documentKind, canEditDirectly, onClose, onSubmitted }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [expiry, setExpiry]   = useState("");
  const [docType, setDocType]     = useState(current.documentType || "");
  const [docNumber, setDocNumber] = useState(current.documentNumber || "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  const isLicense = documentKind === "license";
  const currentUrl = isLicense ? current.driverLicenseUrl : current.documentImageUrl;

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const authedFetch = async (path, body) => {
    const res = await fetch(`${process.env.REACT_APP_API_URL}${path}`, {
      method: canEditDirectly ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Request failed.");
    return json;
  };

  const handleSubmit = async () => {
    if (!file) { setError(`Please choose a photo of your ${isLicense ? "license" : "document"} first.`); return; }
    if (canEditDirectly && isLicense && !expiry) { setError("Please enter the expiry date shown on the card."); return; }
    if (!isLicense && (!docType.trim() || !docNumber.trim())) { setError("Please fill in the document type and number shown on the card."); return; }
    setSaving(true);
    setError(null);
    try {
      const path = `${isLicense ? "driverLicenseResubmit" : "documentResubmit"}/${current.uid}_${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const newUrl = await getDownloadURL(storageRef);

      if (canEditDirectly) {
        // Owner/Admin — applies immediately, no review step.
        await authedFetch("/api/profile/document", {
          documentKind,
          newUrl,
          ...(isLicense ? { driverLicenseExpiry: expiry } : { documentType: docType.trim(), documentNumber: docNumber.trim() }),
        });
      } else {
        // Driver/Supervisor — goes to admin for review; expiry (for
        // license) gets entered by the reviewer, not here. Document
        // type/number are typed here at submission — same as the
        // original signup flow — and carried straight through on
        // approval, since there's no per-card verification concept for
        // these two fields the way there is for a license's expiry date.
        await authedFetch("/api/profile/id-resubmit-requests", {
          documentKind,
          currentUrl: currentUrl || "",
          newUrl,
          ...(isLicense ? {} : { documentType: docType.trim(), documentNumber: docNumber.trim() }),
        });
      }
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
          <h2 className="font-bold text-lg text-gray-800">Resubmit {isLicense ? "Driver's License" : "Document"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><IconClose /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            {canEditDirectly
              ? `Upload a clear photo of your updated ${isLicense ? "(renewed) driver's license" : "document"}. This applies to your account immediately.`
              : `Upload a clear photo of your updated ${isLicense ? "(renewed) driver's license" : "document"}. An admin will review it${isLicense ? " and confirm the new expiry date" : ""} before it's applied to your account.`}
          </p>

          {currentUrl && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Current on file</p>
              <img src={currentUrl} alt={`Current ${isLicense ? "license" : "document"}`} className="w-full h-32 object-cover rounded-xl border" />
            </div>
          )}

          <label className="block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer hover:bg-gray-50">
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            {preview ? (
              <img src={preview} alt="New photo preview" className="w-full h-32 object-cover rounded-lg mx-auto" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400 py-4">
                <IconUpload className="w-6 h-6" />
                <span className="text-sm">Tap to choose a photo</span>
              </div>
            )}
          </label>

          {canEditDirectly && isLicense && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                License Expiry Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full text-sm border rounded-lg px-3 py-1.5"
              />
            </div>
          )}

          {!isLicense && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Document Type <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  placeholder="e.g. Passport"
                  className="w-full text-sm border rounded-lg px-3 py-1.5"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Document Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-1.5"
                />
              </div>
            </div>
          )}

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
              {saving ? "Uploading..." : canEditDirectly ? "Save" : "Submit for Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared by every role (Owner, Admin, Supervisor, Driver).
export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState(null); // merged user + userDetails + userAddress
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showResubmit, setShowResubmit] = useState(null); // null | "license" | "document"
  const [notice, setNotice] = useState(null);
  const [profileTab, setProfileTab] = useState("details"); // "details" | "document"

  const [pendingProfileReq, setPendingProfileReq] = useState(false);
  const [pendingIdReq, setPendingIdReq]           = useState(false);
  const [allProfileReqs, setAllProfileReqs]       = useState([]);

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

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">

      {notice && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.submitted ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700"}`}>
          {notice.submitted
            ? notice.idResubmit
              ? `Your new ${notice.documentKind === "document" ? "document" : "license"} photo was submitted and is pending admin review.`
              : "Your edit request was submitted and is pending admin approval."
            : "Your profile was updated."}
        </div>
      )}

      {/* HEADER CARD */}
      <div className="bg-white rounded-2xl border shadow-card overflow-hidden">
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
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${profileTab === "details" ? "bg-teal-600 text-white shadow" : "bg-gray-50 border text-gray-600 hover:bg-gray-100"}`}>
            Details
          </button>
          <button onClick={() => setProfileTab("document")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${profileTab === "document" ? "bg-teal-600 text-white shadow" : "bg-gray-50 border text-gray-600 hover:bg-gray-100"}`}>
            Document
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : profileTab === "details" ? (
          <div className="px-6 py-2">
            {/* BADGES — sits right before Email, inside the Details panel */}
            {(pendingProfileReq || pendingIdReq || licenseExpiringSoon || licenseExpired) && (
              <div className="flex flex-wrap gap-2 py-3.5 border-b border-gray-50">
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
                    onClick={() => setShowResubmit("license")}
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

            <DetailRow icon={<IconMail />}        label="Email"    value={user.email} />
            <DetailRow icon={<IconPhone />}       label="Phone"    value={profile?.phone} />
            <DetailRow icon={<IconUser />}        label="Full Name" value={fullName} />
            <DetailRow icon={<IconHome />}        label="Address"
              value={[profile?.street, profile?.barangay, profile?.city, profile?.province].filter(Boolean).join(", ")} />
            <DetailRow icon={<IconShield />}      label="Role"     value={user.role} />
          </div>
        ) : (
          <div className="px-6 py-4 space-y-5">
            {!tracksLicense && !profile?.documentImageUrl && !profile?.driverLicenseUrl ? (
              <p className="text-sm text-gray-400 text-center py-6">No documents on file.</p>
            ) : (
              <>
                {tracksLicense && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-semibold text-gray-400 uppercase">Driver's License</p>
                      <button
                        onClick={() => setShowResubmit("license")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700"
                      >
                        <IconEdit className="w-3.5 h-3.5" />
                        Resubmit
                      </button>
                    </div>
                    {profile?.driverLicenseUrl ? (
                      <img src={profile.driverLicenseUrl} alt="Driver's License" className="w-full h-48 object-cover rounded-xl border" />
                    ) : (
                      <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No license photo on file yet.</p>
                    )}
                    <DetailRow
                      icon={<IconWarning />}
                      label="Expiry Date"
                      value={expiryDate ? expiryDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Not set — pending admin review"}
                    />
                  </div>
                )}

                {/* Document (government ID etc.) — was display-only with no
                    resubmit path at all; fixed governmentIdUrl (a field
                    nothing ever wrote) to the actual documentImageUrl field.
                    No expiry tracking here by design — see earlier decision;
                    that's scoped to the driver's license only. */}
                {(profile?.documentImageUrl || profile?.documentType) && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-semibold text-gray-400 uppercase">Valid ID</p>
                      <button
                        onClick={() => setShowResubmit("document")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700"
                      >
                        <IconEdit className="w-3.5 h-3.5" />
                        Resubmit
                      </button>
                    </div>
                    {profile?.documentImageUrl ? (
                      <img src={profile.documentImageUrl} alt="Valid ID" className="w-full h-48 object-cover rounded-xl border" />
                    ) : (
                      <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No ID photo on file yet.</p>
                    )}
                    <DetailRow icon={<IconUser />} label="ID Type"   value={profile.documentType} />
                    <DetailRow icon={<IconUser />} label="ID Number" value={profile.documentNumber} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="bg-white rounded-2xl border shadow-card px-6 py-4">
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
          documentKind={showResubmit}
          canEditDirectly={canEditDirectly}
          onClose={() => setShowResubmit(null)}
          onSubmitted={() => {
            setShowResubmit(null);
            setNotice({ submitted: !canEditDirectly, idResubmit: true, documentKind: showResubmit });
            fetchProfile();
            setTimeout(() => setNotice(null), 5000);
          }}
        />
      )}

    </div>
  );
}