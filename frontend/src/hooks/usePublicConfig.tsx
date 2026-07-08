"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { FALLBACK_PUBLIC_CONFIG, mergePublicConfig, type PublicConfig } from "@/lib/config";

interface PublicConfigState {
  /** Live config — the safe local fallback until the backend responds. */
  config: PublicConfig;
  /** True until the first load attempt (success or failure) settles. */
  loading: boolean;
  /** True when the server config loaded; false while using the local fallback. */
  loaded: boolean;
}

const Ctx = createContext<PublicConfigState | null>(null);

/**
 * Loads the backend's public runtime config once (GET /api/config/public) and
 * shares it app-wide. Until it loads — or if it is unreachable — the SAFE LOCAL
 * FALLBACK is used, so the dashboard always has valid refresh intervals and
 * default instruments. Read-only: this only configures polling/defaults/labels.
 */
export function PublicConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>(FALLBACK_PUBLIC_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await api.config.public();
        if (cancelled) return;
        setConfig(mergePublicConfig(raw));
        setLoaded(true);
      } catch {
        // Keep the fallback — the UI stays functional without the backend.
        if (!cancelled) setLoaded(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<PublicConfigState>(() => ({ config, loading, loaded }), [config, loading, loaded]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Full state (config + loading/loaded flags). Safe outside the provider. */
export function usePublicConfigState(): PublicConfigState {
  return useContext(Ctx) ?? { config: FALLBACK_PUBLIC_CONFIG, loading: false, loaded: false };
}

/** The public runtime config. Falls back safely when outside the provider. */
export function usePublicConfig(): PublicConfig {
  return usePublicConfigState().config;
}
