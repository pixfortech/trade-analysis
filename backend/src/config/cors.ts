import type { CorsOptions } from "cors";
import { env, isProd } from "./env";

// Host suffix used by GitHub Codespaces / github.dev port forwarding, e.g.
// `glorious-train-abc123-4000.app.github.dev`.
const CODESPACES_HOST_SUFFIX = ".app.github.dev";

// Firebase Hosting domains (any project): <site>.web.app and
// <site>.firebaseapp.com. The deployed frontend lives at
// https://trade-analysis-ai-engine.web.app.
const FIREBASE_HOST_SUFFIXES = [".web.app", ".firebaseapp.com"];

// Origins that are ALWAYS allowed (the deployed frontend + local dev), in
// addition to anything set via the CORS_ORIGIN env var. No wildcard "*" is
// used, so `credentials: true` stays valid.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://trade-analysis-ai-engine.web.app",
  "https://trade-analysis-ai-engine.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:4000",
];

/**
 * Decide whether a request `Origin` is allowed.
 *  - Always allow the deployed Firebase frontend + localhost (DEFAULT list) and
 *    anything configured via CORS_ORIGIN (comma-separated, env.corsOrigin).
 *  - Always allow Firebase Hosting domains (*.web.app / *.firebaseapp.com) so
 *    preview channels / renamed sites keep working.
 *  - In non-production, also allow GitHub Codespaces origins (*.app.github.dev).
 */
export function isOriginAllowed(
  origin: string,
  allowedOrigins: readonly string[] = [...DEFAULT_ALLOWED_ORIGINS, ...env.corsOrigin],
  allowDevWildcards: boolean = !isProd,
): boolean {
  if (allowedOrigins.includes(origin)) return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  // Firebase Hosting domains are allowed in all environments.
  if (FIREBASE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;

  // Codespaces only outside production.
  if (allowDevWildcards && hostname.endsWith(CODESPACES_HOST_SUFFIX)) return true;

  return false;
}

/**
 * CORS options for the API. Uses a dynamic origin check so the default
 * allow-list, the CORS_ORIGIN override, and Firebase/Codespaces origins are all
 * honoured. Keeps `credentials` support and never uses a wildcard origin.
 * The `cors` middleware uses these for both normal requests and OPTIONS
 * preflight, so preflight is handled automatically.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No Origin header → non-browser client (curl, health checks, SSR). Allow.
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  // Be explicit so preflight always advertises what the frontend needs.
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
