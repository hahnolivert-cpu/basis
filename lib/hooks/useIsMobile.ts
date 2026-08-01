"use client";

import { useEffect, useState } from "react";

// Below this, a fixed-column grid table (Holdings, Transactions, ...)
// stops being usable without horizontal scrolling — narrow enough to
// cover an iPhone in portrait, wide enough to leave iPad/desktop alone.
const MOBILE_BREAKPOINT = 640;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
