/**
 * Tool 43: TXT to PDF. Lays out a plain-text file on PDF pages with a standard
 * font: wraps long lines, keeps blank lines and indentation, and can add a file
 * name header and page numbers. Text helpers: src/lib/pdf-text.ts.
 */
import { PDF_MIME, renameFile, TEXT_MIME } from "@/lib/file-type";
import { pdfBlob } from "@/lib/pdf-utils";
import { decodeText, FONT_OPTIONS, fontSanitizer, PAGE_SIZE_OPTIONS, PAGE_SIZES, replacedNote, wrapLine, type StandardFontName } from "@/lib/pdf-text";
import { KreaError, type Tool } from "../types";

/** Above this many pages the run stops, so a huge log cannot freeze the phone. */
const MAX_PAGES = 2000;

export const txtToPdf: Tool = {
  id: 43,
  slug: "txt-to-pdf",
  name: "TXT to PDF",
  verb: "TXT to PDF",
  category: "pdf",
  description: "Turn a plain-text file into a clean, printable PDF with wrapped lines and page numbers.",
  accepts: [TEXT_MIME],
  output: "pdf",
  seoTitle: "TXT to PDF: convert text files to PDF in your browser",
  seoDescription:
    "Convert .txt, .md and .log files to PDF on A4, Letter or Legal. Long lines wrap, indentation is kept, with optional file name header and page numbers. No upload.",
  howTo: [
    "Drop a .txt file on the Stage.",
    "Pick the page size, font, font size and margins.",
    "Convert and download the PDF.",
  ],
  faqs: [
    { q: "Is my text uploaded?", a: "No. The PDF is made inside your browser. Krea has no server to send it to." },
    { q: "Which font should I use?", a: "Courier keeps columns lined up, which suits code, logs and tables made with spaces. Helvetica and Times read better for letters and notes." },
    { q: "Why do some characters show as a question mark?", a: "The built-in PDF fonts only cover Latin letters (including ñ, é and other accents). Emoji and scripts such as Chinese, Arabic or Baybayin are replaced with ? and Krea tells you how many." },
    { q: "Which encodings work?", a: "UTF-8 (the usual today), UTF-16 with a byte-order mark, and older Windows text files (Windows-1252). Krea picks the right one by itself." },
  ],
  icon: "txt-pdf",
  worker: "pdf",
  input: "each",
  fields: [
    { key: "pageSize", label: "Page size", type: "select", default: "a4", options: PAGE_SIZE_OPTIONS },
    { key: "orientation", label: "Orientation", type: "select", default: "portrait", options: [{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }] },
    { key: "font", label: "Font", type: "select", default: "Courier", options: FONT_OPTIONS },
    { key: "fontSize", label: "Font size", type: "slider", min: 7, max: 18, step: 0.5, unit: "pt", default: 10 },
    { key: "lineHeight", label: "Line spacing", type: "slider", min: 1, max: 2, step: 0.05, unit: "×", default: 1.3 },
    { key: "margin", label: "Margin", type: "slider", min: 18, max: 108, step: 2, unit: "pt", default: 54, hint: "72 pt is one inch." },
    { key: "header", label: "File name at the top of each page", type: "toggle", default: true },
    { key: "pageNumbers", label: "Page numbers", type: "toggle", default: true },
  ],
  presets: [
    { id: "code", label: "Code or log", hint: "Courier 9 pt, landscape", values: { font: "Courier", fontSize: 9, orientation: "landscape", lineHeight: 1.2 } },
    { id: "letter", label: "Letter or notes", hint: "Times 12 pt", values: { font: "TimesRoman", fontSize: 12, orientation: "portrait", lineHeight: 1.4, header: false } },
  ],

  async run([file], options, ctx) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const text = decodeText(await file.blob.arrayBuffer(), file.name);
    if (!text.trim()) throw new KreaError("failed", `Walang laman ang "${file.name}". There is no text to put in a PDF.`);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts[String(options.font) as StandardFontName]);
    const small = await pdf.embedFont(StandardFonts.Helvetica);
    const { clean, state } = fontSanitizer(font);
    const smallClean = fontSanitizer(small).clean;

    let [pageW, pageH] = PAGE_SIZES[String(options.pageSize)] ?? PAGE_SIZES.a4;
    if (options.orientation === "landscape") [pageW, pageH] = [pageH, pageW];
    const size = Number(options.fontSize);
    const leading = size * Number(options.lineHeight);
    const margin = Number(options.margin);
    const header = Boolean(options.header);
    const numbers = Boolean(options.pageNumbers);
    const top = pageH - margin - (header ? 18 : 0);
    const bottom = margin + (numbers ? 14 : 0);
    const maxWidth = pageW - margin * 2;
    const linesPerPage = Math.max(1, Math.floor((top - bottom) / leading));

    ctx.progress(0.1, "Wrapping lines");
    const lines: string[] = [];
    for (const raw of text.split("\n")) lines.push(...wrapLine(clean(raw.replace(/\s+$/, "")), font, size, maxWidth));
    // Drop trailing blank lines so the PDF does not end on an empty page.
    while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();

    const pageCount = Math.ceil(lines.length / linesPerPage);
    if (pageCount > MAX_PAGES) {
      throw new KreaError("too-large", `This text would make ${pageCount} pages. Krea stops at ${MAX_PAGES}: use a smaller font or split the file.`);
    }

    const ink = rgb(0.1, 0.1, 0.1);
    const muted = rgb(0.45, 0.45, 0.45);
    const title = smallClean(file.name);
    for (let p = 0; p < pageCount; p++) {
      if (p % 20 === 0) ctx.progress(0.1 + (0.8 * p) / pageCount, `Page ${p + 1} of ${pageCount}`);
      const page = pdf.addPage([pageW, pageH]);
      if (header) page.drawText(title, { x: margin, y: pageH - margin, size: 8, font: small, color: muted, maxWidth });
      const chunk = lines.slice(p * linesPerPage, (p + 1) * linesPerPage);
      chunk.forEach((line, i) => {
        if (line) page.drawText(line, { x: margin, y: top - size - i * leading, size, font, color: ink });
      });
      if (numbers) {
        const label = `${p + 1} / ${pageCount}`;
        page.drawText(label, { x: (pageW - small.widthOfTextAtSize(label, 8)) / 2, y: margin - 4, size: 8, font: small, color: muted });
      }
    }

    pdf.setTitle(file.name.replace(/\.[^.]+$/, ""));
    pdf.setProducer("Krea");
    ctx.progress(0.95, "Saving");
    return {
      files: [{ name: renameFile(file.name, "pdf"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `${pageCount} ${pageCount === 1 ? "page" : "pages"}, ${lines.length} lines.${replacedNote(state.replaced)}`,
    };
  },
};
