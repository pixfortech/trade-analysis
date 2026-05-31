import type { Request, Response } from "express";

/** 404 handler for unmatched routes. */
export function notFound(req: Request, res: Response) {
  res.status(404).json({
    error: {
      message: `Not found: ${req.method} ${req.originalUrl}`,
      code: "NOT_FOUND",
    },
  });
}
