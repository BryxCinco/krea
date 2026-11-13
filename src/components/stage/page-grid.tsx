"use client";

import { ChevronLeft, ChevronRight, GripVertical, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { openPdf, renderPage } from "@/lib/pdf-render";
import type { StageFile } from "@/lib/session";
import type { PageSlot } from "@/tools/pdf/organize-pdf";

/** Thumbnails beyond this are not rendered (the pages still exist and can be reordered by number). */
const MAX_THUMBS = 300;

interface Thumbs {
  fileId: string;
  urls: string[];
  total: number;
}

/**
 * Page Organizer grid. Drag a page by its grip onto another page to move it
 * there (mouse, touch and pen use the same pointer code), or use the buttons on
 * each page. The layout is stored as JSON in the tool's settings.
 */
export function PageGrid({ file, value, onChange }: { file: StageFile; value: string; onChange: (value: string) => void }) {
  const [thumbs, setThumbs] = useState<Thumbs | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);

  // Render small thumbnails one by one, so the first pages appear right away.
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const { pdf, close } = await openPdf({ name: file.name, type: file.mime, blob: file.file });
      try {
        for (let i = 0; i < Math.min(pdf.numPages, MAX_THUMBS) && !cancelled; i++) {
          const { blob } = await renderPage(pdf, i, 0.35, "image/jpeg", 0.7);
          if (cancelled) break;
          urls.push(URL.createObjectURL(blob));
          setThumbs({ fileId: file.id, urls: [...urls], total: pdf.numPages });
        }
      } finally {
        await close();
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [file]);

  const current = thumbs?.fileId === file.id ? thumbs : null;
  const total = current?.total ?? file.info?.pages ?? 0;
  let slots: PageSlot[];
  try {
    slots = value ? (JSON.parse(value) as PageSlot[]) : Array.from({ length: total }, (_, p) => ({ p, r: 0 }));
  } catch {
    slots = Array.from({ length: total }, (_, p) => ({ p, r: 0 }));
  }
  const save = (next: PageSlot[]) => onChange(JSON.stringify(next));

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= slots.length) return;
    const next = [...slots];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    save(next);
  };

  if (!current && total === 0) {
    return <div aria-label="Loading pages" className="skeleton h-48 w-full rounded-md" />;
  }

  return (
    <div className="w-full">
      <p className="mb-3 font-mono text-xs text-muted" aria-live="polite">
        {slots.length} of {total} pages kept
        {current && current.urls.length < Math.min(total, MAX_THUMBS) && ` · rendering ${current.urls.length}/${Math.min(total, MAX_THUMBS)}`}
      </p>
      <ol aria-label="Pages in output order" className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5">
        {slots.map((slot, index) => {
          const url = current?.urls[slot.p];
          const isTarget = drag && drag.over === index && drag.from !== index;
          return (
            <li
              key={`${slot.p}-${index}`}
              data-slot={index}
              className={`flex flex-col gap-1.5 rounded-lg border bg-panel p-2 transition-colors ${
                isTarget ? "border-accent" : drag?.from === index ? "border-signal opacity-60" : "border-line"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  aria-hidden
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDrag({ from: index, over: index });
                  }}
                  onPointerMove={(event) => {
                    if (!drag) return;
                    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-slot]");
                    if (target) setDrag({ from: drag.from, over: Number(target.dataset.slot) });
                  }}
                  onPointerUp={() => {
                    if (drag) move(drag.from, drag.over);
                    setDrag(null);
                  }}
                  onPointerCancel={() => setDrag(null)}
                  className="flex h-9 w-8 cursor-grab touch-none items-center justify-center rounded text-muted active:cursor-grabbing"
                >
                  <GripVertical className="size-4" strokeWidth={1.75} />
                </span>
                <span className="font-mono text-xs text-muted">p.{slot.p + 1}</span>
              </div>
              <div className="flex aspect-[1/1.3] items-center justify-center overflow-hidden rounded bg-paper">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                  <img
                    src={url}
                    alt={`Page ${slot.p + 1}`}
                    draggable={false}
                    className="max-h-full max-w-full transition-transform"
                    style={{ transform: `rotate(${slot.r}deg)` }}
                  />
                ) : (
                  <span className="skeleton size-full" />
                )}
              </div>
              <div className="grid grid-cols-4 gap-0.5">
                <button
                  type="button"
                  aria-label={`Move page ${slot.p + 1} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className="flex h-9 items-center justify-center rounded text-muted hover:text-accent disabled:opacity-30"
                >
                  <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label={`Rotate page ${slot.p + 1}`}
                  onClick={() => save(slots.map((entry, i) => (i === index ? { ...entry, r: (entry.r + 90) % 360 } : entry)))}
                  className="flex h-9 items-center justify-center rounded text-muted hover:text-accent"
                >
                  <RotateCw aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete page ${slot.p + 1}`}
                  onClick={() => save(slots.filter((_, i) => i !== index))}
                  className="flex h-9 items-center justify-center rounded text-muted hover:text-signal"
                >
                  <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label={`Move page ${slot.p + 1} later`}
                  disabled={index === slots.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="flex h-9 items-center justify-center rounded text-muted hover:text-accent disabled:opacity-30"
                >
                  <ChevronRight aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
