"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <Logo className="h-14 w-14 text-ink" />
      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-wine">
        error · 500
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-7 text-ink-soft">
        An unexpected error occurred. Try again, or head back to the home page.
      </p>
      <div className="mt-8 flex items-center gap-3">
        {retry && (
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-sm bg-amber px-5 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-black transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        )}
        <Link
          href="/"
          className="rounded-sm border border-line px-5 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-ink transition-colors hover:border-amber/50"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
