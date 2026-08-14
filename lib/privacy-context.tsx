"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "app.hideAmounts";

const PrivacyContext = createContext<{ hideAmounts: boolean; toggleHideAmounts: () => void } | null>(null);

// Same shape as ThemeProvider (lib/theme-context.tsx), minus the pre-hydration
// bootstrap script — a theme flash reads as visually broken, but a brief
// flash of real numbers before React hydrates (typically well under 100ms)
// isn't the threat model here; this is for "don't leave my net worth on
// screen while I'm glancing away or sharing," not a security boundary.
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hideAmounts, setHideAmounts] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") setHideAmounts(true);
    } catch {
      // Storage unavailable (e.g. private browsing) — default to visible.
    }
  }, []);

  const toggleHideAmounts = useCallback(() => {
    setHideAmounts((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore write failures.
      }
      return next;
    });
  }, []);

  return <PrivacyContext.Provider value={{ hideAmounts, toggleHideAmounts }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error("usePrivacy must be used within PrivacyProvider");
  return ctx;
}
