/** Tool 19: Page Organizer. Reorder, rotate and delete pages using thumbnails. */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { loadPdf, pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

/** One entry of the layout the page grid produces: source page index and extra rotation. */
export interface PageSlot {
  p: number;
  r: number;
}

export const organizePdf: Tool = {
  id: 19,
  slug: "page-organizer",
  name: "Page Organizer",
  verb: "Organize Pages",
  category: "pdf",
  description: "See every page as a thumbnail. Drag to reorder, rotate, or delete pages, then export.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "PDF Page Organizer: reorder, rotate and delete pages",
  seoDescription:
    "Rearrange PDF pages with thumbnails in your browser. Drag to reorder, rotate and delete pages, then export a new PDF. No upload.",
  howTo: [
    "Drop a PDF on the Stage. Each page appears as a thumbnail.",
    "Drag pages to reorder them, or use the buttons on each page to move, rotate or delete it.",
    "Export the new PDF.",
  ],
  faqs: [
    { q: "Is the PDF uploaded?", a: "No. Pages are rearranged inside your browser." },
    { q: "How do I move a page?", a: "Drag a page by its grip handle onto another page, or use the arrow buttons under each thumbnail." },
    { q: "Can I undo a deleted page?", a: "Press Reset in the settings to bring back the original page order, then make your changes again." },
  ],
  icon: "organize",
  worker: "pdf",
  input: "each",
  notChainable: "Organizing pages is done by hand on the thumbnails.",
  fields: [
    {
      key: "layout",
      label: "Pages",
      type: "pageGrid",
      hint: "Drag a page onto another to move it there. Each page also has move, rotate and delete buttons.",
    },
  ],

  async run([file], options, ctx) {
    const { PDFDocument, degrees } = await import("pdf-lib");
    const source = await loadPdf(file);
    const pageCount = source.getPageCount();

    let slots: PageSlot[];
    try {
      slots = options.layout ? (JSON.parse(String(options.layout)) as PageSlot[]) : source.getPageIndices().map((p) => ({ p, r: 0 }));
    } catch {
      throw new KreaError("failed", "The page layout could not be read. Reset the pages and try again.");
    }
    slots = slots.filter((slot) => Number.isInteger(slot.p) && slot.p >= 0 && slot.p < pageCount);
    if (slots.length === 0) throw new KreaError("failed", "Lahat ng pages ay na-delete. Keep at least one page.");

    ctx.progress(0.3, "Rebuilding");
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, slots.map((slot) => slot.p));
    pages.forEach((page, index) => {
      const extra = slots[index].r;
      if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360));
      output.addPage(page);
    });

    const unchanged = slots.length === pageCount && slots.every((slot, index) => slot.p === index && !slot.r);
    return {
      files: [{ name: renameFile(file.name, "pdf", "-organized"), type: PDF_MIME, blob: pdfBlob(await output.save()) }],
      note: unchanged ? "Walang binago: the pages are in their original order." : `${slots.length} of ${pageCount} pages kept.`,
    };
  },
};
