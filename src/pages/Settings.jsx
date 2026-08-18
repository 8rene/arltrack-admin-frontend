import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import StoreLocationSettings from "../components/StoreLocationSettings";

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconPeso = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4v16M6 4h7a4 4 0 010 8H6m0 3h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconMap = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── FIELD DEFINITIONS ─────────────────────────────────────────────────────
// Keep these in sync BY HAND with backend/models/systemSettings/systemSettings.model.js
const FLAT_FEE_FIELDS = [
  { key: "serviceFee", label: "Service Fee", hint: "Flat platform/service fee, added to every booking." },
  { key: "gatewayFee", label: "Gateway Fee", hint: "Flat payment gateway fee, added to every booking." },
  { key: "depositFee", label: "Deposit Fee", hint: "Reservation deposit. Tracked separately from the total, used for the balance-on-pickup math." },
];

const AREA_FEE_FIELDS = [
  { key: "extraFeeOutsideArea", label: "Extra Fee — Outside Area", hint: "Charged when the drop-off destination is outside the base service area." },
  { key: "driversFeeBaseArea", label: "Driver's Fee — Base Area", hint: "Chauffeur fee when destination is inside the base area." },
  { key: "driversFeeOutsideArea", label: "Driver's Fee — Outside Area", hint: "Chauffeur fee when destination is outside the base area." },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
//
// System Settings — Owner & Admin only (see config/pagePermissions.js).
// Editable booking-fee configuration, backed by the systemSettings
// Firestore collection (backend/services/systemSettings/systemSettings.service.js).
// Each save writes a new doc (systemSettingsID + createdAt) rather than
// mutating one fixed doc — the form always reads back the latest one.
//
// IMPORTANT — this only changes what the ADMIN side stores. The customer
// app's booking quote (arltrack-customer-backend/utils/pricing.js) still
// reads its own hardcoded constants and has NOT been wired up to read from
// this doc yet — that's a deliberate follow-up, not an oversight, so that
// changing a number here doesn't silently start charging customers
// differently before that wiring exists.
//
// Personal account preferences (password, dark mode) live on the Account
// page instead (pages/Account.jsx) since those apply to every role, not
// just Owner/Admin.
//
// NOTE: Car Parts (the vehicle parts catalog) intentionally does NOT
// live here — it has its own page at pages/Inventory.jsx.

export default function Settings() {
  const { isDark } = useTheme();

  const [form, setForm] = useState(null);       // working copy the user is editing
  const [saved, setSaved] = useState(null);      // last-saved copy, to detect dirty state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false); // fields are read-only until "Edit" is clicked
  const [notice, setNotice] = useState(null);    // { type: "success" | "error", msg }
  const [keywordDraft, setKeywordDraft] = useState(""); // text currently being typed for the next chip
  const [areaSuggestions, setAreaSuggestions] = useState([]); // [{ id, name, type }]
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const card = `rounded-2xl border p-6 ${
    isDark
      ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]"
      : "bg-white border-gray-100 shadow-soft"
  }`;

  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
    isDark
      ? "bg-[#212121] border-[#4FC3F7]/20 text-[#F5F5F5] focus:ring-[#4FC3F7]/40"
      : "bg-white border-gray-200 text-arl-dark focus:ring-arl-dark/20"
  }`;

  // ── Load current settings ──────────────────────────────────────────────
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/settings/pricing`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load settings.");
      setForm(json.data);
      setSaved(json.data);
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to load settings." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleNumberChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Base area keyword chips ─────────────────────────────────────────
  // Normalizes to lowercase + trims — matches how pricing.js itself
  // lower-cases the destination before checking .includes(keyword), so
  // what's shown here is exactly what actually gets matched.
  //
  // Suggestions come from the real PH province/city dataset (same one the
  // customer app's address form already uses) so picking from the list is
  // guaranteed to be a correctly-spelled real place. Free typing + Enter
  // still works as a fallback for anything not in that dataset.
  const addKeywordValue = (value) => {
    const clean = value.trim().toLowerCase();
    if (!clean) return;
    setForm((prev) => {
      if ((prev.baseAreaKeywords || []).includes(clean)) return prev; // no duplicates
      return { ...prev, baseAreaKeywords: [...(prev.baseAreaKeywords || []), clean] };
    });
    setKeywordDraft("");
    setAreaSuggestions([]);
    setSuggestionsOpen(false);
  };

  const addKeyword = () => addKeywordValue(keywordDraft);

  const removeKeyword = (word) => {
    setForm((prev) => ({ ...prev, baseAreaKeywords: (prev.baseAreaKeywords || []).filter((k) => k !== word) }));
  };

  const handleKeywordInputKeyDown = (e) => {
    // Enter or comma both commit the current typed text as a chip — comma
    // because that's the muscle-memory habit the old free-text field
    // trained. Doesn't stop the dropdown suggestions from also being
    // clickable for a guaranteed-correct spelling.
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    }
    if (e.key === "Escape") {
      setSuggestionsOpen(false);
    }
  };

  // Debounced search against /api/settings/pricing/area-options as the
  // admin types, so the dropdown feels live without hammering the backend
  // on every keystroke.
  useEffect(() => {
    const q = keywordDraft.trim();
    if (!q) {
      setAreaSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    setSuggestionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/settings/pricing/area-options?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
        const json = await res.json();
        if (json.success) {
          setAreaSuggestions(json.data || []);
          setSuggestionsOpen(true);
        }
      } catch {
        // silent — free-typed Enter fallback still works if the lookup fails
      } finally {
        setSuggestionsLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [keywordDraft]);

  const arraysEqual = (a = [], b = []) => a.length === b.length && a.every((v, i) => v === b[i]);

  const isDirty = !!(form && saved) && (
    FLAT_FEE_FIELDS.concat(AREA_FEE_FIELDS).some(({ key }) => String(form[key]) !== String(saved[key])) ||
    !arraysEqual(form.baseAreaKeywords, saved.baseAreaKeywords)
  );

  // ── Save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        serviceFee: Number(form.serviceFee),
        gatewayFee: Number(form.gatewayFee),
        depositFee: Number(form.depositFee),
        extraFeeOutsideArea: Number(form.extraFeeOutsideArea),
        driversFeeBaseArea: Number(form.driversFeeBaseArea),
        driversFeeOutsideArea: Number(form.driversFeeOutsideArea),
        baseAreaKeywords: form.baseAreaKeywords || [],
      };

      for (const [key, val] of Object.entries(payload)) {
        if (typeof val === "number" && (!Number.isFinite(val) || val < 0)) {
          throw new Error(`"${key}" must be a valid number.`);
        }
      }
      if (payload.baseAreaKeywords.length === 0) {
        throw new Error("At least one base-area keyword is required.");
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/settings/pricing`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to save settings.");

      setForm(json.data);
      setSaved(json.data);
      setEditMode(false);
      setNotice({ type: "success", msg: "Pricing settings saved." });
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to save settings." });
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  const handleReset = () => {
    if (!saved) return;
    setForm(saved);
    setKeywordDraft("");
    setNotice(null);
    setEditMode(false);
  };

  return (
    <div className={`w-full px-4 space-y-5 ${isDark ? "dark" : ""}`}>
      {/* Header */}
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>System Settings</h1>
        <p className={`text-xs mt-0.5 ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>
          System-wide configuration for Owner and Admin
        </p>
      </div>

      {notice && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${
          notice.type === "success"
            ? isDark ? "bg-[#1A5F7A] text-[#4FC3F7] border-[#4FC3F7]/30" : "bg-green-50 text-green-700 border-green-200"
            : "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/30"
        }`}>
          {notice.msg}
        </div>
      )}

      <StoreLocationSettings />

      {loading || !form ? (
        <div className={card}>
          <p className={`text-sm text-center ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>Loading settings…</p>
        </div>
      ) : (
        <>
          {/* Booking Fees */}
          <div className={`${card} space-y-4`}>
            <div>
              <h2 className={`font-semibold text-sm flex items-center gap-2 ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>
                <IconPeso className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} /> Booking Fees
              </h2>
              <p className={`text-xs mt-0.5 ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
                Flat fees added to every booking, shown to the customer at checkout.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {FLAT_FEE_FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="space-y-1">
                  <label className={`text-xs font-medium ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>{label}</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>₱</span>
                    <input
                      type="number" min="0" step="1"
                      value={form[key]}
                      onChange={(e) => handleNumberChange(key, e.target.value)}
                      disabled={!editMode}
                      className={`${inputCls} pl-6`}
                    />
                  </div>
                  <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>{hint}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Area & Chauffeur Fees */}
          <div className={`${card} space-y-4`}>
            <div>
              <h2 className={`font-semibold text-sm flex items-center gap-2 ${isDark ? "text-[#F5F5F5]" : "text-gray-700"}`}>
                <IconMap className={`w-4 h-4 ${isDark ? "text-[#4FC3F7]" : "text-gray-500"}`} /> Area & Chauffeur Fees
              </h2>
              <p className={`text-xs mt-0.5 ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
                Conditional charges based on the drop-off destination and drive type.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {AREA_FEE_FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="space-y-1">
                  <label className={`text-xs font-medium ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>{label}</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>₱</span>
                    <input
                      type="number" min="0" step="1"
                      value={form[key]}
                      onChange={(e) => handleNumberChange(key, e.target.value)}
                      disabled={!editMode}
                      className={`${inputCls} pl-6`}
                    />
                  </div>
                  <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>{hint}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <label className={`text-xs font-medium ${isDark ? "text-[#F5F5F5]/70" : "text-gray-600"}`}>Base Area Keywords</label>

              {/* Existing keyword chips */}
              <div className="flex flex-wrap gap-2">
                {(form.baseAreaKeywords || []).map((word) => (
                  <span
                    key={word}
                    className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium ${
                      isDark ? "bg-[#212121] text-[#F5F5F5]/80 border border-[#4FC3F7]/20" : "bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    {word}
                    {editMode && (
                      <button
                        type="button"
                        onClick={() => removeKeyword(word)}
                        aria-label={`Remove ${word}`}
                        className={`rounded-full w-4 h-4 flex items-center justify-center leading-none ${
                          isDark ? "hover:bg-[#4FC3F7]/20 text-[#F5F5F5]/50" : "hover:bg-gray-300 text-gray-500"
                        }`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {(form.baseAreaKeywords || []).length === 0 && (
                  <span className={`text-xs italic ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>No keywords yet — add at least one below.</span>
                )}
              </div>

              {/* Add new keyword */}
              {editMode && (
              <div className="flex gap-2 relative">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={handleKeywordInputKeyDown}
                    onFocus={() => keywordDraft.trim() && setSuggestionsOpen(true)}
                    onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)} // delay so a click on a suggestion still registers
                    placeholder="Search a province or city…"
                    autoComplete="off"
                    className={inputCls}
                  />

                  {suggestionsOpen && (
                    <div className={`absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border shadow-lg ${
                      isDark ? "bg-[#212121] border-[#4FC3F7]/20" : "bg-white border-gray-200"
                    }`}>
                      {suggestionsLoading ? (
                        <p className={`px-3 py-2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>Searching…</p>
                      ) : areaSuggestions.length === 0 ? (
                        <p className={`px-3 py-2 text-xs ${isDark ? "text-[#F5F5F5]/40" : "text-gray-400"}`}>
                          No match in the PH location list — press Enter to add "{keywordDraft.trim()}" anyway.
                        </p>
                      ) : (
                        areaSuggestions.map((opt) => (
                          <button
                            key={`${opt.type}-${opt.id}`}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't close before onClick fires
                            onClick={() => addKeywordValue(opt.name)}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                              isDark ? "hover:bg-[#4FC3F7]/10 text-[#F5F5F5]" : "hover:bg-gray-50 text-arl-dark"
                            }`}
                          >
                            <span>{opt.name}</span>
                            <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${
                              isDark ? "bg-[#4FC3F7]/15 text-[#4FC3F7]" : "bg-gray-100 text-gray-500"
                            }`}>
                              {opt.type === "province" ? "Province" : "City/Municipality"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={addKeyword}
                  disabled={!keywordDraft.trim()}
                  className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg font-medium disabled:opacity-40 transition-all ${
                    isDark ? "bg-[#4FC3F7] text-[#212121] hover:bg-[#4FC3F7]/90" : "bg-arl-dark text-white hover:opacity-90"
                  }`}
                  aria-label="Add keyword"
                >
                  +
                </button>
              </div>
              )}

              <p className={`text-[11px] ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>
                Search picks a real, correctly-spelled province or city from the PH location list. A destination is still
                treated as "base area" if it <strong>contains</strong> the saved word as text — so short/common names can
                still overlap (e.g. "manila" also matches "New Manila," a Quezon City district). Picking from the list
                only prevents typos, it doesn't remove that overlap.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {editMode ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className={`px-6 py-2.5 rounded-xl shadow text-sm font-medium disabled:opacity-50 transition-all ${
                    isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-dark hover:opacity-90 text-white"
                  }`}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className={`px-6 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-50 transition-all ${
                    isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/70 hover:bg-[#212121]/40" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {isDirty ? "Discard Changes" : "Cancel"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className={`px-6 py-2.5 rounded-xl shadow text-sm font-medium transition-all ${
                  isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-dark hover:opacity-90 text-white"
                }`}
              >
                Edit Settings
              </button>
            )}
            {form.createdAt && (
              <span className={`text-[11px] ml-auto ${isDark ? "text-[#F5F5F5]/35" : "text-gray-400"}`}>
                Last updated {form.updatedBy?.name ? `by ${form.updatedBy.name}` : ""}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}