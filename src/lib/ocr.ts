/**
 * OCR with Tesseract (page-side coordinator).
 *
 * Tesseract.js runs recognition in its own Web Worker. Everything it needs is
 * self-hosted under /tesseract (copied from node_modules by copy-assets.mjs):
 * the worker script, the WebAssembly core and the English and Filipino language
 * data. Nothing is fetched from a third-party CDN, and the service worker caches
 * these files after first use so OCR then works offline.
 */
import { KreaError } from "@/tools/types";

export type OcrLanguage = "eng" | "fil" | "eng+fil";

export interface OcrSession {
  recognize: (image: Blob) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Start a Tesseract worker for the given languages.
 * `onProgress` receives 0..1 for the page currently being recognized.
 */
export async function startOcr(language: OcrLanguage, onProgress: (value: number) => void, signal?: AbortSignal): Promise<OcrSession> {
  let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker(language.split("+"), 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract/lang",
      gzip: true,
      logger: (message) => {
        if (message.status === "recognizing text") onProgress(message.progress);
      },
    });
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new KreaError(
      "failed",
      offline
        ? "Offline ka, at hindi pa na-download ang OCR language data. Run OCR once while online, then it works offline."
        : "The OCR engine could not start. Reload the page and try again.",
    );
  }

  // Cancel: terminating the worker stops recognition immediately and frees its memory.
  const abort = () => void worker.terminate();
  signal?.addEventListener("abort", abort);

  return {
    recognize: async (image) => (await worker.recognize(image)).data.text,
    close: async () => {
      signal?.removeEventListener("abort", abort);
      await worker.terminate();
    },
  };
}
