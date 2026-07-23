import { useState, useEffect, useRef } from "react";
import { reverseGeocode, roundKey } from "../utils/reverseGeocode";

/**
 * Shows raw coordinates right away (never waits on the network for that
 * part), then quietly swaps to "near <address>" once Nominatim resolves it
 * in the background:
 *
 *   14.5547, 121.0244 …     ← resolving
 *   near Ayala Ave, Makati  ← resolved
 *   14.5547, 121.0244       ← lookup failed, just leave it on coordinates
 *
 * Guards against flicker: GPS jitter means lat/lng change by tiny amounts on
 * every poll even when the car hasn't meaningfully moved — this only resets
 * back to the "resolving" state when the ROUNDED coordinate actually changes,
 * so it doesn't flash back to raw numbers every few seconds for no reason.
 */
export default function PlaceLabel({ lat, lng, className = "" }) {
  const [label, setLabel]   = useState(null);
  const [failed, setFailed] = useState(false);
  const lastKeyRef = useRef(null);

  useEffect(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const key = roundKey(lat, lng);
    if (key === lastKeyRef.current) return; // same spot as last resolve — don't reset/flicker
    lastKeyRef.current = key;
    setLabel(null);
    setFailed(false);

    let cancelled = false;
    reverseGeocode(lat, lng).then((result) => {
      if (cancelled) return;
      if (result) setLabel(result);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [lat, lng]);

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const coords = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  return (
    <span className={className}>
      {label ? `near ${label}` : failed ? coords : `${coords} …`}
    </span>
  );
}