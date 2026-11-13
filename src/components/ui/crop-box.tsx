"use client";

import { useEffect, useEffectEvent, useRef } from "react";

/** A rectangle normalized to the image it sits on (all values 0..1). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Corner = "nw" | "ne" | "sw" | "se";

const MIN = 0.04;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A box with the given normalized aspect (width/height in 0..1 units): centred, or kept near `around`. */
function fitAspect(normalizedAspect: number, around?: CropRect): CropRect {
  if (around) {
    // Keep the current width and position where possible (used when placing an image).
    let w = around.w;
    let h = w / normalizedAspect;
    if (h > 1) {
      h = 1;
      w = h * normalizedAspect;
    }
    return { x: clamp(around.x, 0, 1 - w), y: clamp(around.y, 0, 1 - h), w, h };
  }
  const w = Math.min(1, normalizedAspect);
  const h = w / normalizedAspect;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

function resizeFrom(box: CropRect, corner: Corner, dx: number, dy: number, aspect: number | null): CropRect {
  const left = corner.includes("w");
  const top = corner.includes("n");
  // The opposite corner stays fixed while the dragged corner follows the pointer.
  const anchorX = left ? box.x + box.w : box.x;
  const anchorY = top ? box.y + box.h : box.y;
  const pointX = clamp((left ? box.x : box.x + box.w) + dx, 0, 1);
  const pointY = clamp((top ? box.y : box.y + box.h) + dy, 0, 1);

  let w = Math.max(MIN, left ? anchorX - pointX : pointX - anchorX);
  let h = Math.max(MIN, top ? anchorY - pointY : pointY - anchorY);
  if (aspect) {
    h = w / aspect;
    const maxH = top ? anchorY : 1 - anchorY;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
  }
  return { x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h };
}

interface CropBoxProps {
  src: string;
  alt: string;
  value: CropRect;
  /** Locked ratio in real pixels (width / height), or null for a free box. */
  aspect: number | null;
  /** Natural size of the underlying image, needed to convert the pixel ratio into normalized units. */
  imageWidth: number;
  imageHeight: number;
  /**
   * "crop": darken everything outside the box and show its pixel size.
   * "place": show `overlaySrc` inside the box (a signature on a page).
   */
  mode?: "crop" | "place";
  overlaySrc?: string;
  /** Accessible name of the box. */
  label: string;
  onChange: (rect: CropRect) => void;
}

/** A draggable, resizable box over an image: drag to move, drag a corner to resize, arrow keys to nudge. */
export function CropBox({ src, alt, value, aspect, imageWidth, imageHeight, mode = "crop", overlaySrc, label, onChange }: CropBoxProps) {
  const frame = useRef<HTMLDivElement>(null);
  const normalizedAspect = aspect ? aspect / (imageWidth / imageHeight) : null;

  // Enforce the locked ratio: whenever the box does not match it (a new ratio was
  // picked, or a different image arrived), snap to a box that does.
  const fitsAspect = !normalizedAspect || Math.abs(value.w / value.h / normalizedAspect - 1) < 0.01;
  const snap = useEffectEvent(() => onChange(fitAspect(normalizedAspect!, mode === "place" ? value : undefined)));
  useEffect(() => {
    if (!fitsAspect) snap();
  }, [fitsAspect]);

  const drag = (handle: Corner | "move") => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = frame.current!.getBoundingClientRect();
    const start = value;
    const originX = event.clientX;
    const originY = event.clientY;

    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - originX) / bounds.width;
      const dy = (move.clientY - originY) / bounds.height;
      onChange(
        handle === "move"
          ? { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) }
          : resizeFrom(start, handle, dx, dy, normalizedAspect),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    onChange({ ...value, x: clamp(value.x + delta[0], 0, 1 - value.w), y: clamp(value.y + delta[1], 0, 1 - value.h) });
  };

  const corners: { id: Corner; className: string }[] = [
    { id: "nw", className: "-left-3 -top-3 cursor-nwse-resize" },
    { id: "ne", className: "-right-3 -top-3 cursor-nesw-resize" },
    { id: "sw", className: "-bottom-3 -left-3 cursor-nesw-resize" },
    { id: "se", className: "-bottom-3 -right-3 cursor-nwse-resize" },
  ];

  return (
    <div
      ref={frame}
      className={`relative inline-block max-w-full touch-none select-none rounded-md ${mode === "crop" ? "overflow-hidden" : "border border-line bg-paper"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      <img src={src} alt={alt} draggable={false} className="block max-h-[56vh] max-w-full" />
      <div
        role="group"
        tabIndex={0}
        aria-label={`${label}. Use arrow keys to move.`}
        onPointerDown={drag("move")}
        onKeyDown={onKeyDown}
        className={`absolute cursor-move border-2 border-accent ${mode === "crop" ? "shadow-[0_0_0_9999px_var(--scrim)]" : "border-dashed"}`}
        style={{
          left: `${value.x * 100}%`,
          top: `${value.y * 100}%`,
          width: `${value.w * 100}%`,
          height: `${value.h * 100}%`,
        }}
      >
        {mode === "crop" ? (
          <span className="absolute left-1 top-1 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[11px] text-accent">
            {Math.round(value.w * imageWidth)} x {Math.round(value.h * imageHeight)}
          </span>
        ) : (
          overlaySrc && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL
            <img src={overlaySrc} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />
          )
        )}
        {corners.map((corner) => (
          // Oversized hit area (24px) around a small visible handle, for fingers.
          <span
            key={corner.id}
            aria-hidden
            onPointerDown={drag(corner.id)}
            className={`absolute flex size-6 items-center justify-center ${corner.className}`}
          >
            <span className="size-3 rounded-sm bg-lime ring-1 ring-on-lime" />
          </span>
        ))}
      </div>
    </div>
  );
}
