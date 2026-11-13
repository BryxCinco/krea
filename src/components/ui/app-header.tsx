"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OPEN_PALETTE_EVENT } from "@/components/palette/command-palette";
import { useSession } from "@/lib/session";
import { OnDeviceIndicator } from "./on-device";
import { ThemeToggle } from "./theme-toggle";

/** Fired to open the Chains panel on the Stage. */
export const OPEN_CHAINS_EVENT = "krea:open-chains";

/** Krea mark: a "K" drawn as a stem and two render lines, with the signal dot. */
function LogoMark() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="size-9 shrink-0 lg:size-10">
      <rect width="40" height="40" rx="9" className="fill-lime" />
      <path d="M13 9v22M13 21.5 25 9.5M17.5 17 27 31" fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-on-lime" />
      <circle cx="30" cy="11" r="2.6" className="fill-signal" />
    </svg>
  );
}

/**
 * Tall sticky header. Desktop: wordmark, nav, search field, theme toggle and the
 * on-device pill. Mobile: wordmark, search, theme toggle and a full-height menu.
 */
export function AppHeader() {
  const { wipe, notice } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
  /** Chains live in the Stage's side panel: open it here, or go home first. */
  const openChains = () => {
    setMenuOpen(false);
    if (pathname === "/") window.dispatchEvent(new Event(OPEN_CHAINS_EVENT));
    else router.push("/#chains");
  };

  const navLink = "flex min-h-10 items-center rounded-md px-3 text-sm text-muted transition-colors hover:text-fg";
  const menuLink = "flex min-h-14 items-center border-b border-line text-2xl font-medium text-fg";

  return (
    <>
      <header
        className={`sticky top-0 z-50 flex h-(--header-h) items-center gap-2 border-b px-4 transition-[background-color,border-color,backdrop-filter] duration-200 lg:gap-3 lg:px-8 ${
          scrolled ? "border-line bg-ink/85 backdrop-blur-md" : "border-transparent bg-ink"
        }`}
      >
        <Link href="/" aria-label="Krea, Kinetic Render Engine. Home" className="mr-auto flex items-center gap-3 rounded-md">
          <LogoMark />
          <span className="flex flex-col leading-none">
            <span className="text-2xl font-extrabold tracking-tight text-fg lg:text-[1.7rem]">krea</span>
            <span className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted min-[400px]:block">
              Kinetic Render Engine
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center lg:flex">
          <Link href="/tools" className={navLink} aria-current={pathname.startsWith("/tools") ? "page" : undefined}>
            Tools
          </Link>
          <button type="button" onClick={openChains} className={navLink}>
            Chains
          </button>
          <Link href="/#privacy" className={navLink}>
            Privacy
          </Link>
        </nav>

        {/* Search trigger, styled as a field on desktop and an icon on mobile. */}
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search tools"
          aria-keyshortcuts="Control+K /"
          className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-line text-sm text-muted transition-colors hover:border-accent hover:text-fg lg:w-64 lg:justify-start lg:bg-panel lg:px-3"
        >
          <Search aria-hidden className="size-4" strokeWidth={1.75} />
          <span className="hidden flex-1 text-left lg:inline">Search tools</span>
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] lg:inline">Ctrl K</kbd>
        </button>

        <ThemeToggle />
        <div className="hidden lg:block">
          <OnDeviceIndicator />
        </div>

        <button
          type="button"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="flex size-10 items-center justify-center rounded-md border border-line text-fg lg:hidden"
        >
          <Menu aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
      </header>

      {/* Mobile menu: full-height sheet. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-0 z-[65] flex flex-col bg-ink px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden"
          >
            <div className="flex h-(--header-h) items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Menu</span>
              <button
                type="button"
                autoFocus
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="flex size-10 items-center justify-center rounded-md border border-line text-fg"
              >
                <X aria-hidden className="size-5" strokeWidth={1.75} />
              </button>
            </div>
            <nav aria-label="Main" className="flex flex-col border-t border-line">
              <Link href="/" onClick={() => setMenuOpen(false)} className={menuLink}>
                Stage
              </Link>
              <Link href="/tools" onClick={() => setMenuOpen(false)} className={menuLink}>
                Tools
              </Link>
              <button type="button" onClick={openChains} className={`${menuLink} text-left`}>
                Chains
              </button>
              <Link href="/#privacy" onClick={() => setMenuOpen(false)} className={menuLink}>
                Privacy
              </Link>
            </nav>
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">Theme</span>
                <ThemeToggle showLabel />
              </div>
              <p className="rounded-md border border-line p-3 text-sm leading-relaxed text-muted">
                <span className="font-mono text-accent">100% on-device.</span> Walang ina-upload. Your files are processed
                in this browser only, kahit naka-airplane mode.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                wipe();
                setMenuOpen(false);
              }}
              className="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-md border border-signal text-sm font-semibold text-signal"
            >
              <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
              Wipe session
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status messages: visible as a toast, announced to screen readers. */}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-[calc(var(--header-h)+0.5rem)] z-[70] flex justify-center px-3">
        {notice && (
          <p className="pointer-events-auto max-w-lg rounded-md border border-line bg-raised px-4 py-2.5 text-sm leading-relaxed text-fg shadow-xl">
            {notice}
          </p>
        )}
      </div>
    </>
  );
}
