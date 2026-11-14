"use client";

import { useState } from "react";
import type { CollageLayout } from "@/tools/image/collage";

/**
 * Collage preview with swap targets over each photo. Drag one photo onto
 * another to swap them (mouse, touch, pen), or for keyboard and screen-reader
 * users: press one photo, then another.
 */
export function CollageSwap({ src, layout, names, onSwap }: { src: string; layout: CollageLayout; names: string[]; onSwap: (a: number, b: number) => void }) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const swap = (a: number, b: number) => {
    if (a !== b) onSwap(a, b);
    setPicked(null);
  };

  return (
    <figure className="flex w-full flex-col items-center gap-2">
      <div className="relative inline-block max-w-full touch-none select-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        <img src={src} alt="Collage preview" draggable={false} className="checkerboard block max-h-[56vh] max-w-full rounded-md border border-line" />
        {layout.cells.map((cell, index) => {
          const active = drag?.from === index || picked === index;
          const target = drag && drag.over === index && drag.from !== index;
          return (
            <button
              key={index}
              type="button"
              data-cell={index}
              aria-pressed={picked === index}
              aria-label={
                picked === null
                  ? `Photo ${index + 1}, ${names[index]}. Press to pick it for swapping.`
                  : picked === index
                    ? `Photo ${index + 1} picked. Press another photo to swap, or this one to cancel.`
                    : `Swap photo ${picked + 1} with photo ${index + 1}, ${names[index]}`
              }
              onPointerDown={(event) => {
                if (event.pointerType === "mouse" && event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag({ from: index, over: index });
              }}
              onPointerMove={(event) => {
                if (!drag) return;
                const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-cell]");
                if (element) setDrag({ from: drag.from, over: Number(element.dataset.cell) });
              }}
              onPointerUp={() => {
                if (drag && drag.over !== drag.from) {
                  swap(drag.from, drag.over);
                  setDrag(null);
                }
                // A tap without movement falls through to onClick (pick, then swap).
              }}
              onPointerCancel={() => setDrag(null)}
              onClick={() => {
                if (drag && drag.over !== drag.from) return;
                setDrag(null);
                if (picked === null) setPicked(index);
                else if (picked === index) setPicked(null);
                else swap(picked, index);
              }}
              className={`absolute cursor-grab rounded-sm transition-shadow active:cursor-grabbing ${
                target ? "ring-4 ring-accent" : active ? "ring-4 ring-signal" : "hover:ring-2 hover:ring-accent/70"
              }`}
              style={{
                left: `${(cell.x / layout.width) * 100}%`,
                top: `${(cell.y / layout.height) * 100}%`,
                width: `${(cell.w / layout.width) * 100}%`,
                height: `${(cell.h / layout.height) * 100}%`,
              }}
            />
          );
        })}
      </div>
      <figcaption aria-live="polite" className="font-mono text-xs text-muted">
        {picked !== null ? `Photo ${picked + 1} picked: pindutin ang isa pang photo para mag-swap.` : "Drag a photo onto another to swap them."}
      </figcaption>
    </figure>
  );
}
