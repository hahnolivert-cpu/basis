"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// Like useState, but the value survives a reload via localStorage. The
// initial render always uses `initial` (localStorage isn't available during
// SSR), then a mount effect restores whatever was saved. The first write
// effect that runs afterward is skipped — it would otherwise fire with the
// pre-restore `initial` value still in scope and immediately clobber the
// value the read effect just restored.
export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const skipNextWrite = useRef(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {
      // Corrupt JSON or storage unavailable (e.g. private browsing) — fall
      // back to the initial default rather than throwing.
    }
  }, [key]);

  useEffect(() => {
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore write failures (e.g. quota exceeded in private browsing).
    }
  }, [key, value]);

  return [value, setValue];
}
