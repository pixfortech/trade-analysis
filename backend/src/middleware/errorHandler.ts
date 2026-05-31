import type { NextFunction, Request, Response } from "express";
import { isProd } from "../config/env";

interface HttpError extends Error {
  status?: number;
  code?: string;
}

/** Central error-handling middleware (must have 4 args for Express). */
export function errorHandler(err: HttpError, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status ?? 500;

  // Log server-side; keep client response minimal.
  console.error(`[backend] ${status} ${err.message}`);

  res.status(status).json({
    error: {
      message: err.message || "Internal Server Error",
      code: err.code ?? "INTERNAL_ERROR",
      ...(isProd ? {} : { stack: err.stack }),
    },
  });
}
