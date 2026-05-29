// Route-level keys that map to paths and sidebar items.
// Each role lists every key it is allowed to access.

export const ROLES = {
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  OWNER: "owner",
};

// Admin  → everything EXCEPT archives
// Supervisor → everything EXCEPT fleet, customers, archives
// Owner  → dashboard, bookings, fleet, customers, analytics, reports, archives, settings, notifications, profile

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    "dashboard",
    "bookings",
    "fleet",
    "customers",
    "gps",
    "maintenance",
    "inventory",
    "vehicle-documentation",
    "analytics",
    "payments",
    "reports",
    "audit-log",
    "user-logs",
    "transaction-logs",
    "settings",
    // NO archives
  ],

  [ROLES.SUPERVISOR]: [
    "dashboard",
    "bookings",
    // NO fleet
    // NO customers
    "gps",
    "maintenance",
    "inventory",
    "vehicle-documentation",
    "analytics",
    "payments",
    "reports",
    "audit-log",
    "user-logs",
    "transaction-logs",
    "settings",
    // NO archives
  ],

  [ROLES.OWNER]: [
    "dashboard",
    "bookings",
    "fleet",
    "customers",
    // NO gps, maintenance, inventory, vehicle-documentation
    "analytics",
    // NO payments
    "reports",
    // NO audit-log, user-logs, transaction-logs
    "settings",
    "archives/user-log",
    "archives/payments",
    "archives/bookings",
    "archives/transaction-log",
    "archives/audit-log",
    "archives/reviews",
    "notifications",
    "profile",
  ],
};

/**
 * Returns true if the given role can access the given permission key.
 * @param {string} role  - e.g. "admin" | "supervisor" | "owner"
 * @param {string} key   - e.g. "dashboard" | "fleet" | "archives/bookings"
 */
export function canAccess(role, key) {
  if (!role || !key) return false;
  return ROLE_PERMISSIONS[role]?.includes(key) ?? false;
}
