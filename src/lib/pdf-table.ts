/**
 * Prints tables into a PDF: the shared engine of CSV to PDF (44) and Excel to
 * PDF (60). Header row repeated on every page, columns sized to their content,
 * long cells wrapped, numbers right-aligned. Each section (a CSV file, or one
 * Excel sheet) starts on a new page and may have a title.
 */
import { BOLD_FONT, fontSanitizer, PAGE_SIZE_OPTIONS, FONT_OPTIONS, PAGE_SIZES, wrapLine, type StandardFontName } from "@/lib/pdf-text";
import { KreaError, type OptionField, type OptionValues, type RunContext } from "@/tools/types";

export const MAX_ROWS = 50_000;
export const MAX_COLUMNS = 60;
const MIN_COLUMN = 28;
const PADDING = 3;
/** Natural widths are measured on this many rows, so a huge file is not measured cell by cell. */
const SAMPLE_ROWS = 500;

/** Amounts and counts, right-aligned. "PHP " is what a peso sign becomes in the standard fonts. */
const NUMBER = /^[-+(]?(?:PHP\s?|[$€£]\s?)?[-+]?[\d.,]+%?\)?$/;

/** The table settings both tools share, in inspector order. */
export const TABLE_FIELDS: OptionField[] = [
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
];

export interface TableSection {
  /** Printed above the table on its first page ("" for none). */
  title: string;
  rows: string[][];
  /** Names the source in messages, e.g. `"sales.csv"` or `sheet "May" of "sales.xlsx"`. */
  label: string;
}

export interface TableReport {
  bytes: Uint8Array;
  pages: number;
  /** Body rows and columns per section. */
  sections: { rows: number; columns: number; landscape: boolean }[];
  truncated: number;
  replaced: number;
}

/** Refuse tables that cannot be printed, with a message that names the source. */
export function checkTableSize(rows: string[][], label: string): number {
  if (rows.length > MAX_ROWS) throw new KreaError("too-large", `${label} has ${rows.length.toLocaleString()} rows. Krea prints up to ${MAX_ROWS.toLocaleString()}: split it first.`);
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  if (columns > MAX_COLUMNS) throw new KreaError("too-large", `${label} has ${columns} columns, too many to fit on a page. Remove some columns first (up to ${MAX_COLUMNS}).`);
  return columns;
}

