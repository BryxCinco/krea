/**
 * Tool 44: CSV to PDF. Reads a CSV or TSV file (quoted fields, line breaks
 * inside quotes, comma/semicolon/tab/pipe detected automatically) and prints it
 * as a table: header row repeated on every page, columns sized to their
 * content, long cells wrapped, numbers right-aligned.
 */
import { CSV_MIME, PDF_MIME, renameFile, TSV_MIME } from "@/lib/file-type";
import { BOLD_FONT, decodeText, FONT_OPTIONS, fontSanitizer, PAGE_SIZE_OPTIONS, PAGE_SIZES, replacedNote, wrapLine, type StandardFontName } from "@/lib/pdf-text";
import { pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 60;
const MIN_COLUMN = 28;
const PADDING = 3;
/** Natural widths are measured on this many rows, so a huge file is not measured cell by cell. */
const SAMPLE_ROWS = 500;

/** RFC 4180 parsing: quotes, doubled quotes and line breaks inside quoted fields. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines are not rows.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** The delimiter that splits the first lines into the same number of columns most often. */
export function detectDelimiter(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim()).slice(0, 10);
  let best = ",";
  let bestScore = 0;
  for (const candidate of [",", ";", "\t", "|"]) {
    const counts = lines.map((line) => line.replace(/"[^"]*"/g, "").split(candidate).length - 1);
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((count) => count === counts[0]).length;
    const score = consistent * 100 + counts[0];
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Amounts and counts, right-aligned. "PHP " is what a peso sign becomes in the standard fonts. */
const NUMBER = /^[-+(]?(?:PHP\s?|[$€£]\s?)?[-+]?[\d.,]+%?\)?$/;

export const csvToPdf: Tool = {
  id: 44,
  slug: "csv-to-pdf",
  name: "CSV to PDF",
  verb: "CSV to PDF",
  category: "pdf",
  description: "Print a CSV or spreadsheet export as a neat PDF table, with the header on every page.",
  accepts: [CSV_MIME, TSV_MIME],
  output: "pdf",
  seoTitle: "CSV to PDF: turn a spreadsheet export into a printable table",
  seoDescription:
    "Convert CSV and TSV files to a PDF table in your browser. The header row repeats on every page, columns fit the page, long cells wrap and numbers line up. No upload.",
  howTo: [
    "Export your sheet as CSV (File > Download > CSV in Google Sheets, Save As > CSV in Excel) and drop it on the Stage.",
    "Choose the page size and orientation, and whether the first row is a header.",
    "Convert and download the PDF table.",
  ],
  faqs: [
    { q: "Is my spreadsheet uploaded?", a: "No. The table is built inside your browser, so payroll, grades and client lists stay on your device." },
    { q: "My file uses semicolons, not commas. Will it work?", a: "Yes. Krea detects commas, semicolons, tabs and pipes on its own. Excel uses semicolons in countries where the comma is the decimal mark." },
    { q: "What if my table is too wide?", a: "Choose Auto or Landscape, a larger page such as Legal, or a smaller font. Columns shrink to fit and long text wraps inside the cell. Very wide sheets (over 60 columns) are refused with a message." },
    { q: "Why do some characters show as a question mark?", a: "The built-in PDF fonts cover Latin letters with accents (ñ, é), but not emoji or non-Latin scripts. Krea counts and reports any it had to replace. The peso sign is printed as PHP, so amounts stay readable." },
    { q: "Are formulas or colours kept?", a: "No. A CSV file only holds the values, so the PDF shows the values as they were exported." },
  ],
  icon: "csv-pdf",
  worker: "pdf",
  input: "each",
  fields: [
    { key: "pageSize", label: "Page size", type: "select", default: "a4", options: PAGE_SIZE_OPTIONS },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Auto (landscape for wide tables)" },
        { value: "portrait", label: "Portrait" },
        { value: "landscape", label: "Landscape" },
      ],
    },
    { key: "header", label: "First row is a header", type: "toggle", default: true, hint: "Printed in bold and repeated at the top of every page." },
    { key: "font", label: "Font", type: "select", default: "Helvetica", options: FONT_OPTIONS },
    { key: "fontSize", label: "Font size", type: "slider", min: 6, max: 14, step: 0.5, unit: "pt", default: 9 },
    { key: "stripes", label: "Shade every other row", type: "toggle", default: true },
    { key: "margin", label: "Margin", type: "slider", min: 18, max: 72, step: 2, unit: "pt", default: 36 },
    { key: "title", label: "Title", type: "text", default: "", placeholder: "Optional, printed on the first page" },
  ],

  async run([file], options, ctx) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const text = decodeText(await file.blob.arrayBuffer(), file.name);
    const delimiter = file.type === TSV_MIME ? "\t" : detectDelimiter(text);
    ctx.progress(0.05, "Reading rows");
    const rows = parseDelimited(text, delimiter);
    if (!rows.length) throw new KreaError("failed", `Walang laman ang "${file.name}". There are no rows to print.`);
    if (rows.length > MAX_ROWS) throw new KreaError("too-large", `"${file.name}" has ${rows.length.toLocaleString()} rows. Krea prints up to ${MAX_ROWS.toLocaleString()}: split the file first.`);
    const columns = Math.max(...rows.map((row) => row.length));
    if (columns > MAX_COLUMNS) throw new KreaError("too-large", `"${file.name}" has ${columns} columns, too many to fit on a page. Remove some columns first (up to ${MAX_COLUMNS}).`);

    const pdf = await PDFDocument.create();
    const fontName = String(options.font) as StandardFontName;
    const font = await pdf.embedFont(StandardFonts[fontName]);
    const bold = await pdf.embedFont(StandardFonts[BOLD_FONT[fontName]]);
    const { clean, state } = fontSanitizer(font);
    const size = Number(options.fontSize);
    const leading = size * 1.25;
    const margin = Number(options.margin);
    const hasHeader = Boolean(options.header) && rows.length > 1;
    // Clean line by line: clean() drops control characters, and the line breaks inside quoted cells must survive.
    const cleanCell = (value: string) => value.trim().split("\n").map(clean).join("\n");
    const header = hasHeader ? Array.from({ length: columns }, (_, i) => cleanCell(rows[0][i] ?? "")) : null;
    const body = (hasHeader ? rows.slice(1) : rows).map((row) => Array.from({ length: columns }, (_, i) => cleanCell(row[i] ?? "")));
    const title = clean(String(options.title).trim());

    // Natural width of each column: its widest line, measured on a sample, capped so one long note cannot take the page.
    const natural = Array.from({ length: columns }, (_, col) => {
      let widest = header ? bold.widthOfTextAtSize(header[col] ?? "", size) : 0;
      for (const row of body.slice(0, SAMPLE_ROWS)) {
        for (const line of row[col].split("\n")) widest = Math.max(widest, font.widthOfTextAtSize(line, size));
      }
      return Math.min(Math.max(widest + PADDING * 2, MIN_COLUMN), size * 30);
    });
    const naturalTotal = natural.reduce((sum, width) => sum + width, 0);

    let [pageW, pageH] = PAGE_SIZES[String(options.pageSize)] ?? PAGE_SIZES.a4;
    const landscape = options.orientation === "landscape" || (options.orientation === "auto" && naturalTotal > pageW - margin * 2);
    if (landscape) [pageW, pageH] = [pageH, pageW];
    const available = pageW - margin * 2;
    if (columns * MIN_COLUMN > available) {
      throw new KreaError("too-large", `${columns} columns do not fit on this page, even when narrow. Choose Landscape, a Legal page or a smaller margin.`);
    }

    // Fit the columns: share spare room out evenly, or shrink wide columns first when the table is too wide.
    let widths: number[];
    if (naturalTotal <= available) {
      const extra = (available - naturalTotal) / columns;
      widths = natural.map((width) => width + Math.min(extra, size * 6));
    } else {
      const flexible = natural.map((width) => width - MIN_COLUMN);
      const flexTotal = flexible.reduce((sum, width) => sum + width, 0);
      const room = available - columns * MIN_COLUMN;
      widths = flexible.map((width) => MIN_COLUMN + (flexTotal ? (width / flexTotal) * room : 0));
    }
    const tableWidth = widths.reduce((sum, width) => sum + width, 0);
    const maxLines = Math.max(1, Math.floor((pageH - margin * 2 - (leading + PADDING * 2) * 3) / leading));
    let truncated = 0;

    const layoutRow = (cells: string[], face: typeof font, limit = maxLines) =>
      cells.map((cell, col) => {
        let lines = cell.split("\n").flatMap((line) => wrapLine(line, face, size, widths[col] - PADDING * 2));
        if (lines.length > limit) {
          lines = [...lines.slice(0, Math.max(1, limit - 1)), "…"];
          truncated++;
        }
        return lines;
      });

    const ink = rgb(0.1, 0.1, 0.1);
    const muted = rgb(0.45, 0.45, 0.45);
    const line = rgb(0.75, 0.75, 0.75);
    const shade = rgb(0.95, 0.95, 0.95);
    const headShade = rgb(0.88, 0.88, 0.88);
    const small = await pdf.embedFont(StandardFonts.Helvetica);
    // A header is at most 3 lines, so a header and the tallest row always fit on one page together.
    const headerCells = header ? layoutRow(header, bold, 3) : null;
    const headerHeight = headerCells ? Math.max(...headerCells.map((cell) => cell.length)) * leading + PADDING * 2 : 0;

    let page = pdf.addPage([pageW, pageH]);
    let y = pageH - margin;
    let pageNumber = 1;
    const drawRow = (cells: string[][], height: number, face: typeof font, fill?: ReturnType<typeof rgb>) => {
      if (fill) page.drawRectangle({ x: margin, y: y - height, width: tableWidth, height, color: fill });
      let x = margin;
      cells.forEach((lines, col) => {
        lines.forEach((text, i) => {
          if (!text) return;
          const textWidth = face.widthOfTextAtSize(text, size);
          const right = lines.length === 1 && NUMBER.test(text);
          page.drawText(text, { x: right ? x + widths[col] - PADDING - textWidth : x + PADDING, y: y - PADDING - size - i * leading + (leading - size) / 2, size, font: face, color: ink });
        });
        x += widths[col];
      });
      page.drawLine({ start: { x: margin, y: y - height }, end: { x: margin + tableWidth, y: y - height }, thickness: 0.5, color: line });
      y -= height;
    };
    const footer = () => page.drawText(`${pageNumber}`, { x: pageW / 2 - 4, y: margin / 2, size: 8, font: small, color: muted });
    const startPage = (first: boolean) => {
      if (!first) {
        footer();
        page = pdf.addPage([pageW, pageH]);
        pageNumber++;
        y = pageH - margin;
      }
      page.drawLine({ start: { x: margin, y }, end: { x: margin + tableWidth, y }, thickness: 0.5, color: line });
      if (headerCells) drawRow(headerCells, headerHeight, bold, headShade);
    };

    if (title) {
      page.drawText(title, { x: margin, y: y - 14, size: 14, font: bold, color: ink, maxWidth: available });
      y -= 26;
    }
    startPage(true);
    body.forEach((row, index) => {
      if (index % 200 === 0) ctx.progress(0.1 + (0.85 * index) / body.length, `Row ${index + 1} of ${body.length}`);
      const cells = layoutRow(row, font);
      const height = Math.max(...cells.map((cell) => cell.length)) * leading + PADDING * 2;
      if (y - height < margin) startPage(false);
      drawRow(cells, height, font, options.stripes && index % 2 === 1 ? shade : undefined);
    });
    footer();

    pdf.setTitle(title || file.name.replace(/\.[^.]+$/, ""));
    pdf.setProducer("Krea");
    ctx.progress(0.97, "Saving");
    const delimiterName = { ",": "commas", ";": "semicolons", "\t": "tabs", "|": "pipes" }[delimiter];
    const cut = truncated ? ` ${truncated} very long ${truncated === 1 ? "cell was" : "cells were"} cut to fit one page (marked …).` : "";
    return {
      files: [{ name: renameFile(file.name, "pdf"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `${body.length} ${body.length === 1 ? "row" : "rows"} × ${columns} columns (split by ${delimiterName}), ${pageNumber} ${pageNumber === 1 ? "page" : "pages"}${landscape ? ", landscape" : ""}.${cut}${replacedNote(state.replaced)}`,
    };
  },
};
