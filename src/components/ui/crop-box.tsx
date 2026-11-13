"use client";

import { useEffect, useEffectEvent, useRef } from "react";

/** Crop rectangle, normalized to the image (all values 0..1). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Corner = "nw" | "ne" | "sw" | "se";

const MIN = 0.04;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Largest centred box with the given normalized aspect (width/height in 0..1 units). */
function fitAspect(normalizedAspect: number): CropRect {
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
  value: CropRect;
  /** Locked ratio in real pixels (width / height), or null for free crop. */
  aspect: number | null;
  /** Natural image size, needed to convert the pixel ratio into normalized units. */
  imageWidth: number;
  imageHeight: number;
  onChange: (rect: CropRect) => void;
}

/** Interactive crop overlay: drag the box to move it, drag a corner to resize, arrow keys to nudge. */
export function CropBox({ src, value, aspect, imageWidth, imageHeight, onChange }: CropBoxProps) {
  const frame = useRef<HTMLDivElement>(null);
  const normalizedAspect = aspect ? aspect / (imageWidth / imageHeight) : null;

  // Enforce the locked ratio: whenever the box does not match it (a new ratio was
  // picked, or a different image arrived), snap to the largest centred box that does.
  const fitsAspect = !normalizedAspect || Math.abs(value.w / value.h / normalizedAspect - 1) < 0.01;
  const snap = useEffectEvent(() => onChange(fitAspect(normalizedAspect!)));
  useEffect(() => {
    if (!fitsAspect) snap();
  }, [fitsAspect]);

  const drag = (mode: Corner | "move") => (event: React.PointerEvent) => {
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
        mode === "move"
          ? { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) }
          : resizeFrom(start, mode, dx, dy, normalizedAspect),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
    <div ref={frame} className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-md">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      <img src={src} alt="Image being cropped" draggable={false} className="block max-h-[52vh] max-w-full" />
      <div
        role="group"
        tabIndex={0}
        aria-label={`Crop area, ${Math.round(value.w * imageWidth)} by ${Math.round(value.h * imageHeight)} pixels. Use arrow keys to move.`}
        onPointerDown={drag("move")}
        onKeyDown={onKeyDown}
        className="absolute cursor-move border-2 border-lime shadow-[0_0_0_9999px_rgb(10_11_8/0.72)]"
        style={{
          left: `${value.x * 100}%`,
          top: `${value.y * 100}%`,
          width: `${value.w * 100}%`,
          height: `${value.h * 100}%`,
        }}
      >
        <span className="absolute left-1 top-1 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[11px] text-lime">
          {Math.round(value.w * imageWidth)} x {Math.round(value.h * imageHeight)}
        </span>
        {corners.map((corner) => (
          // Oversized hit area (24px) around a small visible handle, for fingers.
          <span
            key={corner.id}
            aria-hidden
            onPointerDown={drag(corner.id)}
            className={`absolute flex size-6 items-center justify-center ${corner.className}`}
          >
            <span className="size-3 rounded-sm bg-lime" />
          </span>
        ))}
      </div>
    </div>
  );
}
