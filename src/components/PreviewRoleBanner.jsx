import { useAuth } from "../context/AuthContext";

// Persistent, impossible-to-miss strip shown whenever an Admin has an
// active "view as" preview (set from Account.jsx → "View System As").
// Renders nothing at all for anyone not previewing — including every
// non-Admin role, since previewRole can only ever be set by a real Admin
// (enforced in AuthContext.jsx's setPreviewRole).
//
// This is a REMINDER, not a security boundary: the sidebar/pages you see
// change to match the previewed role, but real API calls still run under
// your actual Admin permissions — see the note in AuthContext.jsx.
export default function PreviewRoleBanner() {
  const { user, previewRole, setPreviewRole } = useAuth();

  if (!user || user.role !== "Admin" || !previewRole) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium bg-amber-400 text-amber-950">
      <span>
        Previewing as <strong>{previewRole}</strong> — sidebar and pages reflect what that role sees. Your real actions still use your Admin permissions.
      </span>
      <button
        onClick={() => setPreviewRole(null)}
        className="px-3 py-1 rounded-lg bg-amber-950 text-amber-50 text-xs font-semibold hover:bg-amber-900 transition-colors"
      >
        Exit Preview
      </button>
    </div>
  );
}