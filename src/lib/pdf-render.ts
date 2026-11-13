/**
 * PDF rendering with pdf.js.
 *
 * Unlike every other tool, this code runs on the main thread: pdf.js's display
 * layer needs the DOM (fonts, canvas factories) and cannot be hosted inside our
 * own worker. The heavy work still happens off the main thread, because pdf.js
 * parses documents in its parser worker and rasterizes pages in its renderer
 * worker. This module only coordinates them.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { KreaError, type WorkFile } from "@/tools/types";

/** Largest canvas area we render, to stay inside mobile browser limits. */
export const MAX_RENDER_PIXELS = 32_000_000;

export interface OpenPdf {
  pdf: PDFDocumentProxy;
  /** Release the document and its workers' memory. */
  close: () => Promise<void>;
}

export async function openPdf(file: WorkFile): Promise<OpenPdf> {
  const pdfjs = await import("pdfjs-dist");
  // Static copies of pdf.js's own workers and data files (see the "assets" script in package.json).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  pdfjs.GlobalWorkerOptions.rendererSrc = "/pdfjs/pdf.renderer.min.mjs";

  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.blob.arrayBuffer()),
    cMapUrl: "/pdfjs/cmaps/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
  });
  try {
    return { pdf: await task.promise, close: () => task.destroy() };
  } catch (error) {
    await task.destroy().catch(() => {});
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new KreaError("password", `"${file.name}" is password-protected. I-unlock muna bago gamitin dito.`);
    }
    throw new KreaError("corrupted", `Hindi mabasa ang "${file.name}". The PDF looks corrupted or incomplete.`);
  }
}

export interface RenderedPage {
  blob: Blob;
  /** Rendered size in pixels. */
  width: number;
  height: number;
  /** True when the page was rendered below the requested scale to stay memory-safe. */
  reduced: boolean;
}

/** Render one page (zero-based index) to an image. `scale` 1 = 72 DPI. */
export async function renderPage(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  scale: number,
  mime: string,
  quality?: number,
): Promise<RenderedPage> {
  const page = await pdf.getPage(pageIndex + 1);
  try {
    const base = page.getViewport({ scale: 1 });
    const maxScale = Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height));
    const reduced = scale > maxScale;
    const viewport = page.getViewport({ scale: Math.min(scale, maxScale) });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // White page background: PDFs are transparent by default and JPEG has no alpha.
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    const { width, height } = canvas;
    // Shrinking the canvas releases its backing store right away instead of waiting for GC.
    canvas.width = canvas.height = 0;
    if (!blob) throw new KreaError("failed", `Page ${pageIndex + 1} could not be converted to an image.`);
    return { blob, reduced, width, height };
  } finally {
    page.cleanup();
  }
}
