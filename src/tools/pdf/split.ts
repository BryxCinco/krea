/** Tool 12: Split PDF. By ranges, every N pages, or a hand-picked set of pages. */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { loadPdf, parsePageList, parsePageRanges, pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool, type WorkFile } from "../types";

export const split: Tool = {
  id: 12,
  slug: "split-pdf",
  name: "Split PDF",
  verb: "Split",
  category: "pdf",
  description: "Split a PDF by page ranges, every N pages, or pull out just the pages you select.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Split PDF: extract pages or ranges without uploading",
  seoDescription:
    "Split a PDF by range, every N pages or selected pages. Everything runs in your browser, so the document stays on your device.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Choose ranges (each range becomes a file), every N pages, or tap the pages you want to keep.",
    "Split and download. Multiple parts come as a ZIP.",
  ],
  icon: "split",
  worker: "pdf",
  input: "each",
  fields: [
    {
      key: "mode",
      label: "Split by",
      type: "select",
      default: "ranges",
      options: [
        { value: "ranges", label: "Page ranges" },
        { value: "every", label: "Every N pages" },
        { value: "pick", label: "Selected pages" },
      ],
    },
    {
      key: "ranges",
      label: "Ranges",
      type: "text",
      placeholder: "1-3, 4-6, 7-",
      default: "",
      hint: "Each comma-separated range becomes its own PDF. Leave blank for one file per page.",
      showIf: (v) => v.mode === "ranges",
    },
    { key: "every", label: "Pages per file", type: "number", min: 1, max: 500, step: 1, default: 1, showIf: (v) => v.mode === "every" },
    {
      key: "pick",
      label: "Pages to extract",
      type: "pages",
      default: "",
      hint: "Selected pages are saved together as one PDF.",
      showIf: (v) => v.mode === "pick",
    },
  ],

  async run([file], options, ctx) {
    const { PDFDocument } = await import("pdf-lib");
    const source = await loadPdf(file);
    const pageCount = source.getPageCount();

    // Each group of page indexes becomes one output file.
    let groups: number[][];
    if (options.mode === "every") {
      const size = Math.max(1, Math.floor(Number(options.every)));
      groups = [];
      for (let start = 0; start < pageCount; start += size) {
        groups.push(Array.from({ length: Math.min(size, pageCount - start) }, (_, i) => start + i));
      }
    } else if (options.mode === "pick") {
      if (!String(options.pick).trim()) throw new KreaError("failed", "Pumili muna ng pages na i-e-extract.");
      groups = [parsePageList(String(options.pick), pageCount)];
    } else {
      groups = String(options.ranges).trim()
        ? parsePageRanges(String(options.ranges), pageCount)
        : Array.from({ length: pageCount }, (_, i) => [i]);
    }

    const files: WorkFile[] = [];
    for (let i = 0; i < groups.length; i++) {
      ctx.progress(i / groups.length, `Part ${i + 1} of ${groups.length}`);
      const part = await PDFDocument.create();
      const pages = await part.copyPages(source, groups[i]);
      pages.forEach((page) => part.addPage(page));
      const first = groups[i][0] + 1;
      const last = groups[i][groups[i].length - 1] + 1;
      const label = options.mode === "pick" ? "-selected" : first === last ? `-p${first}` : `-p${first}-${last}`;
      files.push({ name: renameFile(file.name, "pdf", label), type: PDF_MIME, blob: pdfBlob(await part.save()) });
    }
    return { files, note: `${pageCount} pages split into ${files.length} file${files.length === 1 ? "" : "s"}.` };
  },
};
