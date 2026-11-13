"use client";

import { Plus, Upload } from "lucide-react";

/**
 * The empty Stage: one large drop target. Dropping is handled by the Workspace
 * (the whole stage accepts drops); this component is the invitation and the
 * keyboard/tap path to the file picker.
 */
export function Dropzone({
  formats,
  dragging,
  onPick,
}: {
  /** Human-readable list of accepted formats. */
  formats: string;
  dragging: boolean;
  onPick: () => void;
}) {
  return (
    <div
      data-dragging={dragging}
      onClick={onPick}
      className="dropzone-frame mx-auto flex min-h-[40dvh] max-w-5xl cursor-pointer flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-line bg-panel px-5 py-10 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-raised text-accent">
        <Upload aria-hidden className="size-7" strokeWidth={1.75} />
      </span>
      <p className="max-w-md text-lg leading-relaxed text-fg">
        I-drop dito, i-paste (<kbd className="font-mono text-base">Ctrl+V</kbd>), o pumili ng file.
      </p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPick();
        }}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-lime px-6 text-base font-semibold text-on-lime transition hover:brightness-110"
      >
        <Plus aria-hidden className="size-5" strokeWidth={2} />
        Pick files
      </button>
      <p className="font-mono text-xs text-muted">
        {formats} <span aria-hidden>/</span> Hindi ina-upload. Dito lang sa device mo.
      </p>
    </div>
  );
}
