"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The render line: a thin progress bar that sweeps while work is running.
 * Uses the warm signal colour, which is reserved for active processing.
 *
 * Screen readers: the progress bar can be queried at any time, and a polite
 * live region announces only when work starts and finishes, not every percent.
 */
export function RenderLine({ active, progress, label }: { active: boolean; progress: number; label: string }) {
  const percent = Math.round(progress * 100);
  const [announcement, setAnnouncement] = useState("");
  const wasActive = useRef(false);

  useEffect(() => {
    if (active === wasActive.current) return;
    wasActive.current = active;
    setAnnouncement(active ? `Working: ${label}` : "Finished.");
    // Only react to starting and stopping, not to label changes while running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="h-8">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {active && (
        <>
          <div
            role="progressbar"
            aria-label="Progress"
            aria-valuetext={`${label}, ${percent}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="render-line"
          >
            <div className="render-line__fill" style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} />
            <div className="render-line__sweep" />
          </div>
          <p aria-hidden className="mt-1.5 flex justify-between gap-3 font-mono text-xs text-signal">
            <span className="truncate">{label}</span>
            <span>{percent}%</span>
          </p>
        </>
      )}
    </div>
  );
}
