"use client";

import { CircleCheck, DownloadCloud, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { formatBytes } from "@/lib/file-type";
import { makeOfflineReady, offlineUnavailableReason } from "@/lib/offline";
import { Button } from "./button";

type State =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number; group: string }
  | { phase: "done"; total: number }
  | { phase: "error"; message: string };

/**
 * "Make offline-ready": downloads the AI background-removal model, OCR data
 * and PDF engines into the browser cache in one go, with a progress bar.
 */
export function OfflineReady({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>({ phase: "idle" });

  const start = async () => {
    const reason = offlineUnavailableReason();
    if (reason) {
      setState({ phase: "error", message: reason });
      return;
    }
    if (navigator.onLine === false) {
      setState({ phase: "error", message: "Offline ka ngayon. Connect to the internet first, then try again." });
      return;
    }
    setState({ phase: "running", done: 0, total: 0, group: "Starting" });
    try {
      const result = await makeOfflineReady((message) => {
        if (message.type === "progress") setState({ phase: "running", done: message.done, total: message.total, group: message.group });
      });
      if (result.type === "done") setState({ phase: "done", total: result.total });
      else if (result.type === "error") {
        setState({
          phase: "error",
          message: result.failed.length
            ? `${result.failed.length} file(s) could not be downloaded. Check your connection and press the button again; finished files are kept.`
            : `Hindi natapos: ${result.message ?? "unknown error"}.`,
        });
      }
    } catch (error) {
      setState({ phase: "error", message: (error as Error).message });
    }
  };

  const percent = state.phase === "running" && state.total ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div className={compact ? "" : "rounded-xl border border-line bg-panel p-4"}>
      {!compact && (
        <p className="mb-3 text-sm leading-relaxed text-muted">
          Downloads the AI background-removal model, OCR language data and PDF engines (about 80 MB) so every tool
          works without internet. Gagamitin lang ang storage ng browser mo.
        </p>
      )}
      <Button variant={state.phase === "done" ? "outline" : "primary"} className="w-full sm:w-auto" disabled={state.phase === "running"} onClick={start}>
        <DownloadCloud aria-hidden className="size-4" strokeWidth={1.75} />
        {state.phase === "done" ? "Check again" : "Make offline-ready"}
      </Button>

      <div aria-live="polite" className="mt-3 text-sm">
        {state.phase === "running" && (
          <div>
            <div
              role="progressbar"
              aria-label="Downloading for offline use"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="render-line"
            >
              <div className="render-line__fill" style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }} />
            </div>
            <p className="mt-1.5 flex justify-between gap-3 font-mono text-xs text-signal">
              <span>{state.group}</span>
              <span>
                {state.total ? `${formatBytes(state.done)} / ${formatBytes(state.total)}` : "…"} · {percent}%
              </span>
            </p>
          </div>
        )}
        {state.phase === "done" && (
          <p className="flex items-start gap-2 text-fg">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
            Handa na. {formatBytes(state.total)} saved; every tool now works offline in this browser.
          </p>
        )}
        {state.phase === "error" && (
          <p role="alert" className="flex items-start gap-2 text-fg">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.75} />
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
