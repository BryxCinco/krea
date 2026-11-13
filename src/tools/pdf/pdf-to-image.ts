/** Tool 14: PDF to Image. Renders each page to PNG or JPG with pdf.js. */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { openPdf, renderPage } from "@/lib/pdf-render";
import { parsePageList } from "@/lib/pdf-utils";
import { KreaError, type Tool, type WorkFile } from "../types";

export const pdfToImage: Tool = {
  id: 14,
  slug: "pdf-to-image",
  name: "PDF to Image",
  verb: "PDF to Image",
  category: "pdf",
  description: "Turn PDF pages into high-resolution PNG or JPG images.",
  accepts: [PDF_MIME],
  output: "image",
  seoTitle: "PDF to Image: convert PDF pages to PNG or JPG, offline",
  seoDescription:
    "Convert PDF pages to PNG or JPG at up to 300 DPI in your browser. Download all pages as a ZIP. No upload, no watermark.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Choose PNG or JPG and the resolution. Optionally pick only some pages.",
    "Convert and download each page, or everything as a ZIP.",
  ],
  icon: "pdf-to-image",
  // pdf.js needs the DOM, so this tool is coordinated from the page while
  // pdf.js's own parser and renderer workers do the heavy lifting.
  worker: "pdfjs",
  input: "each",
  fields: [
    {
      key: "format",
      label: "Image format",
      type: "select",
      default: "image/png",
      options: [
        { value: "image/png", label: "PNG (sharp text)" },
        { value: "image/jpeg", label: "JPG (smaller files)" },
      ],
    },
    {
      key: "dpi",
      label: "Resolution",
      type: "select",
      default: "150",
      options: [
        { value: "72", label: "72 DPI (screen)" },
        { value: "150", label: "150 DPI (standard)" },
        { value: "300", label: "300 DPI (print)" },
      ],
    },
    { key: "quality", label: "JPG quality", type: "slider", min: 40, max: 100, step: 1, unit: "%", default: 90, showIf: (v) => v.format === "image/jpeg" },
    { key: "pages", label: "Pages", type: "pages", default: "", hint: "Leave empty to convert every page." },
  ],

  async run([file], options, ctx) {
    const { pdf, close } = await openPdf(file);
    const mime = String(options.format);
    const extension = mime === "image/png" ? "png" : "jpg";
    const files: WorkFile[] = [];
    let anyReduced = false;

    try {
      const pages = parsePageList(String(options.pages), pdf.numPages);
      for (let i = 0; i < pages.length; i++) {
        if (ctx.signal?.aborted) throw new KreaError("failed", "Cancelled.");
        ctx.progress(i / pages.length, `Rendering page ${pages[i] + 1} of ${pdf.numPages}`);

        // PDF units are 1/72 inch, so DPI / 72 is the render scale.
        const { blob, reduced } = await renderPage(pdf, pages[i], Number(options.dpi) / 72, mime, Number(options.quality) / 100);
        anyReduced ||= reduced;
        const number = String(pages[i] + 1).padStart(String(pdf.numPages).length, "0");
        files.push({ name: renameFile(file.name, extension, `-page-${number}`), type: mime, blob });
      }
    } finally {
      await close();
    }

    return {
      files,
      note: anyReduced ? "Some pages are very large, so they were rendered below the chosen DPI to stay memory-safe." : undefined,
    };
  },
};
