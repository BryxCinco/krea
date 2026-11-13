"use client";

import { ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

/**
 * Persistent privacy indicator. The explanation opens on hover, focus and tap,
 * so it is reachable by mouse, keyboard and touch.
 */
export function OnDeviceIndicator() {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 font-mono text-xs text-lime"
      >
        <ShieldCheck aria-hidden className="size-4" strokeWidth={1.75} />
        <span>
          100% <span className="hidden sm:inline">on-device</span>
          <span className="sm:hidden">local</span>
        </span>
      </button>
      <div
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute right-0 top-full z-40 mt-1 w-72 rounded-md border border-line bg-raised p-3 text-sm leading-relaxed text-fg shadow-xl"
      >
        <p>
          Walang ina-upload. Your files are opened and processed in this browser tab only. Krea has no server, no
          account and no database.
        </p>
        <p className="mt-2 text-muted">
          Subukan mo: switch on airplane mode after the page loads. Gagana pa rin ang tools.
        </p>
      </div>
    </div>
  );
}
