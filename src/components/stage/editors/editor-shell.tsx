"use client";

import { Check, CircleAlert, Eye, PenLine } from "lucide-react";
import { useState, type ReactNode } from "react";
import { onTabListKeyDown } from "@/lib/use-focus-trap";

interface EditorShellProps {
  /** Accessible name of the whole editor. */
  label: string;
  form: ReactNode;
  preview: ReactNode;
  /** Export and other actions. Shown under the form on desktop, in the bottom bar on phones. Omit when the preview holds its own controls. */
  actions?: ReactNode;
  /** Autosave status, when the editor saves to this device. */
  saved?: "saved" | "pending" | "error";
  previewLabel?: string;
}

/**
 * Layout shared by the Text & Docs editors.
 * Desktop: form on the left, live preview on the right (sticky).
 * Phones: an Edit / Preview switch at the top and the actions in a bar pinned
 * to the bottom of the screen, within thumb reach.
 */
export function EditorShell({ label, form, preview, actions, saved, previewLabel = "Preview" }: EditorShellProps) {
  const [view, setView] = useState<"edit" | "preview">("edit");

  const status = saved && (
    <p aria-live="polite" className="flex items-center gap-1.5 font-mono text-xs text-muted">
      {saved === "error" ? (
        <>
          <CircleAlert aria-hidden className="size-3.5 text-signal" strokeWidth={1.75} />
          <span className="text-signal">Hindi ma-save: storage is full or blocked.</span>
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3.5 text-accent" strokeWidth={1.75} />
          {saved === "pending" ? "Saving…" : "Saved on this device"}
        </>
      )}
    </p>
  );

  return (
    <section aria-label={label} className="border-y border-line px-4 py-4 pb-28 lg:px-8 lg:py-6 lg:pb-10">
      {/* Phone: switch between editing and previewing. */}
      <div role="tablist" onKeyDown={onTabListKeyDown} aria-label="Editor view" className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1 lg:hidden">
        {(
          [
            ["edit", "Edit", PenLine],
            ["preview", previewLabel, Eye],
          ] as const
        ).map(([id, text, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`flex min-h-10 items-center justify-center gap-2 rounded text-sm ${view === id ? "bg-raised font-semibold text-accent" : "text-muted"}`}
          >
            <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            {text}
          </button>
        ))}
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8">
        <div className={`${view === "edit" ? "" : "hidden"} min-w-0 lg:block`}>
          <div className="flex flex-col gap-5">{form}</div>
          {actions && <div className="mt-6 hidden flex-wrap items-center gap-2 lg:flex">{actions}</div>}
          <div className="mt-3 hidden lg:block">{status}</div>
        </div>
        <div className={`${view === "preview" ? "" : "hidden"} min-w-0 lg:block`}>
          <div className="lg:sticky lg:top-[calc(var(--header-h)+1rem)]">{preview}</div>
        </div>
      </div>

      {/* Phone action bar. */}
      {actions && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mb-1.5">{status}</div>
          <div className="flex gap-2 overflow-x-auto [&>*]:shrink-0">{actions}</div>
        </div>
      )}
    </section>
  );
}
