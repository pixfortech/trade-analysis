// Reusable loading / error / empty UI states for the dark dashboard.

/** Shimmering placeholder block. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/5 ${className}`} />;
}

/** Skeleton shaped like a trade-plan result (4 level tiles + rationale lines). */
export function TradePlanSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Neutral empty state shown before any action is taken. */
export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-base-800/40 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  hint?: string;
  onRetry?: () => void;
}

/** Error state with an optional hint and retry button. */
export function ErrorState({ message, hint, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-bear/20 bg-bear-soft px-4 py-6 text-center">
      <p className="text-sm font-medium text-bear">{message}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">{hint}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-white/10 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-base-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}
