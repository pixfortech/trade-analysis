"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "theme.v1";

/**
 * Theme state synced to <html class> + localStorage. Defaults to dark.
 * Light mode is applied via `html.light` overrides in globals.css so existing
 * dark-palette components stay readable without a rewrite.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (window.localStorage.getItem(KEY) as Theme)) || "dark";
    apply(stored);
    setThemeState(stored);
  }, []);

  const apply = (t: Theme) => {
    const root = document.documentElement;
    root.classList.toggle("light", t === "light");
    root.classList.toggle("dark", t === "dark");
  };

  const setTheme = useCallback((t: Theme) => {
    apply(t);
    setThemeState(t);
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return { theme, setTheme, toggle };
}
