/**
 * Tool 49: PDF Annotator. Type text anywhere (including on scanned forms that
 * have no fields), highlight, draw boxes and write freehand. Marks are drawn
 * into the page content with pdf-lib, so they look the same in every app and
 * print. Positions are kept in points of the page as seen on screen and mapped
 * back through the page's rotation on export.
 * UI: components/stage/editors/annotate-editor.tsx.
 */
import { PDF_MIME } from "@/lib/file-type";
import { fontSanitizer } from "@/lib/pdf-text";
import { loadPdf } from "@/lib/pdf-utils";
import { editorTool } from "../text/editor-tool";
import { KreaError } from "../types";

export const annotatePdf = editorTool(
  {
    id: 49,
    slug: "pdf-annotator",
    name: "PDF Annotator",
    verb: "Annotate PDF",
    description: "Type on any PDF, highlight lines, draw boxes and write by hand, even on scanned forms.",
    seoTitle: "PDF Annotator: type, highlight and draw on a PDF, offline",
    seoDescription:
      "Add text to any PDF, including scanned forms without fields, highlight passages, draw boxes and write freehand. Marks are saved into the page. Free, in your browser, no upload.",
    howTo: [
      "Open a PDF.",
      "Pick Text, Highlight, Box or Pen. For text, type it first, then tap where it goes. Drag on the page for the others.",
      "Undo or remove marks from the list, then download the annotated PDF.",
    ],
    faqs: [
      { q: "Can I fill in a scanned form with this?", a: "Yes. That is what the Text tool is for: type your answer, then tap the blank line on the page. For forms with real fields, PDF Form Filler is faster." },
      { q: "Can the marks be edited later?", a: "Not in other apps: Krea draws them into the page, so they look the same everywhere and cannot be moved by accident. Keep the original PDF if you may want to change them." },
      { q: "Can I type ñ and other accents?", a: "Yes, Latin letters with accents work. Emoji and non-Latin scripts cannot be printed by the built-in PDF font and are replaced with ?." },
      { q: "Is my PDF uploaded?", a: "No. Everything happens in your browser, and your marks are kept only until you close the tab." },
    ],
    icon: "annotate",
  },
  "pdf",
);

export type AnnotationKind = "text" | "highlight" | "box" | "pen";

/** All coordinates are in PDF points on the page as seen (rotation applied), origin top-left. */
interface Base {
  id: number;
  page: number;
  /** Size of the page as seen when the mark was made, so marks map back exactly. */
  pageW: number;
  pageH: number;
  color: string;
}
export type Annotation =
  | (Base & { kind: "text"; x: number; y: number; text: string; size: number })
  | (Base & { kind: "highlight" | "box"; x: number; y: number; w: number; h: number; width: number })
  | (Base & { kind: "pen"; points: [number, number][]; width: number });

export const INK_COLORS = ["#111111", "#c81e1e", "#1d4ed8", "#15803d"];
export const HIGHLIGHT_COLORS = ["#facc15", "#4ade80", "#f472b6", "#38bdf8"];
export const TEXT_LINE_HEIGHT = 1.2;
/** Cap height of Helvetica as a share of the font size: where the first baseline sits below the top. */
export const TEXT_ASCENT = 0.78;

/**
 * Page-as-seen point (u, v in 0..1, v down) to PDF user space on the unrotated
 * page. Readers turn a page clockwise by /Rotate; this undoes that.
 */
export function toPdfPoint(u: number, v: number, box: { x: number; y: number; w: number; h: number }, rotation: number): [number, number] {
  const { x, y, w, h } = box;
  switch (rotation) {
    case 90:
      return [x + v * w, y + u * h];
    case 180:
      return [x + w - u * w, y + v * h];
    case 270:
      return [x + w - v * w, y + h - u * h];
    default:
      return [x + u * w, y + h - v * h];
  }
}

const hexColor = async (hex: string) => {
  const { rgb } = await import("pdf-lib");
  const value = hex.replace("#", "");
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
};

