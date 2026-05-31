import { env } from "../config/env";

/** Raised when the AI engine cannot be reached or returns a non-2xx status. */
export class AiEngineError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiEngineError";
    this.status = status;
  }
}

/**
 * Service layer: POST a JSON payload to the Python AI engine and return the
 * parsed response. Uses a bounded timeout so a slow/unavailable engine never
 * hangs the request. Callers decide how to handle failure (e.g. mock fallback).
 */
export async function callAiEngine<T>(path: string, body: unknown): Promise<T> {
  const url = `${env.aiEngineUrl}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.aiEngineTimeoutMs),
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new AiEngineError(`AI engine ${reason} at ${url}`);
  }

  if (!res.ok) {
    throw new AiEngineError(`AI engine responded with status ${res.status}`, res.status);
  }

  return (await res.json()) as T;
}
