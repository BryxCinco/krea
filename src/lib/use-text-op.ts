"use client";

import { useEffect, useRef, useState } from "react";
import type { TextOp, TextOpResult } from "@/tools/text/text-toolkit";
import type { TextWorkerRequest, TextWorkerResponse } from "@/workers/text.worker";

/** A pattern that takes longer than this is assumed to be stuck (catastrophic backtracking). */
const TIMEOUT_MS = 5000;

export type TextOpState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; result: TextOpResult }
  | { status: "error"; message: string };

/**
 * Runs a Text Toolkit operation in a Web Worker whenever `request` changes (null = do nothing).
 * Pass a memoised request so its identity only changes when the text or options do.
 * Stale answers are dropped. If a run is stuck, the worker is terminated and replaced,
 * so the page never freezes.
 */
export function useTextOp(request: TextOp | null, delay = 120): TextOpState {
  const [state, setState] = useState<TextOpState>({ status: "idle" });
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const busySince = useRef<number | null>(null);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!request) {
      latest.current++;
      return;
    }
    const id = ++latest.current;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      // A previous request that is still running blocks the queue: replace the worker.
      if (busySince.current !== null && Date.now() - busySince.current > 400) {
        worker.current?.terminate();
        worker.current = null;
        busySince.current = null;
      }
      if (!worker.current) {
        worker.current = new Worker(new URL("../workers/text.worker.ts", import.meta.url), { type: "module" });
      }
      const current = worker.current;
      busySince.current ??= Date.now();
      setState({ status: "working" });
      current.onmessage = (event: MessageEvent<TextWorkerResponse>) => {
        const response = event.data;
        if (response.id !== latest.current) return;
        clearTimeout(watchdog);
        busySince.current = null;
        setState(response.ok ? { status: "done", result: response.result } : { status: "error", message: response.message });
      };
      current.onerror = () => {
        clearTimeout(watchdog);
        busySince.current = null;
        setState({ status: "error", message: "The text tools could not start. Reload the page and try again." });
      };
      watchdog = setTimeout(() => {
        if (id !== latest.current) return;
        current.terminate();
        if (worker.current === current) worker.current = null;
        busySince.current = null;
        setState({ status: "error", message: "Natagalan masyado, so Krea stopped it. The pattern may be too complex for this much text. Try a simpler pattern." });
      }, TIMEOUT_MS);
      current.postMessage({ id, ...request } satisfies TextWorkerRequest);
    }, delay);
    return () => {
      clearTimeout(timer);
      clearTimeout(watchdog);
    };
  }, [request, delay]);

  return state;
}
