import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp,
} from "firebase/firestore";
import { db } from "../fireabase";
import { useAuth } from "../context/AuthContext";

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

const IconFingerprint = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c1.5 1.5 1.5 5 0 6M8 10c2-2 6-2 8 0M6 8c3-3 9-3 12 0M4.5 6c4-4 11.5-4 15.5 0M9 15c1 1 3 1 4 0M12 3v1" />
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
function EditProfileModal({ current, canEditDirectly, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(EDITABLE_FIELDS.map(f => [f.key, current[f.key] || ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleChange = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (canEditDirectly) {
        // Owner/Admin: write straight to the underlying docs, no approval needed.
        const userFields = {};
        const detailFields = {};
        const addressFields = {};
        EDITABLE_FIELDS.forEach(f => {
          if (form[f.key] === (current[f.key] || "")) return; // unchanged
          if (f.source === "user") userFields[f.key] = form[f.key];
          if (f.source === "userDetails") detailFields[f.key] = form[f.key];
          if (f.source === "userAddress") addressFields[f.key] = form[f.key];
        });

        if (Object.keys(userFields).length) {
          await updateDoc(doc(db, "user", current.uid), { ...userFields, updatedAt: serverTimestamp() });
        }
        if (Object.keys(detailFields).length) {
          if (current._detailsDocId) {
            await updateDoc(doc(db, "userDetails", current._detailsDocId), { ...detailFields, updatedAt: serverTimestamp() });
          } else {
            await addDoc(collection(db, "userDetails"), { userID: current.uid, ...detailFields, createdAt: serverTimestamp() });
          }
        }
        if (Object.keys(addressFields).length) {
          if (current._addressDocId) {
            await updateDoc(doc(db, "userAddress", current._addressDocId), { ...addressFields, updatedAt: serverTimestamp() });
          } else {
            await addDoc(collection(db, "userAddress"), { userID: current.uid, ...addressFields, createdAt: serverTimestamp() });
          }
        }
        onSaved({ submitted: false });
      } else {
        // Everyone else: submit an edit request for an admin to review,
        // instead of writing directly. Only include fields that actually changed.
        const changes = EDITABLE_FIELDS
          .filter(f => form[f.key] !== (current[f.key] || ""))
          .map(f => ({
            field: f.key,
            label: f.label,
            collection: f.source,
            oldValue: current[f.key] || "",
            newValue: form[f.key],
          }));

        if (changes.length === 0) {
          onClose();
          return;
        }

        await addDoc(collection(db, "editRequests"), {
          userID: current.uid,
          role: current.role,
          status: "pending",
          changes,
          requestedBy: current.uid,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
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
  const [notice, setNotice] = useState(null);

  const canEditDirectly = user?.role === "Owner" || user?.role === "Admin";

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [userSnap, detailsSnap, addressSnap] = await Promise.all([
        getDoc(doc(db, "user", user.uid)),
        getDocs(query(collection(db, "userDetails"), where("userID", "==", user.uid))),
        getDocs(query(collection(db, "userAddress"), where("userID", "==", user.uid))),
      ]);

      const userData    = userSnap.exists() ? userSnap.data() : {};
      const detailsDoc   = detailsSnap.docs[0];
      const addressDoc   = addressSnap.docs[0];

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
        _detailsDocId: detailsDoc?.id || null,
        _addressDocId: addressDoc?.id || null,
      });
    } catch (e) {
      console.error("Profile fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

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
            ? "Your edit request was submitted and is pending admin approval."
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

        {/* DETAILS */}
        {loading ? (
          <div className="px-6 py-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="px-6 py-2">
            <DetailRow icon={<IconMail />}        label="Email"    value={user.email} />
            <DetailRow icon={<IconPhone />}       label="Phone"    value={profile?.phone} />
            <DetailRow icon={<IconUser />}        label="Full Name" value={fullName} />
            <DetailRow icon={<IconHome />}        label="Address"
              value={[profile?.street, profile?.barangay, profile?.city, profile?.province].filter(Boolean).join(", ")} />
            <DetailRow icon={<IconShield />}      label="Role"     value={user.role} />
            <DetailRow icon={<IconFingerprint />} label="User ID"  value={user.uid} />
          </div>
        )}

        <div className="px-6 pb-4 pt-1">
          <p className="text-xs text-gray-300">Connected to Firebase Auth + JWT</p>
        </div>
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
          onClose={() => setShowEdit(false)}
          onSaved={(result) => {
            setShowEdit(false);
            setNotice(result);
            if (!result.submitted) fetchProfile();
            setTimeout(() => setNotice(null), 5000);
          }}
        />
      )}

    </div>
  );
}