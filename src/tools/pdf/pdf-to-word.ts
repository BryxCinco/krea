/**
 * Tool 55: PDF to Word & Text. Reads the PDF's own text layer with pdf.js
 * (src/lib/pdf-extract.ts), rebuilds paragraphs and headings from the layout and
 * writes an editable .docx (src/lib/docx.ts) or a plain .txt. Scanned pages have
 * no text layer; the result says which, and points to OCR (tool 20).
 */
import { DOCX_MIME, PDF_MIME, renameFile, TEXT_MIME } from "@/lib/file-type";
import { openPdf } from "@/lib/pdf-render";
import { parsePageList } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

/** "1, 3-5, 9" from zero-based page indexes. */
export function pageListText(indexes: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    const start = indexes[i];
    while (i + 1 < indexes.length && indexes[i + 1] === indexes[i] + 1) i++;
    parts.push(start === indexes[i] ? `${start + 1}` : `${start + 1}-${indexes[i] + 1}`);
  }
  return parts.join(", ");
}

export const pdfToWord: Tool = {
  id: 55,
  slug: "pdf-to-word",
  name: "PDF to Word & Text",
  verb: "PDF to Word",
  category: "pdf",
  description: "Turn a PDF into an editable Word document (.docx) or plain text, with paragraphs and headings rebuilt.",
  accepts: [PDF_MIME],
  output: (options) => (options.format === "txt" ? "text" : "data"),
  seoTitle: "PDF to Word: convert PDF to editable DOCX or TXT, offline",
  seoDescription:
    "Convert a PDF to an editable Word document or a plain text file in your browser. Paragraphs, headings and page breaks are rebuilt from the layout. No upload, no sign-up, no watermark.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Choose Word (.docx) or Text (.txt), and optionally pick pages.",
    "Convert, then open the file in Word, Google Docs or WPS and edit.",
  ],
  faqs: [
    { q: "Is my PDF uploaded to a converter?", a: "No. Krea reads the text inside your browser, so contracts, school papers and IDs never leave your device." },
    { q: "Will it look exactly like the PDF?", a: "No converter keeps every layout perfectly. Krea brings over the text as editable paragraphs and headings, in reading order, so you can edit and restyle it. Tables, columns and pictures are not rebuilt, and fonts become Calibri." },
    { q: "Why is the result empty or missing pages?", a: "Those pages are scans: pictures of text with no text layer. Run them through OCR: Image and PDF to Text, which reads the letters from the picture." },
    { q: "Can I open the file in Google Docs or WPS?", a: "Yes. The .docx opens in Microsoft Word, Google Docs, LibreOffice, WPS Office and Pages." },
  ],
  icon: "pdf-word",
  // pdf.js needs the DOM, so this is coordinated from the page (see lib/pdf-render.ts).
  worker: "pdfjs",
  input: "each",
  fields: [
    {
      key: "format",
      label: "Save as",
      type: "select",
      default: "docx",
      options: [
        { value: "docx", label: "Word document (.docx)" },
        { value: "txt", label: "Plain text (.txt)" },
      ],
    },
    {
      key: "layout",
      label: "Lines",
      type: "select",
      default: "paragraphs",
      hint: "Paragraphs rejoins lines so the text flows when you edit. Keep lines copies every line break of the PDF.",
      options: [
        { value: "paragraphs", label: "Rebuild paragraphs" },
        { value: "lines", label: "Keep every line" },
      ],
    },
    { key: "pageBreaks", label: "Start each PDF page on a new page", type: "toggle", default: false, showIf: (values) => values.format !== "txt" },
    { key: "pages", label: "Pages", type: "pages", default: "", hint: "Leave empty for every page." },
  ],

  async run([file], options, ctx) {
    const { bodyFontSize, pageLines, toParagraphs } = await import("@/lib/pdf-extract");
    const { pdf, close } = await openPdf(file);
    const pages: Awaited<ReturnType<typeof pageLines>>[] = [];
    let indexes: number[];
    try {
      indexes = parsePageList(String(options.pages), pdf.numPages);
      for (let i = 0; i < indexes.length; i++) {
        if (ctx.signal?.aborted) throw new KreaError("failed", "Cancelled.");
        ctx.progress((0.9 * i) / indexes.length, `Reading page ${indexes[i] + 1} of ${pdf.numPages}`);
        pages.push(await pageLines(pdf, indexes[i]));
      }
    } finally {
      await close();
    }

    const empty = indexes.filter((_, i) => !pages[i].length);
    if (empty.length === indexes.length) {
      throw new KreaError("failed", `Walang text layer ang ${indexes.length === 1 ? "page na ito" : "mga page na ito"}: it is a scan. Use OCR: Image and PDF to Text to read it.`);
    }

    const body = bodyFontSize(pages);
    const keepLines = options.layout === "lines";
    const perPage = pages.map((lines) => (keepLines ? lines.map((line) => ({ text: line.text, heading: 0 as const })) : toParagraphs(lines, body)));
    ctx.progress(0.93, "Writing");

    const stem = file.name.replace(/\.[^.]+$/, "");
    const scanNote = empty.length ? ` ${empty.length === 1 ? "Page" : "Pages"} ${pageListText(empty)} ${empty.length === 1 ? "is a scan" : "are scans"} with no text: use OCR for ${empty.length === 1 ? "it" : "them"}.` : "";
    const paragraphCount = perPage.reduce((sum, list) => sum + list.length, 0);

    if (options.format === "txt") {
      const text = perPage
        .map((list) => list.map((paragraph) => paragraph.text).join(keepLines ? "\n" : "\n\n"))
        .filter(Boolean)
        .join("\n\n");
      return {
        files: [{ name: renameFile(file.name, "txt"), type: TEXT_MIME, blob: new Blob([text], { type: "text/plain;charset=utf-8" }) }],
        view: { type: "text", text },
        note: `${indexes.length - empty.length} ${indexes.length - empty.length === 1 ? "page" : "pages"} of text.${scanNote}`,
      };
    }

    const { buildDocx } = await import("@/lib/docx");
    const blocks: import("@/lib/docx").DocBlock[] = [];
    perPage.forEach((list, i) => {
      if (!list.length) return;
      if (options.pageBreaks && blocks.length && i > 0) blocks.push({ type: "pageBreak" });
      for (const paragraph of list) blocks.push({ type: paragraph.heading === 1 ? "heading1" : paragraph.heading === 2 ? "heading2" : "paragraph", text: paragraph.text });
    });
    const blob = await buildDocx(blocks, stem);
    return {
      files: [{ name: renameFile(file.name, "docx"), type: DOCX_MIME, blob }],
      note: `${paragraphCount} ${keepLines ? "lines" : "paragraphs"} from ${indexes.length - empty.length} ${indexes.length - empty.length === 1 ? "page" : "pages"}. Layout, tables and pictures are not copied, only the text.${scanNote}`,
    };
  },
};
