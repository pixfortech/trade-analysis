import type { CorsOptions } from "cors";
import { env, isProd } from "./env";

// Host suffix used by GitHub Codespaces / github.dev port forwarding, e.g.
// `glorious-train-abc123-4000.app.github.dev`. This also matches preview
// variants like `*.preview.app.github.dev`.
const CODESPACES_HOST_SUFFIX = ".app.github.dev";

/**
 * Decide whether a request `Origin` is allowed.
 *  - Always allow explicitly configured origins (CORS_ORIGIN env, default
 *    http://localhost:3000).
 *  - Outside production, also allow GitHub Codespaces forwarded origins
 *    (*.app.github.dev) so the dashboard works when tested in a Codespace.
 *    This is development/testing only and is disabled when NODE_ENV=production.
 */
export function isOriginAllowed(
  origin: string,
  allowedOrigins: readonly string[] = env.corsOrigin,
  allowDevWildcards: boolean = !isProd,
): boolean {
  if (allowedOrigins.includes(origin)) return true;

  if (allowDevWildcards) {
    try {
      const { hostname } = new URL(origin);
      return hostname.endsWith(CODESPACES_HOST_SUFFIX);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * CORS options for the API. Uses a dynamic origin check so the configured
 * allow-list and (in dev) Codespaces origins are both honoured, while keeping
 * `credentials` support and the CORS_ORIGIN env override.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No Origin header → non-browser client (curl, health checks, SSR). Allow.
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
};
