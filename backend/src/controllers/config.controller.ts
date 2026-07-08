import type { Request, Response } from "express";
import { publicConfig } from "../config/intelligence.config";

/**
 * GET /api/config/public
 * Returns ONLY safe, client-consumable settings (refresh intervals, default
 * instruments, feature flags, approval thresholds). It deliberately excludes
 * every secret/private value: no API keys, no access tokens, no credentials,
 * and no private feed URLs. See publicConfig() for the exact safe subset.
 */
export function getPublicConfigHandler(_req: Request, res: Response) {
  // Small, deterministic payload — let clients cache it briefly.
  res.set("Cache-Control", "public, max-age=30");
  res.json(publicConfig());
}
