import type { Request, Response } from "express";
import * as account from "../services/account.service";

// Phase 3G — READ-ONLY Zerodha account endpoints. No order/execution.
// On permission failure, return a structured fallback (never fake data).

function sendSafe(res: Response, result: { ok: true; data: unknown } | { ok: false; message: string; code: string }, key: string) {
  if (result.ok) {
    res.json({ source: "zerodha", readOnly: true, [key]: result.data });
  } else {
    res.status(200).json({ source: "unavailable", readOnly: true, message: result.message, code: result.code });
  }
}

export async function getProfile(_req: Request, res: Response) {
  sendSafe(res, await account.getProfile(), "profile");
}
export async function getFunds(_req: Request, res: Response) {
  sendSafe(res, await account.getFundsAndMargins(), "margins");
}
export async function getMargins(_req: Request, res: Response) {
  sendSafe(res, await account.getFundsAndMargins(), "margins");
}
export async function getHoldings(_req: Request, res: Response) {
  sendSafe(res, await account.getHoldings(), "holdings");
}
export async function getPositions(_req: Request, res: Response) {
  sendSafe(res, await account.getPositions(), "positions");
}
export async function getPortfolioSummary(_req: Request, res: Response) {
  const summary = await account.getPortfolioSummary();
  res.json({ readOnly: true, ...summary });
}
