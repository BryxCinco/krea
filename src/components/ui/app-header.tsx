"use client";

import { Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { OPEN_PALETTE_EVENT } from "@/components/palette/command-palette";
import { useSession } from "@/lib/session";
import { OnDeviceIndicator } from "./on-device";

/** Top bar: wordmark, tool search, the on-device indicator and "Wipe session". */
export function AppHeader() {
  const { wipe, notice } = useSession();

  return (
    <>
      <header className="sticky top-0 z-50 flex h-14 items-center gap-1 border-b border-line bg-ink/90 px-3 backdrop-blur sm:gap-2 lg:px-5">
        <Link href="/" aria-label="Krea home, the Stage" className="mr-auto flex min-h-10 items-center gap-2 rounded-md px-1">
          <span aria-hidden className="size-2.5 rounded-full bg-lime" />
          <span className="text-xl font-extrabold tracking-tight text-fg">krea</span>
        </Link>

        <Link href="/tools" className="hidden min-h-10 items-center rounded-md px-3 text-sm text-muted hover:text-fg sm:flex">
          All tools
        </Link>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          aria-label="Search tools"
          aria-keyshortcuts="Control+K /"
          className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm text-muted transition-colors hover:border-lime hover:text-fg"
        >
          <Search aria-hidden className="size-4" strokeWidth={1.75} />
          <span className="hidden md:inline">Search tools</span>
          <kbd className="hidden font-mono text-xs md:inline">Ctrl K</kbd>
        </button>

        <OnDeviceIndicator />

        <button
          type="button"
          onClick={wipe}
          title="Clear every file and result from memory"
          className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-muted transition-colors hover:text-signal"
        >
          <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Wipe session</span>
          <span className="sr-only sm:hidden">Wipe session</span>
        </button>
      </header>

      {/* Status messages: visible as a toast, announced to screen readers. */}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex justify-center px-3">
        {notice && (
          <p className="pointer-events-auto max-w-lg rounded-md border border-line bg-raised px-4 py-2.5 text-sm leading-relaxed text-fg shadow-xl">
            {notice}
          </p>
        )}
      </div>
    </>
  );
}