export async function buildTablePdf(sections: TableSection[], options: OptionValues, ctx: RunContext, documentTitle: string): Promise<TableReport> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const fontName = String(options.font) as StandardFontName;
  const font = await pdf.embedFont(StandardFonts[fontName] ?? StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts[BOLD_FONT[fontName] ?? "HelveticaBold"]);
  const small = await pdf.embedFont(StandardFonts.Helvetica);
  const { clean, state } = fontSanitizer(font);
  const size = Number(options.fontSize);
  const leading = size * 1.25;
  const margin = Number(options.margin);
  // Clean line by line: clean() drops control characters, and the line breaks inside quoted cells must survive.
  const cleanCell = (value: string) => value.trim().split("\n").map(clean).join("\n");

  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.45, 0.45, 0.45);
  const line = rgb(0.75, 0.75, 0.75);
  const shade = rgb(0.95, 0.95, 0.95);
  const headShade = rgb(0.88, 0.88, 0.88);

  const totalRows = sections.reduce((sum, section) => sum + section.rows.length, 0) || 1;
  let doneRows = 0;
  let truncated = 0;
  let pageNumber = 0;
  let page: ReturnType<typeof pdf.addPage> | null = null;
  const footer = () => {
    const current = page;
    if (current) current.drawText(`${pageNumber}`, { x: current.getWidth() / 2 - 4, y: margin / 2, size: 8, font: small, color: muted });
  };
  const report: TableReport["sections"] = [];

  for (const section of sections) {
    const columns = checkTableSize(section.rows, section.label);
    if (!section.rows.length || !columns) continue;
    const hasHeader = Boolean(options.header) && section.rows.length > 1;
    const header = hasHeader ? Array.from({ length: columns }, (_, i) => cleanCell(section.rows[0][i] ?? "")) : null;
    const body = (hasHeader ? section.rows.slice(1) : section.rows).map((row) => Array.from({ length: columns }, (_, i) => cleanCell(row[i] ?? "")));
    const title = clean(section.title.trim());

    // Natural width of each column: its widest line, measured on a sample, capped so one long note cannot take the page.
    const natural = Array.from({ length: columns }, (_, col) => {
      let widest = header ? bold.widthOfTextAtSize(header[col] ?? "", size) : 0;
      for (const row of body.slice(0, SAMPLE_ROWS)) {
        for (const text of row[col].split("\n")) widest = Math.max(widest, font.widthOfTextAtSize(text, size));
      }
      return Math.min(Math.max(widest + PADDING * 2, MIN_COLUMN), size * 30);
    });
    const naturalTotal = natural.reduce((sum, width) => sum + width, 0);

    let [pageW, pageH] = PAGE_SIZES[String(options.pageSize)] ?? PAGE_SIZES.a4;
    const landscape = options.orientation === "landscape" || (options.orientation === "auto" && naturalTotal > pageW - margin * 2);
    if (landscape) [pageW, pageH] = [pageH, pageW];
    const available = pageW - margin * 2;
    if (columns * MIN_COLUMN > available) {
      throw new KreaError("too-large", `${columns} columns of ${section.label} do not fit on this page, even when narrow. Choose Landscape, a Legal page or a smaller margin.`);
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

    const layoutRow = (cells: string[], face: typeof font, limit = maxLines) =>
      cells.map((cell, col) => {
        let lines = cell.split("\n").flatMap((text) => wrapLine(text, face, size, widths[col] - PADDING * 2));
        if (lines.length > limit) {
          lines = [...lines.slice(0, Math.max(1, limit - 1)), "…"];
          truncated++;
        }
        return lines;
      });
    // A header is at most 3 lines, so a header and the tallest row always fit on one page together.
    const headerCells = header ? layoutRow(header, bold, 3) : null;
    const headerHeight = headerCells ? Math.max(...headerCells.map((cell) => cell.length)) * leading + PADDING * 2 : 0;

    let y = 0;
    const drawRow = (cells: string[][], height: number, face: typeof font, fill?: ReturnType<typeof rgb>) => {
      const target = page!;
      if (fill) target.drawRectangle({ x: margin, y: y - height, width: tableWidth, height, color: fill });
      let x = margin;
      cells.forEach((lines, col) => {
        lines.forEach((text, i) => {
          if (!text) return;
          const textWidth = face.widthOfTextAtSize(text, size);
          const right = lines.length === 1 && NUMBER.test(text);
          target.drawText(text, { x: right ? x + widths[col] - PADDING - textWidth : x + PADDING, y: y - PADDING - size - i * leading + (leading - size) / 2, size, font: face, color: ink });
        });
        x += widths[col];
      });
      target.drawLine({ start: { x: margin, y: y - height }, end: { x: margin + tableWidth, y: y - height }, thickness: 0.5, color: line });
      y -= height;
    };
    const startPage = (withTitle: boolean) => {
      if (page) footer();
      page = pdf.addPage([pageW, pageH]);
      pageNumber++;
      y = pageH - margin;
      if (withTitle && title) {
        page.drawText(title, { x: margin, y: y - 14, size: 14, font: bold, color: ink, maxWidth: available });
        y -= 26;
      }
      page.drawLine({ start: { x: margin, y }, end: { x: margin + tableWidth, y }, thickness: 0.5, color: line });
      if (headerCells) drawRow(headerCells, headerHeight, bold, headShade);
    };

    startPage(true);
    body.forEach((row, index) => {
      if (index % 200 === 0) ctx.progress(0.1 + (0.85 * (doneRows + index)) / totalRows, sections.length > 1 ? `${section.title || section.label}: row ${index + 1} of ${body.length}` : `Row ${index + 1} of ${body.length}`);
      const cells = layoutRow(row, font);
      const height = Math.max(...cells.map((cell) => cell.length)) * leading + PADDING * 2;
      if (y - height < margin) startPage(false);
      drawRow(cells, height, font, options.stripes && index % 2 === 1 ? shade : undefined);
    });
    doneRows += section.rows.length;
    report.push({ rows: body.length, columns, landscape });
  }
  if (pageNumber === 0) throw new KreaError("failed", "Walang laman. There are no rows to print.");
  footer();

  pdf.setTitle(documentTitle);
  pdf.setProducer("Krea");
  ctx.progress(0.97, "Saving");
  return { bytes: await pdf.save(), pages: pageNumber, sections: report, truncated, replaced: state.replaced };
}

/** " 3 very long cells were cut…" or "". */
export function truncatedNote(count: number): string {
  return count ? ` ${count} very long ${count === 1 ? "cell was" : "cells were"} cut to fit one page (marked …).` : "";
}
