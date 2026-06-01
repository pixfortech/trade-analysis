"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * State synced to localStorage. SSR-safe: starts from `initial` and hydrates
 * from storage after mount (so server and first client render match).
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [key, value, hydrated]);

  const reset = useCallback(() => setValue(initial), [initial]);

  return { value, setValue, reset, hydrated } as const;
}
