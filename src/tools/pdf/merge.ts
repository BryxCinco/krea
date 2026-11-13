/** Tool 11: Merge PDFs. Files are combined in the order shown on the Stage (drag to reorder). */
import { PDF_MIME } from "@/lib/file-type";
import { loadPdf, pdfBlob } from "@/lib/pdf-utils";
import type { Tool } from "../types";

export const merge: Tool = {
  id: 11,
  slug: "merge-pdf",
  name: "Merge PDFs",
  verb: "Merge",
  category: "pdf",
  description: "Combine several PDFs into one. Drag the files to set the order.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Merge PDF Files: combine PDFs offline in your browser",
  seoDescription:
    "Merge multiple PDF files into one document without uploading them. Drag to reorder, then download. Free, private and works offline.",
  howTo: [
    "Drop two or more PDFs on the Stage.",
    "Drag the files in the list into the order you want.",
    "Merge and download a single PDF.",
  ],
  icon: "merge",
  worker: "pdf",
  input: "all",
  minFiles: 2,
  fields: [{ key: "name", label: "Output file name", type: "text", placeholder: "merged", default: "merged" }],

  async run(inputs, options, ctx) {
    const { PDFDocument } = await import("pdf-lib");
    const output = await PDFDocument.create();
    let pageTotal = 0;

    for (let i = 0; i < inputs.length; i++) {
      ctx.progress(i / inputs.length, `Adding ${inputs[i].name}`);
      const source = await loadPdf(inputs[i]);
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
      pageTotal += pages.length;
    }

    ctx.progress(0.95, "Saving");
    const name = String(options.name).trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "-") || "merged";
    return {
      files: [{ name: `${name}.pdf`, type: PDF_MIME, blob: pdfBlob(await output.save()) }],
      note: `${inputs.length} files, ${pageTotal} pages in total.`,
    };
  },
};