/** Draw the marks into a copy of the PDF. Returns the bytes and how many characters became "?". */
export async function applyAnnotations(file: Blob, name: string, annotations: Annotation[]): Promise<{ bytes: Uint8Array; replaced: number }> {
  if (!annotations.length) throw new KreaError("failed", "Wala pang marka. Add text, a highlight, a box or a drawing first.");
  const { StandardFonts, degrees, BlendMode, LineCapStyle, PDFName, PDFNumber } = await import("pdf-lib");
  const pdf = await loadPdf({ name, type: PDF_MIME, blob: file });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { clean, state } = fontSanitizer(font);

  for (const pageIndex of new Set(annotations.map((mark) => mark.page))) {
    const page = pdf.getPage(pageIndex);
    const label = `Page ${pageIndex + 1}`;
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (rotation % 90 !== 0) throw new KreaError("failed", `${label} is rotated by ${rotation}°, not a quarter turn, so marks cannot be placed accurately.`);
    const unit = page.node.get(PDFName.of("UserUnit"));
    if (unit instanceof PDFNumber && unit.asNumber() !== 1) throw new KreaError("failed", `${label} uses a custom page unit (UserUnit ${unit.asNumber()}), so marks would land in the wrong place.`);
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const bx = Math.max(media.x, crop.x);
    const by = Math.max(media.y, crop.y);
    const box = { x: bx, y: by, w: Math.min(media.x + media.width, crop.x + crop.width) - bx, h: Math.min(media.y + media.height, crop.y + crop.height) - by };
    if (!(box.w > 0 && box.h > 0)) throw new KreaError("corrupted", `${label} has no visible area, so it cannot be annotated.`);

    // Keep the page's own drawing state from moving our marks (same guard as page numbers).
    const context = pdf.context;
    const startRef = context.register(context.stream("q\n"));
    const endRef = context.register(context.stream("\nQ\n"));
    if (!page.node.wrapContentStreams(startRef, endRef)) {
      const existing = page.node.get(PDFName.of("Contents"));
      if (existing) page.node.set(PDFName.of("Contents"), context.obj([startRef, existing, endRef]));
    }

    for (const mark of annotations.filter((entry) => entry.page === pageIndex)) {
      // Points on the page as seen; the scale factor turns them into PDF units of this page.
      const scale = (rotation % 180 === 0 ? box.w : box.h) / mark.pageW;
      const at = (px: number, py: number) => toPdfPoint(px / mark.pageW, py / mark.pageH, box, rotation);
      const color = await hexColor(mark.color);
      if (mark.kind === "text") {
        const size = mark.size * scale;
        mark.text.split("\n").forEach((line, i) => {
          const text = clean(line);
          if (!text) return;
          const [x, y] = at(mark.x, mark.y + (TEXT_ASCENT + i * TEXT_LINE_HEIGHT) * mark.size);
          page.drawText(text, { x, y, size, font, color, rotate: degrees(rotation) });
        });
      } else if (mark.kind === "pen") {
        for (let i = 1; i < mark.points.length; i++) {
          const [x1, y1] = at(...mark.points[i - 1]);
          const [x2, y2] = at(...mark.points[i]);
          page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: mark.width * scale, color, lineCap: LineCapStyle.Round });
        }
        if (mark.points.length === 1) {
          const [x, y] = at(...mark.points[0]);
          page.drawCircle({ x, y, size: (mark.width * scale) / 2, color });
        }
      } else {
        const [x1, y1] = at(mark.x, mark.y);
        const [x2, y2] = at(mark.x + mark.w, mark.y + mark.h);
        const rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
        if (mark.kind === "highlight") page.drawRectangle({ ...rect, color, opacity: 0.4, blendMode: BlendMode.Multiply });
        else page.drawRectangle({ ...rect, borderColor: color, borderWidth: mark.width * scale });
      }
    }
  }
  return { bytes: await pdf.save(), replaced: state.replaced };
}
