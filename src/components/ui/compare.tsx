"use client";

import { useState } from "react";

interface CompareProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
}

/**
 * Before/after slider. A native range input sits on top of the images, so it
 * works with mouse, touch and the keyboard (arrow keys) without extra code.
 */
export function Compare({ before, after, beforeLabel, afterLabel }: CompareProps) {
  const [split, setSplit] = useState(50);

  return (
    <div className="checkerboard relative inline-block max-w-full overflow-hidden rounded-md border border-line">
      {/* The "after" image sets the size of the box. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URLs, nothing to optimize */}
      <img src={after} alt="Result" className="block max-h-[52vh] max-w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt="Original"
        className="absolute inset-0 size-full object-fill"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-lime" style={{ left: `${split}%` }} />
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-ink/80 px-2 py-1 font-mono text-xs text-fg">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-ink/80 px-2 py-1 font-mono text-xs text-accent">
        {afterLabel}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label="Before and after comparison position"
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
