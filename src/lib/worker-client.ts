/**
 * Main-thread side of the worker protocol. Workers are created lazily, one per
 * kind, and reused. Cancelling terminates the worker; the next job gets a new one.
 *
 * A Render Chain is executed one step at a time from here, so that each step
 * runs where its tool lives (image worker, pdf worker, or page-coordinated) and
 * the output of every finished step is kept if a later one fails. Consecutive
 * steps of the same kind reuse the same worker, and files move between steps by
 * reference, never by copy.
 */
import type { ChainProgress } from "@/lib/chain-runner";
import { getTool } from "@/tools/registry";
import { KreaError, type ChainStep, type ErrorCode, type ToolResult, type WorkerKind, type WorkFile } from "@/tools/types";
import { unexpectedMessage, type FileInfo, type WorkerRequest, type WorkerResponse } from "@/workers/runtime";

// The URLs must be literal so the bundler can emit each worker as its own chunk.
const factories: Partial<Record<WorkerKind, () => Worker>> = {
  image: () => new Worker(new URL("../workers/image.worker.ts", import.meta.url), { type: "module" }),
  pdf: () => new Worker(new URL("../workers/pdf.worker.ts", import.meta.url), { type: "module" }),
};

interface Pending {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: ChainProgress) => void;
}

const workers = new Map<WorkerKind, Worker>();
const pending = new Map<WorkerKind, Map<number, Pending>>();
let nextId = 1;

function getWorker(kind: WorkerKind): Worker {
  let worker = workers.get(kind);
  if (worker) return worker;

  const create = factories[kind];
  if (!create) throw new KreaError("failed", `No ${kind} worker is available.`);
  worker = create();
  const jobs = new Map<number, Pending>();
  pending.set(kind, jobs);

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const job = jobs.get(message.id);
    if (!job) return;
    if (message.type === "progress") {
      job.onProgress?.({ value: message.value, label: message.label, step: message.step });
      return;
    }
    jobs.delete(message.id);
    if (message.type === "error") job.reject(new KreaError(message.code, message.message));
    else if (message.type === "done") job.resolve(message.result as never);
    else job.resolve(message.info as never);
  };
  worker.onerror = () => {
    // The worker crashed (usually out of memory). Fail every job and start fresh next time.
    stopWorker(kind, new KreaError("failed", "The worker crashed, most likely out of memory. Try a smaller file."));
  };

  workers.set(kind, worker);
  return worker;
}

function stopWorker(kind: WorkerKind, reason: Error): void {
  workers.get(kind)?.terminate();
  workers.delete(kind);
  pending.get(kind)?.forEach((job) => job.reject(reason));
  pending.delete(kind);
}

function send<T>(kind: WorkerKind, request: WorkerRequest, onProgress?: Pending["onProgress"]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = getWorker(kind);
    pending.get(kind)!.set(request.id, { resolve: resolve as Pending["resolve"], reject, onProgress });
    worker.postMessage(request);
  });
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

/** A step failed. Carries which one, and the files produced by the steps before it. */
export class StepError extends Error {
  code: ErrorCode;
  stepIndex: number;
  toolName: string;
  /** Output of the last step that succeeded; undefined when the first step failed. */
  partial?: WorkFile[];
  constructor(cause: Error, stepIndex: number, toolName: string, partial?: WorkFile[]) {
    super(cause.message);
    this.name = "StepError";
    this.code = cause instanceof KreaError ? cause.code : "failed";
    this.stepIndex = stepIndex;
    this.toolName = toolName;
    this.partial = partial;
  }
}

export interface Job {
  promise: Promise<ToolResult>;
  cancel: () => void;
}

/**
 * Page-coordinated tools ("pdfjs", "ocr"): run from the page, while pdf.js and
 * Tesseract do the heavy work in their own workers. Cancelling aborts a signal.
 */
function runOnPage(step: ChainStep, files: WorkFile[], onProgress: (progress: ChainProgress) => void): Job {
  const controller = new AbortController();
  const promise = import("@/lib/chain-runner")
    .then(({ runChain }) => runChain([step], files, onProgress, controller.signal))
    .catch((error: unknown) => {
      if (controller.signal.aborted) throw new CancelledError();
      if (error instanceof KreaError) throw error;
      console.error(error);
      throw new KreaError("failed", unexpectedMessage());
    });
  return { promise, cancel: () => controller.abort() };
}

/** Run one step where its tool lives. */
function runStep(kind: WorkerKind, step: ChainStep, files: WorkFile[], onProgress: (progress: ChainProgress) => void): Job {
  if (kind === "pdfjs" || kind === "ocr") return runOnPage(step, files, onProgress);
  return {
    promise: send<ToolResult>(kind, { type: "run", id: nextId++, steps: [step], files }, onProgress),
    cancel: () => stopWorker(kind, new CancelledError()),
  };
}

/** Run a chain of steps in order. A single Move is a chain with one step. */
export function runSteps(steps: ChainStep[], files: WorkFile[], onProgress: (progress: ChainProgress) => void): Job {
  let cancelled = false;
  let cancelCurrent: (() => void) | null = null;

  const promise = (async (): Promise<ToolResult> => {
    let current = files;
    let view: ToolResult["view"];
    const notes: string[] = [];

    for (let index = 0; index < steps.length; index++) {
      if (cancelled) throw new CancelledError();
      const tool = getTool(steps[index].slug);
      if (!tool) throw new StepError(new KreaError("failed", "This Move no longer exists."), index, steps[index].slug);

      const job = runStep(tool.worker, steps[index], current, (progress) =>
        onProgress({
          value: (index + progress.value) / steps.length,
          label: steps.length > 1 ? `Step ${index + 1} of ${steps.length}: ${progress.label}` : progress.label,
          step: index,
        }),
      );
      cancelCurrent = job.cancel;
      try {
        const result = await job.promise;
        current = result.files;
        view = result.view;
        if (result.note) notes.push(result.note);
      } catch (error) {
        if (cancelled || error instanceof CancelledError) throw new CancelledError();
        throw new StepError(error as Error, index, tool.name, index > 0 ? current : undefined);
      }
    }
    return { files: current, note: notes.join(" ") || undefined, view };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      cancelCurrent?.();
    },
  };
}

/** Read dimensions or page count for the file list. Resolves to null when the file cannot be read. */
export async function probeFile(kind: WorkerKind, file: WorkFile): Promise<FileInfo | null> {
  // A cancel elsewhere terminates the shared worker; that is not the file's fault, so retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await send<FileInfo>(kind, { type: "probe", id: nextId++, file });
    } catch (error) {
      if (!(error instanceof CancelledError)) return null;
    }
  }
  return null;
}

/** Terminate every worker, releasing all memory they hold. Used by "Wipe session". */
export function stopAllWorkers(): void {
  for (const kind of [...workers.keys()]) stopWorker(kind, new CancelledError());
}
