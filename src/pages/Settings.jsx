import { useTheme } from "../context/ThemeContext";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconGear = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// System Settings — Owner & Admin only (see config/pagePermissions.js).
// Personal account preferences (password, dark mode) live on the Account
// page instead (pages/Account.jsx) since those apply to every role, not
// just Owner/Admin. This page is reserved for system-wide configuration —
// intentionally empty until there's something system-level to put here.
//
// NOTE: Car Parts (the vehicle parts catalog) intentionally does NOT
// live here — it has its own page at pages/Inventory.jsx, navigated to
// via the "Inventory" item under the System group in the sidebar. Keeping
// it separate rather than folding it into this generic Settings page.

export default function Settings() {
  const { isDark } = useTheme();

  const card = `rounded-2xl border p-10 flex flex-col items-center text-center gap-3 ${
    isDark
      ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
      : "bg-white border-gray-100 shadow-soft"
  }`;

  return (
    <div className={`w-full px-4 space-y-5 ${isDark ? "dark" : ""}`}>
      {/* Header */}
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>System Settings</h1>
        <p className={`text-xs mt-0.5 ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>
          System-wide configuration for Owner and Admin
        </p>
      </div>

      <div className={card}>
        <IconGear className={isDark ? "text-[#4FC3F7]/60 w-8 h-8" : "text-gray-300 w-8 h-8"} />
        <p className={`text-sm font-medium ${isDark ? "text-[#F5F5F5]/70" : "text-gray-500"}`}>
          No system settings configured yet.
        </p>
        <p className={`text-xs max-w-sm ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
          This page is reserved for system-wide configuration. For personal
          preferences like password and dark mode, visit the Account page.
        </p>
      </div>
    </div>
  );
}