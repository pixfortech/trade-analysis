"use client";

import { useCallback, useState } from "react";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

/**
 * Small async-state helper for data fetching in client components.
 * Tracks idle / loading / success / error and exposes run()/reset().
 */
export function useAsync<TArgs extends unknown[], TData>(fn: (...args: TArgs) => Promise<TData>) {
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setStatus("loading");
      setError(null);
      try {
        const result = await fn(...args);
        setData(result);
        setStatus("success");
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
        return undefined;
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setData(null);
    setError(null);
  }, []);

  return {
    status,
    data,
    error,
    run,
    reset,
    isIdle: status === "idle",
    isLoading: status === "loading",
    isSuccess: status === "success",
    isError: status === "error",
  };
}
