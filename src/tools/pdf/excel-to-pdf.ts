/**
 * Tool 60: Excel to PDF. Opens an .xlsx workbook in the browser (src/lib/xlsx.ts)
 * and prints its sheets as tables with the same engine as CSV to PDF (44):
 * header on every page, columns fitted, numbers right-aligned. Values are shown
 * as Excel formats them (dates, percentages, decimals); formulas print their
 * last saved result.
 */
import { PDF_MIME, renameFile, XLSX_MIME } from "@/lib/file-type";
import { buildTablePdf, TABLE_FIELDS, truncatedNote } from "@/lib/pdf-table";
import { replacedNote } from "@/lib/pdf-text";
import { pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

export const excelToPdf: Tool = {
  id: 60,
  slug: "excel-to-pdf",
  name: "Excel to PDF",
  verb: "Excel to PDF",
  category: "pdf",
  description: "Print an Excel workbook (.xlsx) as neat PDF tables, one sheet after another, with the header on every page.",
  accepts: [XLSX_MIME],
  output: "pdf",
  seoTitle: "Excel to PDF: convert XLSX sheets to a printable PDF, offline",
  seoDescription:
    "Convert Excel .xlsx files to PDF tables in your browser. Every sheet or just the first, header row on every page, dates and amounts as Excel shows them. No upload, no Office needed.",
  howTo: [
    "Drop an .xlsx file on the Stage.",
    "Choose all sheets or only the first, then the page size, orientation and font size.",
    "Convert and download the PDF.",
  ],
  faqs: [
    { q: "Do I need Excel installed?", a: "No. Krea reads the workbook itself, inside your browser, so it also works on phones and Chromebooks. Nothing is uploaded." },
    { q: "Are formulas computed?", a: "Krea prints the result Excel saved with the file, which is what you saw the last time it was saved. Files made by some apps without saved results show those cells empty: open and save them in Excel or Google Sheets first." },
    { q: "Are colours, borders and charts kept?", a: "No. The PDF is a clean table of the values: dates, percentages and decimals as formatted in Excel. Merged cells show their value in the first cell. Charts and pictures are left out." },
    { q: "What about old .xls files?", a: "Only .xlsx (Excel 2007 and later) is supported. Save the file as .xlsx or CSV first. Password-protected workbooks must be unlocked in Excel." },
    { q: "Are hidden sheets printed?", a: "No. Hidden sheets are skipped, the same as when you print from Excel." },
  ],
  icon: "excel-pdf",
  worker: "pdf",
  input: "each",
  fields: [
    {
      key: "sheets",
      label: "Sheets",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "All visible sheets" },
        { value: "first", label: "First sheet only" },
      ],
    },
    ...TABLE_FIELDS,
    { key: "sheetTitles", label: "Print sheet names as titles", type: "toggle", default: true },
  ],

  async run([file], options, ctx) {
    ctx.progress(0.02, "Opening workbook");
    const { readXlsx } = await import("@/lib/xlsx");
    const all = await readXlsx(await file.blob.arrayBuffer(), file.name);
    const withRows = all.filter((sheet) => sheet.rows.length);
    if (!withRows.length) throw new KreaError("failed", `Walang laman ang "${file.name}". Its visible sheets have no values to print.`);
    const sheets = options.sheets === "first" ? withRows.slice(0, 1) : withRows;
    const result = await buildTablePdf(
      sheets.map((sheet) => ({ title: options.sheetTitles ? sheet.name : "", rows: sheet.rows, label: `sheet "${sheet.name}" of "${file.name}"` })),
      options,
      ctx,
      file.name.replace(/\.[^.]+$/, ""),
    );
    const rows = result.sections.reduce((sum, section) => sum + section.rows, 0);
    const skipped = all.length - withRows.length;
    const sheetText = sheets.length === 1 ? `Sheet "${sheets[0].name}"` : `${sheets.length} sheets`;
    return {
      files: [{ name: renameFile(file.name, "pdf"), type: PDF_MIME, blob: pdfBlob(result.bytes) }],
      note: `${sheetText}, ${rows} ${rows === 1 ? "row" : "rows"}, ${result.pages} ${result.pages === 1 ? "page" : "pages"}.${skipped ? ` ${skipped} empty ${skipped === 1 ? "sheet was" : "sheets were"} skipped.` : ""}${truncatedNote(result.truncated)}${replacedNote(result.replaced)}`,
    };
  },
};
