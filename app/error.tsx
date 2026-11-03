"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-down/50 bg-down/10 px-4 py-6">
      <p className="font-semibold text-down">Something went wrong loading this page.</p>
      <p className="num mt-1 text-sm text-dim">{error.message}</p>
      <button type="button" onClick={reset} className="mt-3 text-sm text-ink underline underline-offset-2">
        Try again
      </button>
    </div>
  );
}
