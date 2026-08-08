// Single source of truth for "which role can access which page."
//
// Both Sidebar.jsx (what's shown in the nav) and App.jsx's ProtectedRoute
// (what's actually reachable) read from this same map, so the two can't
// drift apart the way they had before — a page hidden in the sidebar is
// now guaranteed to also be blocked if someone hits the URL directly.
//
// NOTE: this only controls what's shown/reachable on the frontend. The
// backend's own role checks (middlewares/role/role.middleware.js, per
// route file) are the actual security boundary and must be kept in sync
// with this list by hand — this file does not call the backend to verify.

export const ROLES = {
  OWNER: "Owner",
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  DRIVER: "Driver",
};

const { OWNER, ADMIN, SUPERVISOR, DRIVER } = ROLES;

// path -> roles allowed to access that page.
export const PAGE_ACCESS = {
  "/dashboard": [OWNER, ADMIN, SUPERVISOR, DRIVER],
  "/bookings": [OWNER, ADMIN, SUPERVISOR],
  "/fleet": [ADMIN, SUPERVISOR],

  // "/users" (formerly Customers) manages Customers/Drivers/Supervisors/
  // Admins under one page with per-role sub-tabs. This entry must stay the
  // UNION of every tab's visibleTo in pages/Users.jsx's buildRoleTabs() —
  // ProtectedRoute only gates by pathname, it can't see individual tabs.
  // Currently: Customer tab=[Owner,Admin,Supervisor], Driver tab=[Owner,Admin,Supervisor],
  // Supervisor tab=[Owner,Admin], Admin tab=[Owner].
  "/users": [OWNER, ADMIN, SUPERVISOR],
  "/car-tracking": [OWNER, ADMIN, SUPERVISOR],
  "/gps-setup": [OWNER, ADMIN, SUPERVISOR],
  "/driver-dispatch": [OWNER, ADMIN, SUPERVISOR],
  "/maintenance": [OWNER, ADMIN, SUPERVISOR],
  "/inventory": [OWNER, ADMIN, SUPERVISOR],
  "/vehicle-documentation": [OWNER, ADMIN, SUPERVISOR, DRIVER],
  "/analytics": [OWNER, ADMIN, SUPERVISOR],
  "/payments": [OWNER, ADMIN, SUPERVISOR],
  "/refund-requests": [OWNER, ADMIN, SUPERVISOR],
  "/reports": [OWNER, ADMIN, SUPERVISOR],
  "/audit-log": [ADMIN],
  "/user-logs": [ADMIN],
  "/transaction-logs": [ADMIN],
  "/settings": [ADMIN],

  // Archives — Owner keeps access, Admin added per this round's decision.
  "/archives/user-log": [OWNER, ADMIN],
  "/archives/payments": [OWNER, ADMIN],
  "/archives/bookings": [OWNER, ADMIN],
  "/archives/transaction-log": [OWNER, ADMIN],
  "/archives/audit-log": [OWNER, ADMIN],
  "/archives/reviews": [OWNER, ADMIN],

  // Driver-only page. Trips + History are tabs on this one page now
  // (pages/MyTrips.jsx) — /my-trips/history is a redirect, not a
  // separately-gated route, see App.jsx.
  "/my-trips": [DRIVER],

  // Shared by every role.
  "/profile": [OWNER, ADMIN, SUPERVISOR, DRIVER],
};

// Where to send someone right after login, or when they land on a page
// their role can't access — the first page that IS theirs, so a Driver
// bounced off e.g. /fleet doesn't get redirected to /dashboard (which
// they also can't see) and loop.
export const HOME_PATH = {
  [OWNER]: "/dashboard",
  [ADMIN]: "/dashboard",
  [SUPERVISOR]: "/dashboard",
  [DRIVER]: "/dashboard",
};

export function canAccess(role, path) {
  const allowed = PAGE_ACCESS[path];
  if (!allowed) return true; // no rule defined for this path (e.g. /login) — not gated here
  return allowed.includes(role);
}

export function homePathFor(role) {
  return HOME_PATH[role] || "/dashboard";
}