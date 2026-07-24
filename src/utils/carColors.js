// Single source of truth for "which color is car #N" — used by both the
// Live tab (CarTracking.jsx) and Traceback (TracebackPanel.jsx) so the same
// car reads as the same color no matter which tab you're looking at.
export const CAR_COLORS = ["#0d9488", "#2563eb", "#f97316", "#db2777", "#7c3aed", "#65a30d", "#dc2626", "#0891b2"];

export function colorForCar(idx) {
  return CAR_COLORS[idx % CAR_COLORS.length];
}