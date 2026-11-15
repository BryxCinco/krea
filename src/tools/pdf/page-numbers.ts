/**
 * Tool 28: PDF Page Numbers & Header/Footer.
 *
 * Text is placed in the page as the reader sees it: the visible area is the CropBox
 * (clipped to the MediaBox), and pages stored with a /Rotate of 90, 180 or 270 get
 * upright text. Anything that cannot be placed correctly is refused with a page number
 * and a reason, instead of producing numbers in the wrong spot.
 */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { loadPdf, parsePageList, pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

const SLOTS = [
  { value: "bottom-center", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top-center", label: "Top centre" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
];
const HEADER_SLOTS = SLOTS.filter((slot) => slot.value.startsWith("top"));
const FOOTER_SLOTS = SLOTS.filter((slot) => slot.value.startsWith("bottom"));

/** "Page 3 of 12" style label for one page. */
export function pageLabel(format: string, number: number, last: number): string {
  switch (format) {
    case "page-of":
      return `Page ${number} of ${last}`;
    case "slash":
      return `${number} / ${last}`;
    case "none":
      return "";
    default:
      return String(number);
  }
}

export const pageNumbers: Tool = {
  id: 28,
  slug: "pdf-page-numbers",
  name: "PDF Page Numbers & Header/Footer",
  verb: "Number pages",
  category: "pdf",
  description: "Add page numbers and header or footer text to a PDF.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Add page numbers to a PDF: Page 1 of N, headers and footers",
  seoDescription:
    "Number the pages of a PDF in your browser: choose the format, position, size, start number and page range, and add header or footer text. Nothing is uploaded.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Pick the number format and position. Add header or footer text if you want it, and choose which pages to number.",
    "Press Number pages and download the PDF.",
  ],
  faqs: [
    { q: "Is my PDF uploaded?", a: "No. The numbers are added inside your browser, and the file never leaves your device." },
    { q: "Can I skip the cover page?", a: "Yes. Type the pages to number, for example 2-, and turn on Start counting at the first numbered page so the second page becomes page 1." },
    { q: "What does the total in Page 1 of N mean?", a: "N is the last page number. With a start number of 1 it is the page count of the PDF. If you start at 5 on a 10-page PDF, the last page reads Page 14 of 14." },
    { q: "Does it work on rotated or scanned pages?", a: "Yes. Pages stored sideways get upright numbers in the right corner. If a page has an unusual setup that Krea cannot place text on correctly, it stops and tells you which page and why, rather than putting numbers in the wrong place." },
    { q: "Why are some characters refused?", a: "Numbers and header text use a font built into every PDF reader, which covers Latin letters, numbers and common symbols. Other characters are refused instead of showing as boxes." },
  ],
  icon: "pagenumber",
  worker: "pdf",
  input: "each",
  fields: [
    {
      key: "format",
      label: "Number format",
      type: "select",
      default: "page-of",
      options: [
        { value: "n", label: "1" },
        { value: "page-of", label: "Page 1 of N" },
        { value: "slash", label: "1 / N" },
        { value: "none", label: "No number (header or footer text only)" },
      ],
    },
    { key: "position", label: "Number position", type: "select", default: "bottom-center", options: SLOTS, showIf: (v) => v.format !== "none" },
    { key: "start", label: "Start number", type: "number", min: 0, max: 9999, step: 1, default: 1, showIf: (v) => v.format !== "none" },
    { key: "pages", label: "Pages to number", type: "pages", default: "", hint: "Leave empty for every page. Example: 2- skips the cover." },
    {
      key: "countFromRange",
      label: "Start counting at the first numbered page",
      type: "toggle",
      default: false,
      hint: "Off: page 3 of the PDF is number 3. On: the first numbered page gets the start number.",
      showIf: (v) => v.format !== "none",
    },
    { key: "font", label: "Font", type: "select", default: "Helvetica", options: [{ value: "Helvetica", label: "Helvetica" }, { value: "TimesRoman", label: "Times" }, { value: "Courier", label: "Courier" }] },
    { key: "fontSize", label: "Font size", type: "slider", min: 7, max: 24, step: 1, unit: "pt", default: 11 },
    { key: "color", label: "Colour", type: "color", default: "#333333" },
    { key: "margin", label: "Distance from edge", type: "slider", min: 12, max: 90, step: 2, unit: "pt", default: 30, hint: "72 pt is one inch." },
    { key: "headerText", label: "Header text", type: "text", default: "", placeholder: "Optional", hint: "Printed on every selected page." },
    { key: "headerPosition", label: "Header position", type: "select", default: "top-center", options: HEADER_SLOTS, showIf: (v) => String(v.headerText).trim() !== "" },
    { key: "footerText", label: "Footer text", type: "text", default: "", placeholder: "Optional", hint: "Printed on every selected page." },
    { key: "footerPosition", label: "Footer position", type: "select", default: "bottom-left", options: FOOTER_SLOTS, showIf: (v) => String(v.footerText).trim() !== "" },
  ],
  presets: [
    { id: "simple", label: "Page 1 of N, bottom centre", values: { format: "page-of", position: "bottom-center" } },
    { id: "plain", label: "Plain number, bottom right", values: { format: "n", position: "bottom-right" } },
    { id: "legal", label: "Header + 1 / N", hint: "Title on top, number at the bottom", values: { format: "slash", position: "bottom-center", headerText: "CONFIDENTIAL", headerPosition: "top-right" } },
  ],

  async run([file], options, ctx) {
    const { StandardFonts, rgb, degrees, PDFName, PDFNumber } = await import("pdf-lib");
    const format = String(options.format);
    const headerText = String(options.headerText).trim();
    const footerText = String(options.footerText).trim();
    if (format === "none" && !headerText && !footerText) {
      throw new KreaError("failed", "Walang idadagdag: choose a number format, or type header or footer text.");
    }

    const position = String(options.position);
    const headerPosition = String(options.headerPosition);
    const footerPosition = String(options.footerPosition);
    const placed: { slot: string; what: string }[] = [];
    if (format !== "none") placed.push({ slot: position, what: "the page number" });
    if (headerText) placed.push({ slot: headerPosition, what: "the header text" });
    if (footerText) placed.push({ slot: footerPosition, what: "the footer text" });
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (placed[i].slot === placed[j].slot) {
          throw new KreaError("failed", `${placed[i].what[0].toUpperCase()}${placed[i].what.slice(1)} and ${placed[j].what} are in the same spot. Move one of them.`);
        }
      }
    }

    const pdf = await loadPdf(file);
    const font = await pdf.embedFont(StandardFonts[String(options.font) as "Helvetica" | "TimesRoman" | "Courier"]);
    const size = Number(options.fontSize);
    const margin = Number(options.margin);
    const hex = String(options.color).replace("#", "");
    const color = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);

    const total = pdf.getPageCount();
    const targets = parsePageList(String(options.pages), total);
    const start = Math.round(Number(options.start));
    const lastNumber = start + (options.countFromRange ? targets.length - 1 : total - 1);

    const widthOf = (text: string, page: number) => {
      try {
        return font.widthOfTextAtSize(text, size);
      } catch {
        throw new KreaError("failed", `Page ${page + 1}: the text has characters this font cannot print. Use Latin letters, numbers and common symbols.`);
      }
    };

    // Check every target page first, so a refusal never leaves a half-numbered file.
    interface Geometry {
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
    }
    const geometry = new Map<number, Geometry>();
    for (const index of targets) {
      const page = pdf.getPage(index);
      const label = `Page ${index + 1}`;
      const rotation = ((page.getRotation().angle % 360) + 360) % 360;
      if (rotation % 90 !== 0) {
        throw new KreaError("failed", `${label} is rotated by ${rotation}°, which is not a quarter turn. Krea cannot tell where the corners are, so it will not guess.`);
      }
      const unit = page.node.get(PDFName.of("UserUnit"));
      if (unit instanceof PDFNumber && unit.asNumber() !== 1) {
        throw new KreaError("failed", `${label} uses a custom page unit (UserUnit ${unit.asNumber()}), so sizes would not match. Krea cannot place text on it accurately yet.`);
      }
      const media = page.getMediaBox();
      const crop = page.getCropBox();
      // Readers show the CropBox clipped to the MediaBox.
      const x = Math.max(media.x, crop.x);
      const y = Math.max(media.y, crop.y);
      const w = Math.min(media.x + media.width, crop.x + crop.width) - x;
      const h = Math.min(media.y + media.height, crop.y + crop.height) - y;
      if (!(w > 0 && h > 0)) throw new KreaError("failed", `${label} has a visible area that does not overlap its page size, so Krea cannot tell where to put text.`);
      const visibleW = rotation % 180 === 0 ? w : h;
      const visibleH = rotation % 180 === 0 ? h : w;
      if (visibleW < 120 || visibleH < 120) throw new KreaError("failed", `${label} is too small (${Math.round(visibleW)} x ${Math.round(visibleH)} pt) to number.`);
      geometry.set(index, { x, y, w, h, rotation });
    }

    targets.forEach((index, done) => {
      ctx.progress(done / targets.length, `Page ${index + 1}`);
      const page = pdf.getPage(index);
      const { x: cx, y: cy, w: cw, h: ch, rotation } = geometry.get(index)!;
      const visibleW = rotation % 180 === 0 ? cw : ch;
      const visibleH = rotation % 180 === 0 ? ch : cw;

      // Pages whose own content leaves the drawing state changed (flips, scaling) would
      // move our text, so wrap the original content in save/restore first.
      const context = pdf.context;
      const startRef = context.register(context.stream("q\n"));
      const endRef = context.register(context.stream("\nQ\n"));
      if (!page.node.wrapContentStreams(startRef, endRef)) {
        const existing = page.node.get(PDFName.of("Contents"));
        if (existing) page.node.set(PDFName.of("Contents"), context.obj([startRef, existing, endRef]));
      }

      const draw = (text: string, slot: string) => {
        if (!text) return;
        const textWidth = widthOf(text, index);
        if (textWidth > visibleW - margin * 2) {
          throw new KreaError("failed", `Page ${index + 1}: "${text.length > 30 ? `${text.slice(0, 30)}…` : text}" is wider than the page. Use shorter text or a smaller font.`);
        }
        const [vertical, align] = slot.split("-");
        const xv = align === "left" ? margin : align === "right" ? visibleW - margin - textWidth : (visibleW - textWidth) / 2;
        const yv = vertical === "top" ? visibleH - margin - size * 0.72 : margin;
        // Visible (upright) coordinates -> page space, for each stored rotation.
        const point =
          rotation === 90
            ? { x: cx + cw - yv, y: cy + xv }
            : rotation === 180
              ? { x: cx + cw - xv, y: cy + ch - yv }
              : rotation === 270
                ? { x: cx + yv, y: cy + ch - xv }
                : { x: cx + xv, y: cy + yv };
        page.drawText(text, { x: point.x, y: point.y, size, font, color, rotate: degrees(rotation) });
      };

      if (format !== "none") {
        const number = start + (options.countFromRange ? targets.indexOf(index) : index);
        draw(pageLabel(format, number, lastNumber), position);
      }
      draw(headerText, headerPosition);
      draw(footerText, footerPosition);
    });

    const parts = [format !== "none" && "page numbers", headerText && "header", footerText && "footer"].filter(Boolean).join(", ");
    return {
      files: [{ name: renameFile(file.name, "pdf", "-numbered"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `Added ${parts} to ${targets.length} of ${total} pages.`,
    };
  },
};
