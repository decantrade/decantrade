"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Logo } from "./Logo";

const emptySubscribe = () => () => {};

export type MobileNavLink = {
  label: string;
  href: string;
  external?: boolean;
  primary?: boolean;
  icon: IconName;
};

type IconName =
  | "how"
  | "network"
  | "faq"
  | "trade"
  | "reserve"
  | "home"
  | "docs"
  | "github"
  | "x";

const ICONS: Record<IconName, React.ReactNode> = {
  how: <path d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  network: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  faq: (
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.05 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  ),
  trade: <path d="M4 18 10 12l4 4 6-7m0 0h-4m4 0v4" />,
  reserve: (
    <path d="M5 5h14a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V6a1 1 0 0 1 1-1Z" />
  ),
  home: <path d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" />,
  docs: <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v5h5M8 13h8M8 17h8" />,
  github: (
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  ),
  x: <path d="M4 4l16 16M20 4 4 20" />,
};

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export function MobileNav({
  links,
  socials,
}: {
  links: MobileNavLink[];
  socials: MobileNavLink[];
}) {
  const [open, setOpen] = useState(false);
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkClass = (primary?: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] transition-colors ${
      primary
        ? "bg-amber font-semibold text-black hover:opacity-90"
        : "text-ink-soft hover:bg-bg-soft hover:text-amber"
    }`;

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:border-amber/50 hover:text-amber"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {isClient &&
        createPortal(
          <div className="md:hidden">
            <div
              onClick={() => setOpen(false)}
              aria-hidden="true"
              className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
                open ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            />

            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              aria-hidden={!open}
              style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
              className={`fixed inset-y-0 right-0 z-[70] flex w-[82%] max-w-xs flex-col border-l border-line bg-panel transition-transform duration-200 ease-out ${
                open ? "" : "pointer-events-none"
              }`}
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Logo className="h-6 w-6 text-amber" />
                  <span className="text-sm font-semibold tracking-[0.18em]">
                    DECANT
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:border-amber/50 hover:text-amber"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {links.map((l) =>
                  l.external ? (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                      className={linkClass(l.primary)}
                    >
                      <NavIcon name={l.icon} />
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      key={l.label}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={linkClass(l.primary)}
                    >
                      <NavIcon name={l.icon} />
                      {l.label}
                    </Link>
                  ),
                )}
              </nav>

              <div className="border-t border-line px-5 py-4">
                <span className="mb-3 inline-block rounded-full border border-amber/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-amber">
                  Base · Testnet
                </span>
                <div className="flex items-center gap-5">
                  {socials.map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-amber"
                    >
                      <NavIcon name={s.icon} />
                      {s.label}
                    </a>
                  ))}
                </div>
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </div>
  );
}
