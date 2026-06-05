import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <Logo className="h-14 w-14 text-ink" />
      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-amber">
        error · 404
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-7 text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-sm bg-amber px-5 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-black transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </main>
  );
}
