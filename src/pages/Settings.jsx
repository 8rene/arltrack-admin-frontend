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
  const [stagedCurrency,      setStagedCurrency]      = useState(null);
  const [stagedNotifications, setStagedNotifications] = useState(null);
  const [stagedDark,          setStagedDark]          = useState(null);

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
      if (stagedCurrency !== null && stagedCurrency !== currency) {
        setCurrency(stagedCurrency);
      }
      if (stagedDark !== null && stagedDark !== isDark) {
        toggleDark();
      }
      const notifValue = stagedNotifications !== null ? stagedNotifications : savedNotifications;
      localStorage.setItem("notifications", notifValue ? "true" : "false");

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
    <div className={`w-full px-4 space-y-5 ${isDark ? "dark" : ""}`}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success"
            ? isDark
              ? "bg-[#1A5F7A] text-[#4FC3F7] border border-[#4FC3F7]/30"
              : "bg-green-50 text-green-700 border border-green-200"
            : "bg-[#D32F2F]/10 text-[#D32F2F] border border-[#D32F2F]/30"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>Settings</h1>
        <p className={`text-xs mt-0.5 ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>
          Manage your account and system preferences
        </p>
      </div>

      {/* ── Unsaved Changes Banner ── */}
      {hasUnsaved && (
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm border ${
          isDark
            ? "bg-[#1A5F7A]/40 border-[#4FC3F7]/30 text-[#4FC3F7]"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          <span className="font-medium">
            ⚠️ You have unsaved changes — click <strong>Save Preferences</strong> to apply them.
          </span>
          <button
            onClick={handleDiscard}
            className={`ml-4 text-xs underline shrink-0 ${
              isDark ? "text-[#4FC3F7]/70 hover:text-[#4FC3F7]" : "text-amber-500 hover:text-amber-700"
            }`}
          >
            Discard
          </button>
        </div>
      )}

      {/* ── PROFILE ── */}
      <div className={`rounded-2xl border p-6 space-y-4 ${
        isDark
          ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
          : "bg-white border-gray-100 shadow-soft"
      }`}>
        <h2 className={`font-semibold text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>👤 Profile</h2>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className={`h-10 rounded-xl animate-pulse ${isDark ? "bg-[#212121]/50" : "bg-gray-100"}`} />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <ReadOnly label="Display Name" value={displayName} isDark={isDark} />
            <ReadOnly label="Username"     value={profile.username} isDark={isDark} />
            <Locked   label="Email"        value={profile.email} isDark={isDark} />
            <Locked   label="Role"         value={profile.role} isDark={isDark} />
          </div>
        )}
      </div>

      {/* ── CURRENCY ── */}
      <div className={`rounded-2xl border p-6 space-y-4 ${
        isDark
          ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
          : "bg-white border-gray-100 shadow-soft"
      }`}>
        <div className="flex items-center justify-between">
          <h2 className={`font-semibold text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>💱 Currency</h2>
          {stagedCurrency !== null && stagedCurrency !== currency && (
            <span className={`text-xs font-medium ${isDark ? "text-[#4FC3F7]" : "text-amber-500"}`}>Unsaved</span>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          {SUPPORTED_CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => setStagedCurrency(c)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                activeCurrency === c
                  ? isDark
                    ? "bg-[#4FC3F7] text-[#212121] border-[#4FC3F7]"
                    : "bg-arl-dark text-white border-arl-dark"
                  : isDark
                    ? "bg-[#212121]/40 text-[#F5F5F5]/80 border-[#4FC3F7]/20 hover:border-[#4FC3F7]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-arl-dark"
              }`}
            >
              {SYMBOLS[c]} {c}
            </button>
          ))}
        </div>

        {/* Live rate info */}
        <div className={`rounded-xl p-4 space-y-2 ${isDark ? "bg-[#212121]/40" : "bg-gray-50"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
            Live Exchange Rates (base: PHP)
          </p>
          {ratesLoading ? (
            <p className={`text-xs animate-pulse ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
              Fetching live rates…
            </p>
          ) : (
            <div className="flex gap-6 flex-wrap">
              <p className={`text-xs ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>
                <span className="font-semibold">1 PHP</span> ={" "}
                <span className={`font-semibold ${isDark ? "text-[#4FC3F7]" : "text-blue-600"}`}>
                  {rates.USD ? `$${rates.USD.toFixed(4)}` : "—"} USD
                </span>
              </p>
              <p className={`text-xs ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>
                <span className="font-semibold">1 PHP</span> ={" "}
                <span className={`font-semibold ${isDark ? "text-[#4FC3F7]" : "text-purple-600"}`}>
                  {rates.EUR ? `€${rates.EUR.toFixed(4)}` : "—"} EUR
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Conversion preview */}
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
            Preview ({activeCurrency})
          </p>
          <div className="flex gap-3 flex-wrap">
            {previewAmounts.map((amt) => (
              <div key={amt} className={`rounded-xl px-4 py-2 text-center ${isDark ? "bg-[#212121]/40" : "bg-gray-50"}`}>
                <p className={`text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
                  ₱{amt.toLocaleString()}
                </p>
                <p className={`text-sm font-bold ${isDark ? "text-[#4FC3F7]" : "text-arl-dark"}`}>
                  {convertFromPHP(amt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── NOTIFICATIONS ── */}
      <div className={`rounded-2xl border p-6 space-y-4 ${
        isDark
          ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
          : "bg-white border-gray-100 shadow-soft"
      }`}>
        <div className="flex items-center justify-between">
          <h2 className={`font-semibold text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>🔔 Notifications</h2>
          {stagedNotifications !== null && stagedNotifications !== savedNotifications && (
            <span className={`text-xs font-medium ${isDark ? "text-[#4FC3F7]" : "text-amber-500"}`}>Unsaved</span>
          )}
        </div>
        <Toggle
          label="Enable Notifications"
          checked={activeNotifications}
          onChange={(val) => setStagedNotifications(val)}
          isDark={isDark}
        />
      </div>

      {/* ── APPEARANCE ── */}
      <div className={`rounded-2xl border p-6 space-y-4 ${
        isDark
          ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
          : "bg-white border-gray-100 shadow-soft"
      }`}>
        <div className="flex items-center justify-between">
          <h2 className={`font-semibold text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>🎨 Appearance</h2>
          {stagedDark !== null && stagedDark !== isDark && (
            <span className={`text-xs font-medium ${isDark ? "text-[#4FC3F7]" : "text-amber-500"}`}>Unsaved</span>
          )}
        </div>
        <Toggle
          label="Dark Mode"
          checked={activeDark}
          onChange={(val) => setStagedDark(val)}
          isDark={isDark}
        />
      </div>

      {/* ── SECURITY ── */}
      <div className={`rounded-2xl border p-6 space-y-4 ${
        isDark
          ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
          : "bg-white border-gray-100 shadow-soft"
      }`}>
        <h2 className={`font-semibold text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>🔐 Security</h2>
        <PasswordInput label="Current Password"     value={currentPassword} onChange={setCurrentPassword} isDark={isDark} />
        <PasswordInput label="New Password"         value={newPassword}     onChange={setNewPassword} isDark={isDark} />
        <PasswordInput label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} isDark={isDark} />
        <button
          onClick={handleChangePassword}
          disabled={changingPw}
          className={`w-full px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-all ${
            isDark
              ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]"
              : "bg-arl-dark hover:opacity-90 text-white"
          }`}
        >
          {changingPw ? "Changing Password…" : "Change Password"}
        </button>
      </div>

      {/* ── Save / Discard footer ── */}
      <div className="flex justify-end gap-3 pb-4">
        {hasUnsaved && (
          <button
            onClick={handleDiscard}
            className={`border px-6 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isDark
                ? "border-[#4FC3F7]/30 text-[#F5F5F5]/60 hover:bg-[#4FC3F7]/10"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            Discard Changes
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-all ${
            isDark
              ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]"
              : "bg-arl-dark hover:opacity-90 text-white"
          }`}
        >
          {saving ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function ReadOnly({ label, value, isDark }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
        {label}
      </label>
      <div className={`border rounded-xl px-3 py-2 text-sm ${
        isDark
          ? "border-[#4FC3F7]/20 bg-[#212121]/40 text-[#F5F5F5]"
          : "border-gray-200 bg-white text-gray-800"
      }`}>
        {value || "—"}
      </div>
    </div>
  );
}

function Locked({ label, value, isDark }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1 ${
        isDark ? "text-[#F5F5F5]/40" : "text-gray-400"
      }`}>
        {label} <span className={isDark ? "text-[#F5F5F5]/20" : "text-gray-300"}>🔒</span>
      </label>
      <div className={`border rounded-xl px-3 py-2 text-sm cursor-not-allowed select-none ${
        isDark
          ? "border-[#4FC3F7]/10 bg-[#212121]/60 text-[#F5F5F5]/30"
          : "border-gray-100 bg-gray-50 text-gray-400"
      }`}>
        {value || "—"}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, isDark }) {
  return (
    <div className={`flex items-center justify-between border rounded-xl px-4 py-3 ${
      isDark ? "border-[#4FC3F7]/20" : "border-gray-100"
    }`}>
      <span className={`text-sm ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
          checked
            ? isDark ? "bg-[#4FC3F7]" : "bg-arl-dark"
            : isDark ? "bg-[#212121]" : "bg-gray-300"
        }`}
      >
        <div className={`w-4 h-4 rounded-full shadow transform transition-transform ${
          checked ? "translate-x-6" : ""
        } ${isDark ? (checked ? "bg-[#212121]" : "bg-[#F5F5F5]/40") : "bg-white"}`} />
      </button>
    </div>
  );
}

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
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${
            isDark ? "text-[#F5F5F5]/30 hover:text-[#4FC3F7]" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
