import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <Header />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-16 prose-legal">
          {children}
          <div className="mt-16 flex flex-wrap gap-4 border-t border-line pt-6 text-[11px] uppercase tracking-[0.15em] text-ink-dim">
            <Link href="/terms" className="hover:text-amber">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-amber">
              Privacy
            </Link>
            <Link href="/risk" className="hover:text-amber">
              Risk
            </Link>
            <Link href="/" className="hover:text-amber">
              ← Back home
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
