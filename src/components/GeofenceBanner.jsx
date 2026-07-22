// Top-center pulsing pill, modeled on the geo-test reference's
// map-breach-banner (LiveTab.jsx), but positioned top-center instead of
// top-left, and shared across Live / Traceback / History / Review — the
// parent container must have `position: relative` (the map cards already
// do, alongside the existing "Car Information" / "Logs" floating buttons).
//
// `banners` is an array of { id, text, tone }:
//   tone: "breach"       — red,   geofence breach
//         "restricted"   — amber, coding restriction active
//         "unavailable"  — gray,  review mode with no zone/alert data to check
export default function GeofenceBanner({ banners = [] }) {
  if (!banners.length) return null;

  const toneClasses = {
    breach:      "bg-red-600",
    restricted:  "bg-amber-500",
    unavailable: "bg-gray-400",
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1.5 pointer-events-none">
      {banners.map((b) => (
        <div
          key={b.id}
          className={`geofence-pulse-banner flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white shadow-lg whitespace-nowrap ${
            toneClasses[b.tone] || toneClasses.breach
          }`}
        >
          <span className="geofence-pulse-dot" />
          {b.text}
        </div>
      ))}
    </div>
  );
}