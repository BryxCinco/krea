/**
 * Reads the text layer of a PDF with pdf.js and rebuilds lines and paragraphs.
 * Shared by PDF to Word & Text (55) and Compare PDFs (56). Like pdf-render.ts it
 * runs on the page ("pdfjs" tools): pdf.js parses in its own worker.
 *
 * PDFs store positioned runs of text, not paragraphs, so this works from
 * geometry: runs on the same baseline make a line, a larger gap or a short
 * line ending in punctuation ends a paragraph, and larger text is a heading.
 * Scanned pages have no text layer at all; those need OCR (tool 20).
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

/** The fields of pdf.js's TextItem we use (the type itself is not exported from the package root). */
interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

export interface TextLine {
  text: string;
  /** Left edge, right edge and baseline in points, top-left origin, page as seen. */
  x: number;
  endX: number;
  y: number;
  /** Font size in points (the largest run on the line). */
  size: number;
}

export interface Paragraph {
  text: string;
  /** 0 for body text, 1 or 2 for headings (by font size). */
  heading: 0 | 1 | 2;
}

/** The lines of one page (zero-based index), in reading order. */
export async function pageLines(pdf: PDFDocumentProxy, pageIndex: number): Promise<TextLine[]> {
  const { Util } = await import("pdfjs-dist");
  const page = await pdf.getPage(pageIndex + 1);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines: TextLine[] = [];
    let current: TextLine | null = null;
    let lastEOL = false;
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const item = raw as unknown as TextItem;
      // Device space: rotation applied, y grows downward.
      const m = Util.transform(viewport.transform, item.transform) as number[];
      const size = Math.hypot(m[2], m[3]) || Math.abs(item.height) || 1;
      const x = m[4];
      const y = m[5];
      const width = Math.abs(item.width);
      if (!item.str) {
        if (item.hasEOL) lastEOL = true;
        continue;
      }
      const sameLine = current && !lastEOL && Math.abs(y - current.y) < Math.min(size, current.size) * 0.5 && x > current.x - size;
      if (current && sameLine) {
        const gap = x - current.endX;
        // Runs are often split mid-word; add a space only where there is visible room for one.
        if (gap > size * 0.15 && !/\s$/.test(current.text) && !/^\s/.test(item.str)) current.text += " ";
        current.text += item.str;
        current.endX = Math.max(current.endX, x + width);
        current.size = Math.max(current.size, size);
      } else {
        if (current) lines.push(current);
        current = { text: item.str, x, endX: x + width, y, size };
      }
      lastEOL = item.hasEOL;
    }
    if (current) lines.push(current);
    return lines.map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() })).filter((line) => line.text);
  } finally {
    page.cleanup();
  }
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const BULLET = /^([•◦▪‣\-–*]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s/i;

/**
 * Join lines into paragraphs. `bodySize` is the usual text size of the whole
 * document, so headings are judged consistently across pages.
 */
export function toParagraphs(lines: TextLine[], bodySize: number): Paragraph[] {
  if (!lines.length) return [];
  const gaps = lines.slice(1).map((line, i) => line.y - lines[i].y).filter((gap) => gap > 0);
  const usualGap = median(gaps) || bodySize * 1.2;
  const rightEdge = Math.max(...lines.map((line) => line.endX));
  const headingOf = (size: number): Paragraph["heading"] => (size >= bodySize * 1.6 ? 1 : size >= bodySize * 1.2 ? 2 : 0);

  const paragraphs: Paragraph[] = [];
  let text = lines[0].text;
  let heading = headingOf(lines[0].size);
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    const gap = line.y - prev.y;
    const nextHeading = headingOf(line.size);
    const breaks =
      gap > usualGap * 1.45 ||
      gap < 0 ||
      nextHeading !== heading ||
      Math.abs(line.size - prev.size) > prev.size * 0.15 ||
      BULLET.test(line.text) ||
      (prev.endX < rightEdge - prev.size * 4 && /[.!?:;”"')\]]$/.test(prev.text));
    if (breaks) {
      paragraphs.push({ text, heading });
      text = line.text;
      heading = nextHeading;
    } else if (/[a-z]-$/i.test(text) && /^[a-z]/.test(line.text)) {
      // A word hyphenated across lines: "docu-" + "ment" is "document".
      text = text.slice(0, -1) + line.text;
    } else {
      text += ` ${line.text}`;
    }
  }
  paragraphs.push({ text, heading });
  // Headings are short; a long "heading" is just large body text.
  return paragraphs.map((paragraph) => (paragraph.heading && paragraph.text.length > 160 ? { ...paragraph, heading: 0 } : paragraph));
}

/** The most common font size across pages, weighted by characters. */
export function bodyFontSize(pages: TextLine[][]): number {
  const counts = new Map<number, number>();
  for (const line of pages.flat()) {
    const key = Math.round(line.size * 2) / 2;
    counts.set(key, (counts.get(key) ?? 0) + line.text.length);
  }
  let best = 11;
  let bestCount = -1;
  for (const [size, count] of counts) {
    if (count > bestCount) {
      best = size;
      bestCount = count;
    }
  }
  return best;
}
