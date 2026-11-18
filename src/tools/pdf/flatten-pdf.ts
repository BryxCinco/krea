/**
 * Tool 46: Flatten PDF. "Forms" bakes form field values into the page with
 * pdf-lib, so they can no longer be edited and the text stays selectable.
 * "Everything" renders every page, including comments, stamps and form
 * appearances, to an image with pdf.js and rebuilds the PDF from those images.
 *
 * Coordinated from the page ("pdfjs") because the image mode needs pdf.js's
 * display layer; the forms mode only uses pdf-lib, which is fine there too.
 */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { openPdf, renderPage } from "@/lib/pdf-render";
import { loadPdf, pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool, type WorkFile } from "../types";

export const flattenPdf: Tool = {
  id: 46,
  slug: "flatten-pdf",
  name: "Flatten PDF",
  verb: "Flatten PDF",
  category: "pdf",
  description: "Lock filled-in forms, comments and stamps into the page so nobody can change them.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Flatten PDF: lock form fields and comments into the page",
  seoDescription:
    "Flatten PDF forms so the filled-in values can no longer be edited, or flatten everything (comments, stamps, highlights) into the page. Free, offline, no upload.",
  howTo: [
    "Drop a filled-in PDF on the Stage.",
    "Choose Form fields only (text stays selectable) or Everything, as images.",
    "Flatten and download the locked PDF.",
  ],
  faqs: [
    { q: "Why flatten a PDF?", a: "Government offices, schools and HR often ask for a flattened form so the answers cannot be changed after you submit it, and so it looks the same in every app." },
    { q: "Which mode should I choose?", a: "Form fields only keeps the text sharp and selectable and the file small. Choose Everything when the PDF also has comments, highlights or stamps, or when a form still looks empty in some apps." },
    { q: "Can I undo flattening?", a: "Not in the flattened file. Keep your original if you may need to edit the answers later." },
    { q: "Is my form uploaded?", a: "No. Flattening happens inside your browser, so your answers never leave the device." },
  ],
  icon: "flatten",
  // Image mode needs pdf.js's display layer, so this runs from the page.
  worker: "pdfjs",
  input: "each",
  fields: [
    {
      key: "mode",
      label: "What to flatten",
      type: "select",
      default: "forms",
      options: [
        { value: "forms", label: "Form fields only (text stays selectable)" },
        { value: "image", label: "Everything, as images" },
      ],
    },
    {
      key: "dpi",
      label: "Image resolution",
      type: "select",
      default: "200",
      showIf: (v) => v.mode === "image",
      options: [
        { value: "150", label: "150 DPI (small file)" },
        { value: "200", label: "200 DPI (balanced)" },
        { value: "300", label: "300 DPI (print)" },
      ],
    },
  ],
  warn: (inputs, options) => (options.mode === "image" && inputs.some((input) => (input.pages ?? 0) > 50) ? "Everything mode renders each page as an image: a long PDF takes a while and makes a bigger file." : null),

  async run([file], options, ctx) {
    if (options.mode === "image") return flattenToImages(file, Number(options.dpi) || 200, ctx);

    const pdf = await loadPdf(file);
    let form;
    try {
      form = pdf.getForm();
    } catch {
      throw new KreaError("corrupted", `The form in "${file.name}" is damaged, so its fields cannot be read. Try Everything, as images.`);
    }
    const fields = form.getFields();
    if (!fields.length) {
      throw new KreaError("failed", "Walang form fields ang PDF na ito. To lock comments, highlights or stamps into the page, choose Everything, as images.");
    }
    ctx.progress(0.3, "Flattening fields");
    try {
      form.flatten();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new KreaError(
        "failed",
        /WinAnsi|encode/i.test(message)
          ? "A field has characters the PDF font cannot print (emoji or non-Latin text). Choose Everything, as images, which keeps them as they look."
          : "Hindi ma-flatten ang mga field ng form na ito. Choose Everything, as images instead.",
      );
    }
    ctx.progress(0.9, "Saving");
    return {
      files: [{ name: renameFile(file.name, "pdf", "-flattened"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `${fields.length} form ${fields.length === 1 ? "field" : "fields"} locked into the page. Text stays selectable.`,
    };
  },
};

async function flattenToImages(file: WorkFile, dpi: number, ctx: Parameters<typeof flattenPdf.run>[2]) {
  const { PDFDocument } = await import("pdf-lib");
  const { pdf, close } = await openPdf(file);
  const output = await PDFDocument.create();
  let reducedAny = false;
  try {
    for (let i = 0; i < pdf.numPages; i++) {
      if (ctx.signal?.aborted) throw new KreaError("failed", "Cancelled.");
      ctx.progress(i / pdf.numPages, `Page ${i + 1} of ${pdf.numPages}`);
      const page = await pdf.getPage(i + 1);
      // Size as seen (rotation applied), in points.
      const { width, height } = page.getViewport({ scale: 1 });
      page.cleanup();
      const rendered = await renderPage(pdf, i, dpi / 72, "image/jpeg", 0.9);
      reducedAny ||= rendered.reduced;
      const image = await output.embedJpg(await rendered.blob.arrayBuffer());
      output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    }
  } finally {
    await close();
  }
  ctx.progress(0.95, "Saving");
  return {
    files: [{ name: renameFile(file.name, "pdf", "-flattened"), type: PDF_MIME, blob: pdfBlob(await output.save()) }],
    note: `${output.getPageCount()} ${output.getPageCount() === 1 ? "page" : "pages"} flattened as images at ${dpi} DPI. Text is no longer selectable or searchable.${reducedAny ? " Some very large pages were rendered a little lower to stay memory-safe." : ""}`,
  };
}
