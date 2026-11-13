/**
 * Shared worker runtime. Each worker entry (image, pdf, ...) calls
 * startWorker(); the message protocol below is the same for all of them.
 * Cancelling is done by terminating the worker from the main thread, which
 * also frees every decoded bitmap and buffer at once.
 */
import { runChain } from "@/lib/chain-runner";
import { KreaError, type ChainStep, type ErrorCode, type ToolResult, type WorkFile } from "@/tools/types";

export type WorkerRequest =
  | { type: "run"; id: number; steps: ChainStep[]; files: WorkFile[] }
  | { type: "probe"; id: number; file: WorkFile };

/** Cheap facts about a file for the Stage's file list. */
export interface FileInfo {
  width?: number;
  height?: number;
  pages?: number;
  locked?: boolean;
}

export type WorkerResponse =
  | { type: "progress"; id: number; value: number; label: string; step: number }
  | { type: "done"; id: number; result: ToolResult }
  | { type: "probed"; id: number; info: FileInfo }
  | { type: "error"; id: number; code: ErrorCode; message: string };

/** Message for errors we did not anticipate. Offline, the usual cause is tool code that was never downloaded. */
export function unexpectedMessage(): string {
  return navigator.onLine === false
    ? "Offline ka, at hindi pa na-download ang tool na ito. Connect once so Krea can save it, then it works offline."
    : "May problema sa pag-process. The file may be damaged, or the device ran out of memory.";
}

async function probe(file: WorkFile): Promise<FileInfo> {
  if (file.type === "application/pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(await file.blob.arrayBuffer(), { ignoreEncryption: true });
    // Encrypted files cannot report a reliable page count until unlocked.
    return pdf.isEncrypted ? { locked: true } : { pages: pdf.getPageCount() };
  }
  const bitmap = await createImageBitmap(file.blob, { imageOrientation: "from-image" });
  const info = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return info;
}

export function startWorker(): void {
  const post = (message: WorkerResponse) => self.postMessage(message);

  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    try {
      if (request.type === "probe") {
        post({ type: "probed", id: request.id, info: await probe(request.file) });
        return;
      }
      const result = await runChain(request.steps, request.files, (progress) =>
        post({ type: "progress", id: request.id, ...progress }),
      );
      post({ type: "done", id: request.id, result });
    } catch (error) {
      const known = error instanceof KreaError;
      // Unreadable files are an expected probe outcome, not worth a console error.
      if (!known && request.type === "run") console.error(error);
      post({
        type: "error",
        id: request.id,
        code: known ? error.code : "failed",
        message: known ? error.message : unexpectedMessage(),
      });
    }
  };
}
