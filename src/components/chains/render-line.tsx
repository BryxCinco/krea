/**
 * The render line: a thin progress bar that sweeps while work is running.
 * Uses the warm signal colour, which is reserved for active processing.
 */
export function RenderLine({ active, progress, label }: { active: boolean; progress: number; label: string }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="h-8" aria-live="polite">
      {active && (
        <>
          <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="render-line"
          >
            <div className="render-line__fill" style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} />
            <div className="render-line__sweep" />
          </div>
          <p className="mt-1.5 flex justify-between gap-3 font-mono text-xs text-signal">
            <span className="truncate">{label}</span>
            <span>{percent}%</span>
          </p>
        </>
      )}
    </div>
  );
}
