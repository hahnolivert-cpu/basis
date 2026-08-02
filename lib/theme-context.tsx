"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "app.theme";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

// The inline script in app/layout.tsx already sets data-theme on <html>
// before hydration (avoiding a flash of the wrong theme), so this only
// needs to mirror that attribute into React state for components like the
// AccountMenu toggle to read.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") setTheme("dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore write failures (e.g. quota exceeded in private browsing).
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// Runs synchronously before paint (see app/layout.tsx) so the page never
// flashes light before switching to a saved dark preference.
export const themeBootstrapScript = `
(function () {
  try {
    var theme = localStorage.getItem("${STORAGE_KEY}");
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
`;
