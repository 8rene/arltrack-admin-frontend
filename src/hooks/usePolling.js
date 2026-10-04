import { useEffect, useRef } from "react";

/**
 * Calls `fn` every `intervalMs` — but ONLY while the browser tab is visible.
 * A hidden/forgotten tab stops polling entirely (each poll costs backend
 * Firestore reads), and refreshes once as soon as the tab is shown again.
 *
 * @param {() => void} fn          latest callback is always used (no restart on identity change)
 * @param {number}     intervalMs  poll period
 * @param {object}     [opts]
 * @param {boolean}    [opts.immediate=true]  also run once on mount
 * @param {boolean}    [opts.enabled=true]    set false to pause entirely
 */
export default function usePolling(fn, intervalMs, { immediate = true, enabled = true } = {}) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const tick  = () => { fnRef.current && fnRef.current(); };
    const start = () => { if (!timer) timer = setInterval(tick, intervalMs); };
    const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.hidden) { stop(); }
      else { tick(); start(); }
    };

    if (!document.hidden) {
      if (immediate) tick();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled, immediate]);
}