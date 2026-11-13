"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The empty Stage: one large drop target. Dropping is handled by the Workspace
 * (the whole stage accepts drops); this component is the invitation and the
 * keyboard/tap path to the file picker.
 */
export function Dropzone({
  title,
  formats,
  dragging,
  onPick,
}: {
  title: ReactNode;
  /** Human-readable list of accepted formats. */
  formats: string;
  dragging: boolean;
  onPick: () => void;
}) {
  return (
    <div
      data-dragging={dragging}
      onClick={onPick}
      className="dropzone-frame flex min-h-[58dvh] cursor-pointer flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed border-line bg-panel/60 px-5 py-12 text-center"
    >
      {title}
      <p className="max-w-md text-base leading-relaxed text-muted">
        I-drop dito, i-paste (<kbd className="font-mono text-fg">Ctrl+V</kbd>), o pumili ng file.{" "}
        <span className="font-mono text-sm text-fg">{formats}</span>
      </p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPick();
        }}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-lime px-6 text-base font-semibold text-ink transition hover:brightness-110"
      >
        <Plus aria-hidden className="size-5" strokeWidth={2} />
        Pick files
      </button>
      <p className="font-mono text-xs text-muted">Hindi ina-upload. Dito lang sa device mo.</p>
    </div>
  );
}
