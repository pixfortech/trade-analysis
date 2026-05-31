import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import { corsOptions } from "./config/cors";
import { router } from "./routes";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

/** Build and configure the Express application. */
export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // CORS: configured allow-list + (in dev) GitHub Codespaces origins.
  app.use(cors(corsOptions));

  if (env.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  // Root info
  app.get("/", (_req, res) => {
    res.json({
      name: "AI Share Market Analysis Tool — Backend",
      status: "ok",
      phase: "Phase 1 (placeholder data)",
      health: "/api/health",
    });
  });

  // API routes
  app.use("/api", router);

  // 404 + error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
