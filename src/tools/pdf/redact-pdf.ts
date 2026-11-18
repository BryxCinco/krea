/**
 * Tool 50: Redact PDF. True redaction: every page with a black box is
 * re-rendered as an image with the boxes painted into the pixels, and the
 * original page (its text, images and fonts) is replaced by that image. Nothing
 * under a box survives, not even for copy-paste or text search. Pages without
 * boxes are copied unchanged. Document metadata, bookmarks and attachments are
 * not carried over, because they can hold the same secrets.
 * UI: components/stage/editors/redact-pdf-editor.tsx.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDF_MIME } from "@/lib/file-type";
import { encodeRendered, renderPageToCanvas } from "@/lib/pdf-render";
import { loadPdf } from "@/lib/pdf-utils";
import { editorTool } from "../text/editor-tool";
import { KreaError } from "../types";

export const redactPdf = editorTool(
  {
    id: 50,
    slug: "redact-pdf",
    name: "Redact PDF",
    verb: "Redact PDF",
    description: "Black out names, numbers and signatures in a PDF for good. The text under the boxes is removed, not just covered.",
    seoTitle: "Redact PDF: permanently black out text, offline",
    seoDescription:
      "Permanently redact a PDF in your browser: draw black boxes or find text such as a TIN or account number. Marked pages are rebuilt as images, so the hidden text cannot be copied or searched. No upload.",
    howTo: [
      "Open a PDF.",
      "Drag black boxes over what must go, or type a word or number in Find text to box every match.",
      "Download. Pages with boxes become images, so the text under them is gone for good.",
    ],
    faqs: [
      { q: "Is this real redaction, or just a black box on top?", a: "Real. A black rectangle drawn in most editors can be removed, or the text under it copied. Krea turns every page you mark into an image with the black boxes painted in, so the hidden text no longer exists in the file." },
      { q: "Why can I no longer select text on some pages?", a: "Because those pages were rebuilt as images to remove what was under the boxes. Pages without boxes keep their text. Use 300 DPI if the redacted page must stay sharp for printing." },
      { q: "Does Find text catch everything?", a: "It finds text that the PDF stores as text. Scanned pages are pictures, so their words cannot be searched: box them by hand. Always look over every page before you send the file." },
      { q: "Is anything else removed?", a: "Yes. The title, author and other document details, bookmarks and attached files are left out, since they can contain the same names or numbers." },
      { q: "Is my PDF uploaded?", a: "No. Redaction happens entirely in your browser, which matters most for exactly the kind of document you redact." },
    ],
    icon: "pdfredact",
  },
  "pdf",
);

/** A black box in points on the page as seen (rotation applied), origin top-left. */
export interface RedactionBox {
  id: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Boxes around every text run that contains `query` (case-insensitive), on every page.
 * A whole run is boxed, which may cover a little more than the match: safer than less.
 */
export async function findText(doc: PDFDocumentProxy, query: string, firstId: number): Promise<RedactionBox[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) throw new KreaError("failed", "Type at least 2 characters to search.");
  const boxes: RedactionBox[] = [];
  let id = firstId;
  for (let p = 0; p < doc.numPages; p++) {
    const page = await doc.getPage(p + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.toLowerCase().includes(needle)) continue;
      const [a, b, c, d, e, f] = item.transform as number[];
      // The run's own axes: along the text (a, b) and up (c, d), in PDF units.
      const along = Math.hypot(a, b) || 1;
      const up = Math.hypot(c, d) || 1;
      const height = item.height || up;
      const ax = (a / along) * item.width;
      const ay = (b / along) * item.width;
      const ux = (c / up) * height;
      const uy = (d / up) * height;
      // From a little below the baseline (descenders) to the top of the run.
      const corners = [
        [e - ux * 0.25, f - uy * 0.25],
        [e + ax - ux * 0.25, f + ay - uy * 0.25],
        [e + ux, f + uy],
        [e + ax + ux, f + ay + uy],
      ].map(([x, y]) => viewport.convertToViewportPoint(x, y) as number[]);
      const xs = corners.map((point) => point[0]);
      const ys = corners.map((point) => point[1]);
      const pad = 1.5;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      boxes.push({ id: id++, page: p, x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y });
    }
    page.cleanup();
  }
  return boxes;
}

export interface RedactResult {
  bytes: Uint8Array;
  /** Zero-based pages that were rebuilt as images. */
  rasterized: number[];
  reduced: boolean;
}

/**
 * Build the redacted PDF. `doc` is the pdf.js document (for rendering), `file`
 * the original bytes (for copying untouched pages with pdf-lib).
 */
export async function redact(
  file: Blob,
  name: string,
  doc: PDFDocumentProxy,
  boxes: RedactionBox[],
  dpi: number,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<RedactResult> {
  if (!boxes.length) throw new KreaError("failed", "Wala pang itim na kahon. Draw a box over what to remove, or use Find text.");
  const { PDFDocument } = await import("pdf-lib");
  const source = await loadPdf({ name, type: PDF_MIME, blob: file });
  const output = await PDFDocument.create();
  const marked = new Set(boxes.map((box) => box.page));
  const total = source.getPageCount();
  let reduced = false;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new KreaError("failed", "Cancelled.");
    onProgress(i / total);
    if (!marked.has(i)) {
      const [copy] = await output.copyPages(source, [i]);
      output.addPage(copy);
      continue;
    }
    const page = await doc.getPage(i + 1);
    const { width, height } = page.getViewport({ scale: 1 });
    page.cleanup();
    const rendered = await renderPageToCanvas(doc, i, dpi / 72);
    reduced ||= rendered.reduced;
    const draw = rendered.canvas.getContext("2d");
    if (!draw) throw new KreaError("failed", "Could not create a drawing surface. Try closing other tabs.");
    draw.fillStyle = "#000000";
    for (const box of boxes.filter((entry) => entry.page === i)) {
      // Round outwards to whole pixels so no anti-aliased edge of a letter peeks out.
      const x = Math.floor(box.x * rendered.scale);
      const y = Math.floor(box.y * rendered.scale);
      draw.fillRect(x, y, Math.ceil((box.x + box.w) * rendered.scale) - x, Math.ceil((box.y + box.h) * rendered.scale) - y);
    }
    const jpg = await encodeRendered(rendered.canvas, i, "image/jpeg", 0.9);
    const image = await output.embedJpg(await jpg.arrayBuffer());
    output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }
  onProgress(0.97);
  output.setProducer("Krea");
  output.setCreator("Krea");
  return { bytes: await output.save(), rasterized: [...marked].sort((a, b) => a - b), reduced };
}
