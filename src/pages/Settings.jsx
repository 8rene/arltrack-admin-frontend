import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useTheme } from "../context/ThemeContext";
import { auth } from "../fireabase";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";

const SUPPORTED_CURRENCIES = ["PHP", "USD", "EUR"];

export default function Settings() {
  const { user } = useAuth();
  const token = localStorage.getItem("token");

  const [profile, setProfile] = useState({ username: "", email: "", role: "", firstName: "", lastName: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(null);

  const { currency, setCurrency, rates, ratesLoading, SYMBOLS } = useCurrency();
  const { isDark, toggleDark } = useTheme();

  // ── Staged (unsaved) preferences ──────────────────────────────────
  const [stagedCurrency,      setStagedCurrency]      = useState(null); // null = not changed yet
  const [stagedNotifications, setStagedNotifications] = useState(null);
  const [stagedDark,          setStagedDark]          = useState(null);

  // Resolved display values (staged overrides applied if set)
  const [savedNotifications] = useState(
    () => localStorage.getItem("notifications") !== "false"
  );

  const activeCurrency      = stagedCurrency      !== null ? stagedCurrency      : currency;
  const activeNotifications = stagedNotifications !== null ? stagedNotifications : savedNotifications;
  const activeDark          = stagedDark          !== null ? stagedDark          : isDark;

  const hasUnsaved =
    (stagedCurrency      !== null && stagedCurrency      !== currency) ||
    (stagedNotifications !== null && stagedNotifications !== savedNotifications) ||
    (stagedDark          !== null && stagedDark          !== isDark);

  // ── Password fields ───────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw,      setChangingPw]      = useState(false);

  // ── Toast helper ─────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load profile ─────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const userRes = await fetch(`${process.env.REACT_APP_API_URL}/api/users/by-uid/${user.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await userRes.json();
      const u = userData?.data || {};

      const detailRes = await fetch(`${process.env.REACT_APP_API_URL}/api/users/details/${user.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const detailData = await detailRes.json();
      const d = detailData?.data || {};

      setProfile({
        username:  u.username  || u.email || "—",
        email:     u.email     || "—",
        role:      u.role      || u.roleName || "—",
        firstName: d.firstName || "",
        lastName:  d.lastName  || "",
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, token]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // ── Discard staged changes ───────────────────────────────────────
  const handleDiscard = () => {
    setStagedCurrency(null);
    setStagedNotifications(null);
    setStagedDark(null);
    showToast("Changes discarded.");
  };

  // ── Save all preferences ─────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      // Apply currency
      if (stagedCurrency !== null && stagedCurrency !== currency) {
        setCurrency(stagedCurrency);
      }
      // Apply dark mode
      if (stagedDark !== null && stagedDark !== isDark) {
        toggleDark(); // toggles to match stagedDark
      }
      // Persist notifications
      const notifValue = stagedNotifications !== null ? stagedNotifications : savedNotifications;
      localStorage.setItem("notifications", notifValue ? "true" : "false");

      // Clear staged state
      setStagedCurrency(null);
      setStagedNotifications(null);
      setStagedDark(null);

      showToast("Preferences saved.");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Change Password ──────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword || !currentPassword) {
      showToast("Please fill in all password fields.", "error"); return;
    }
    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters.", "error"); return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match.", "error"); return;
    }
    setChangingPw(true);
    try {
      const firebaseUser = auth.currentUser;
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password changed successfully.");
    } catch (e) {
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        showToast("Current password is incorrect.", "error");
      } else {
        showToast(e.message, "error");
      }
    } finally {
      setChangingPw(false);
    }
  };

  // ── Derived values ───────────────────────────────────────────────
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.username || "—";

  const previewAmounts = [100, 1000, 5000];
  const convertFromPHP = (php) => {
    if (activeCurrency === "PHP") return `₱${php.toLocaleString("en-PH")}`;
    const rate = rates[activeCurrency];
    if (!rate) return "—";
    return `${SYMBOLS[activeCurrency]}${Number((php * rate).toFixed(2)).toLocaleString()}`;
  };

  return (
    <div className="w-full px-4 space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-arl-dark">Settings</h1>
        <p className="text-xs text-gray-400 mt-0.5">Manage your account and system preferences</p>
      </div>

      {/* ── Unsaved Changes Banner ── */}
      {hasUnsaved && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          <span className="text-amber-700 font-medium">⚠️ You have unsaved changes — click <strong>Save Preferences</strong> to apply them.</span>
          <button
            onClick={handleDiscard}
            className="ml-4 text-amber-500 hover:text-amber-700 text-xs underline shrink-0"
          >
            Discard
          </button>
        </div>
      )}

      {/* ── PROFILE ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-soft space-y-4">
        <h2 className="font-semibold text-gray-700 text-sm">👤 Profile</h2>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <ReadOnly label="Display Name" value={displayName} />
            <ReadOnly label="Username"     value={profile.username} />
            <Locked   label="Email"        value={profile.email} />
            <Locked   label="Role"         value={profile.role} />
          </div>
        )}
      </div>

      {/* ── CURRENCY ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm">💱 Currency</h2>
          {stagedCurrency !== null && stagedCurrency !== currency && (
            <span className="text-xs text-amber-500 font-medium">Unsaved</span>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          {SUPPORTED_CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => setStagedCurrency(c)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                activeCurrency === c
                  ? "bg-arl-dark text-white border-arl-dark"
                  : "bg-white text-gray-600 border-gray-200 hover:border-arl-dark"
              }`}
            >
              {SYMBOLS[c]} {c}
            </button>
          ))}
        </div>

        {/* Live rate info */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live Exchange Rates (base: PHP)</p>
          {ratesLoading ? (
            <p className="text-xs text-gray-400 animate-pulse">Fetching live rates…</p>
          ) : (
            <div className="flex gap-6 flex-wrap">
              <p className="text-xs text-gray-600">
                <span className="font-semibold">1 PHP</span> = <span className="font-semibold text-blue-600">{rates.USD ? `$${rates.USD.toFixed(4)}` : "—"} USD</span>
              </p>
              <p className="text-xs text-gray-600">
                <span className="font-semibold">1 PHP</span> = <span className="font-semibold text-purple-600">{rates.EUR ? `€${rates.EUR.toFixed(4)}` : "—"} EUR</span>
              </p>
            </div>
          )}
        </div>

        {/* Conversion preview — uses staged currency */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Preview ({activeCurrency})</p>
          <div className="flex gap-3 flex-wrap">
            {previewAmounts.map((amt) => (
              <div key={amt} className="bg-gray-50 rounded-xl px-4 py-2 text-center">
                <p className="text-xs text-gray-400">₱{amt.toLocaleString()}</p>
                <p className="text-sm font-bold text-arl-dark">{convertFromPHP(amt)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── NOTIFICATIONS ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm">🔔 Notifications</h2>
          {stagedNotifications !== null && stagedNotifications !== savedNotifications && (
            <span className="text-xs text-amber-500 font-medium">Unsaved</span>
          )}
        </div>
        <Toggle
          label="Enable Notifications"
          checked={activeNotifications}
          onChange={(val) => setStagedNotifications(val)}
        />
      </div>

      {/* ── APPEARANCE ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm">🎨 Appearance</h2>
          {stagedDark !== null && stagedDark !== isDark && (
            <span className="text-xs text-amber-500 font-medium">Unsaved</span>
          )}
        </div>
        <Toggle
          label="Dark Mode"
          checked={activeDark}
          onChange={(val) => setStagedDark(val)}
        />
      </div>

      {/* ── SECURITY ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-soft space-y-4">
        <h2 className="font-semibold text-gray-700 text-sm">🔐 Security</h2>
        <PasswordInput label="Current Password"     value={currentPassword} onChange={setCurrentPassword} />
        <PasswordInput label="New Password"         value={newPassword}     onChange={setNewPassword} />
        <PasswordInput label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} />
        <button
          onClick={handleChangePassword}
          disabled={changingPw}
          className="w-full bg-arl-dark hover:opacity-90 text-white px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-opacity"
        >
          {changingPw ? "Changing Password…" : "Change Password"}
        </button>
      </div>

      {/* ── Save / Discard footer ── */}
      <div className="flex justify-end gap-3 pb-4">
        {hasUnsaved && (
          <button
            onClick={handleDiscard}
            className="border border-gray-200 text-gray-500 hover:bg-gray-50 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Discard Changes
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-arl-dark hover:opacity-90 text-white px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-opacity"
        >
          {saving ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function ReadOnly({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
      <div className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white">
        {value || "—"}
      </div>
    </div>
  );
}

function Locked({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
        {label} <span className="text-gray-300">🔒</span>
      </label>
      <div className="border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-400 bg-gray-50 cursor-not-allowed select-none">
        {value || "—"}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${checked ? "bg-arl-dark" : "bg-gray-300"}`}
      >
        <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${checked ? "translate-x-6" : ""}`} />
      </button>
    </div>
  );
}

function PasswordInput({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-arl-light outline-none pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs hover:text-gray-600"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
