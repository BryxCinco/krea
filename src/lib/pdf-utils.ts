/**
 * PDF editing helpers built on pdf-lib (worker-side). pdf-lib is imported
 * lazily so it only loads when a PDF tool runs. Rendering lives in pdf-render.ts.
 */
import type { PDFDocument } from "pdf-lib";
import { KreaError, type WorkFile } from "@/tools/types";

/** Load a PDF for editing, mapping pdf-lib failures to clear, specific errors. */
export async function loadPdf(file: WorkFile): Promise<PDFDocument> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes = await file.blob.arrayBuffer();
  try {
    const pdf = await PDFDocument.load(bytes);
    // pdf-lib parses lazily: a damaged file can load "successfully" and only
    // fail when the page tree is read, so touch it here.
    pdf.getPageCount();
    return pdf;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/encrypted/i.test(message)) {
      throw new KreaError("password", `"${file.name}" is password-protected. I-unlock muna bago gamitin dito.`);
    }
    throw new KreaError("corrupted", `Hindi mabasa ang "${file.name}". The PDF looks corrupted or incomplete.`);
  }
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}

/**
 * Parse a page-range string like "1-3, 5, 8-" into groups of zero-based page
 * indexes, one group per comma-separated part. Throws on anything out of range.
 */
export function parsePageRanges(input: string, pageCount: number): number[][] {
  const groups: number[][] = [];
  for (const raw of input.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const match = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(part);
    if (!match || (!match[1] && !match[3])) {
      throw new KreaError("failed", `"${part}" is not a valid page range. Use something like 1-3, 5, 8-10.`);
    }
    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? (match[3] ? Number(match[3]) : pageCount) : start;
    if (start < 1 || end > pageCount || start > end) {
      throw new KreaError("failed", `Range "${part}" is outside this PDF, which has ${pageCount} pages.`);
    }
    groups.push(Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i));
  }
  return groups;
}

/** Flatten ranges to a sorted, de-duplicated page list. Empty input means every page. */
export function parsePageList(input: string, pageCount: number): number[] {
  if (!input.trim()) return Array.from({ length: pageCount }, (_, i) => i);
  return [...new Set(parsePageRanges(input, pageCount).flat())].sort((a, b) => a - b);
}
