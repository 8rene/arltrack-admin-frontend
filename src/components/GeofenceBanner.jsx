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
//         "notice"       — white, plain informational pill (e.g. "no cars reporting")
//
// `placement`: "top" (default) — top-center pills, as used by Traceback / Simulate / History / Review.
//              "box"           — a "Warnings" box in the lower-left corner that holds every pill in one place
//                                (used by the Live tab). Renders nothing while there are no warnings.
export default function GeofenceBanner({ banners = [], placement = "top" }) {
  if (!banners.length) return null;

  const toneClasses = {
    breach:      "bg-red-600 text-white",
    restricted:  "bg-amber-500 text-white",
    unavailable: "bg-gray-400 text-white",
    notice:      "bg-white text-gray-700 border border-gray-200",
  };

  const pills = banners.map((b) => (
    <div
      key={b.id}
      className={`geofence-pulse-banner flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-lg whitespace-nowrap ${
        toneClasses[b.tone] || toneClasses.breach
      }`}
    >
      <span className="geofence-pulse-dot" style={b.tone === "notice" ? { background: "#9ca3af" } : undefined} />
      {b.text}
    </div>
  ));

  if (placement === "box") {
    // Same look as the Car Tracking booking window (CbSection + the amber "Deposit still held" callout):
    // a soft gray box, a small uppercase title, and each warning as a tinted callout inside it.
    const calloutClasses = {
      breach:      "text-red-700 bg-red-50 border-red-200",
      restricted:  "text-amber-700 bg-amber-50 border-amber-200",
      unavailable: "text-gray-600 bg-gray-100 border-gray-200",
    };
    return (
      <div className="absolute bottom-4 left-4 z-[1000] w-max min-w-[18rem] max-w-[calc(100%-2rem)] bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm space-y-1.5 shadow-md pointer-events-none">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Warnings</p>
          <span className="text-[11px] font-semibold text-gray-400">{banners.length}</span>
        </div>
        {banners.map((b) => (
          <p
            key={b.id}
            className={`text-xs font-medium border rounded-lg px-2.5 py-1.5 break-words ${calloutClasses[b.tone] || calloutClasses.breach}`}
          >
            {b.text}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1.5 pointer-events-none">
      {pills}
    </div>
  );
}