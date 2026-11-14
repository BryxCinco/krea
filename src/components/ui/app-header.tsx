"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { OPEN_PALETTE_EVENT } from "@/components/palette/command-palette";
import { useSession } from "@/lib/session";
import { OfflineReady } from "./offline-ready";
import { OnDeviceIndicator } from "./on-device";
import { ThemeToggle } from "./theme-toggle";

/** Fired to open the Chains panel on the Stage. */
export const OPEN_CHAINS_EVENT = "krea:open-chains";

/** Krea mark: the pixel-art K on a lime tile (same grid as /icons/icon.svg). */
const K_PIXELS: [number, number][] = [];
for (let r = 0; r < 13; r++) {
  for (let c = 0; c < 11; c++) {
    const up = r <= 6 && c >= 8 - r && c < 11 - r && c >= 2;
    const down = r >= 6 && c >= r - 4 && c < r - 1;
    if (c < 3 || up || down) K_PIXELS.push([c, r]);
  }
}

function LogoMark() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" shapeRendering="crispEdges" className="size-9 shrink-0 lg:size-10">
      <rect width="40" height="40" rx="9" className="fill-lime" />
      <g transform="translate(6.5 5.5) scale(2.4)">
        {K_PIXELS.map(([c, r]) => (
          <rect key={`${c}-${r}`} x={c * 0.95 / 1} y={r * 0.95} width="0.95" height="0.95" className="fill-on-lime" />
        ))}
      </g>
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

  const menu = useRef<HTMLDivElement>(null);
  useFocusTrap(menuOpen, menu, () => setMenuOpen(false));
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
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
        <Link href="/" className="mr-auto flex items-center gap-3 rounded-md">
          <LogoMark />
          <span className="flex flex-col leading-none">
            <span className="text-2xl font-extrabold tracking-tight text-fg lg:text-[1.7rem]">krea</span>
            <span className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted min-[400px]:block">
              Kinetic Render Engine App
            </span>
            <span className="sr-only">, home</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center lg:flex">
          <Link href="/tools" className={navLink} aria-current={pathname.startsWith("/tools") ? "page" : undefined}>
            Tools
          </Link>
          <button type="button" onClick={openChains} className={navLink}>
            Chains
          </button>
          <Link href="/privacy" className={navLink}>
            Privacy
          </Link>
        </nav>

        {/* Search trigger, styled as a field on desktop and an icon on mobile. */}
        <button
          type="button"
          onClick={openPalette}
          aria-keyshortcuts="Control+K /"
          className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-line text-sm text-muted transition-colors hover:border-accent hover:text-fg lg:w-64 lg:justify-start lg:bg-panel lg:px-3"
        >
          <Search aria-hidden className="size-4" strokeWidth={1.75} />
          {/* Visible on desktop, screen-reader only on phones, so the button name always matches its text. */}
          <span className="sr-only flex-1 text-left lg:not-sr-only">Search tools</span>
          <kbd aria-hidden className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] lg:inline">Ctrl K</kbd>
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
            ref={menu}
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
              <Link href="/privacy" onClick={() => setMenuOpen(false)} className={menuLink}>
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
              <div className="rounded-md border border-line p-3">
                <p className="mb-2 text-sm text-fg">Use every tool without internet</p>
                <OfflineReady compact />
              </div>
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
