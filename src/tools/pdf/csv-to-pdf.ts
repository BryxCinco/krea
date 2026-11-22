/**
 * Tool 44: CSV to PDF. Reads a CSV or TSV file (quoted fields, line breaks
 * inside quotes, comma/semicolon/tab/pipe detected automatically) and prints it
 * as a table: header row repeated on every page, columns sized to their
 * content, long cells wrapped, numbers right-aligned.
 */
import { CSV_MIME, PDF_MIME, renameFile, TSV_MIME } from "@/lib/file-type";
import { buildTablePdf, TABLE_FIELDS, truncatedNote } from "@/lib/pdf-table";
import { decodeText, replacedNote } from "@/lib/pdf-text";
import { pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

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
  fields: [...TABLE_FIELDS, { key: "title", label: "Title", type: "text", default: "", placeholder: "Optional, printed on the first page" }],

  async run([file], options, ctx) {
    const text = decodeText(await file.blob.arrayBuffer(), file.name);
    const delimiter = file.type === TSV_MIME ? "\t" : detectDelimiter(text);
    ctx.progress(0.05, "Reading rows");
    const rows = parseDelimited(text, delimiter);
    if (!rows.length) throw new KreaError("failed", `Walang laman ang "${file.name}". There are no rows to print.`);
    const title = String(options.title).trim();
    const result = await buildTablePdf([{ title, rows, label: `"${file.name}"` }], options, ctx, title || file.name.replace(/\.[^.]+$/, ""));
    const { rows: bodyRows, columns, landscape } = result.sections[0];
    const delimiterName = { ",": "commas", ";": "semicolons", "\t": "tabs", "|": "pipes" }[delimiter];
    return {
      files: [{ name: renameFile(file.name, "pdf"), type: PDF_MIME, blob: pdfBlob(result.bytes) }],
      note: `${bodyRows} ${bodyRows === 1 ? "row" : "rows"} × ${columns} columns (split by ${delimiterName}), ${result.pages} ${result.pages === 1 ? "page" : "pages"}${landscape ? ", landscape" : ""}.${truncatedNote(result.truncated)}${replacedNote(result.replaced)}`,
    };
  },
};
