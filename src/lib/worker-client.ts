/**
 * Main-thread side of the worker protocol. Workers are created lazily, one per
 * kind, and reused. Cancelling terminates the worker; the next job gets a new one.
 */
import type { ChainProgress } from "@/lib/chain-runner";
import { KreaError, type ChainStep, type ToolResult, type WorkerKind, type WorkFile } from "@/tools/types";
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

export interface Job {
  promise: Promise<ToolResult>;
  cancel: () => void;
}

/**
 * "pdfjs" tools: run the chain from the page (pdf.js does its heavy work in its
 * own workers). Cancelling aborts a signal the tool checks between pages.
 */
function runOnPage(steps: ChainStep[], files: WorkFile[], onProgress: (progress: ChainProgress) => void): Job {
  const controller = new AbortController();
  const promise = import("@/lib/chain-runner")
    .then(({ runChain }) => runChain(steps, files, onProgress, controller.signal))
    .catch((error: unknown) => {
      if (controller.signal.aborted) throw new CancelledError();
      if (error instanceof KreaError) throw error;
      console.error(error);
      throw new KreaError("failed", unexpectedMessage());
    });
  return { promise, cancel: () => controller.abort() };
}

/** Run a chain of steps (a single Move is one step) in the given worker. */
export function runSteps(
  kind: WorkerKind,
  steps: ChainStep[],
  files: WorkFile[],
  onProgress: (progress: ChainProgress) => void,
): Job {
  if (kind === "pdfjs") return runOnPage(steps, files, onProgress);
  const id = nextId++;
  return {
    promise: send<ToolResult>(kind, { type: "run", id, steps, files }, onProgress),
    cancel: () => stopWorker(kind, new CancelledError()),
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
