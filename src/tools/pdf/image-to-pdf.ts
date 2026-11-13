/** Tool 15: Image to PDF. One image per page, in the order shown on the Stage. */
import { IMAGE_MIMES, PDF_MIME } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas } from "@/lib/image-utils";
import { pdfBlob } from "@/lib/pdf-utils";
import type { Tool } from "../types";

/** Page sizes in PDF points (1/72 inch), portrait. */
const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

export const imageToPdf: Tool = {
  id: 15,
  slug: "image-to-pdf",
  name: "Image to PDF",
  verb: "Image to PDF",
  category: "pdf",
  description: "Combine images into a single PDF with page size, orientation and margin options.",
  accepts: IMAGE_MIMES,
  seoTitle: "Image to PDF: turn JPG and PNG into one PDF, offline",
  seoDescription:
    "Convert JPG, PNG and WebP images into a single PDF in your browser. Choose A4, Letter or Legal, set margins, reorder pages. No upload.",
  howTo: [
    "Drop one or more images on the Stage.",
    "Drag the files into page order, then choose page size and margins.",
    "Create the PDF and download it.",
  ],
  icon: "image-to-pdf",
  worker: "pdf",
  input: "all",
  fields: [
    {
      key: "pageSize",
      label: "Page size",
      type: "select",
      default: "a4",
      options: [
        { value: "a4", label: "A4" },
        { value: "letter", label: "Letter (short bond)" },
        { value: "legal", label: "Legal (long bond)" },
        { value: "fit", label: "Same as image" },
      ],
    },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      default: "auto",
      showIf: (v) => v.pageSize !== "fit",
      options: [
        { value: "auto", label: "Auto (match each image)" },
        { value: "portrait", label: "Portrait" },
        { value: "landscape", label: "Landscape" },
      ],
    },
    {
      key: "margin",
      label: "Margin",
      type: "select",
      default: "18",
      showIf: (v) => v.pageSize !== "fit",
      options: [
        { value: "0", label: "None" },
        { value: "18", label: "Small (0.25 in)" },
        { value: "36", label: "Medium (0.5 in)" },
        { value: "72", label: "Large (1 in)" },
      ],
    },
    { key: "name", label: "Output file name", type: "text", placeholder: "images", default: "images" },
  ],

  async run(inputs, options, ctx) {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();

    for (let i = 0; i < inputs.length; i++) {
      const file = inputs[i];
      ctx.progress(i / inputs.length, `Adding ${file.name}`);

      // Re-encode through a canvas so EXIF rotation is baked in (pdf-lib ignores it)
      // and WebP becomes something PDF can hold. PNG stays lossless; the rest become JPG.
      const bitmap = await decodeImage(file);
      const { canvas, ctx: draw } = createCanvas(bitmap.width, bitmap.height);
      const lossless = file.type === "image/png";
      if (!lossless) {
        draw.fillStyle = "#ffffff";
        draw.fillRect(0, 0, canvas.width, canvas.height);
      }
      draw.drawImage(bitmap, 0, 0);
      bitmap.close();
      const bytes = await (await encodeCanvas(canvas, lossless ? "image/png" : "image/jpeg", 0.92)).arrayBuffer();
      const image = lossless ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

      if (options.pageSize === "fit") {
        // 1 image pixel = 1 point keeps the page the same shape as the image.
        const page = pdf.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        continue;
      }

      let [pageW, pageH] = PAGE_SIZES[String(options.pageSize)];
      const landscape =
        options.orientation === "landscape" || (options.orientation === "auto" && image.width > image.height);
      if (landscape) [pageW, pageH] = [pageH, pageW];

      const margin = Number(options.margin);
      const scale = Math.min((pageW - margin * 2) / image.width, (pageH - margin * 2) / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const page = pdf.addPage([pageW, pageH]);
      page.drawImage(image, { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height });
    }

    ctx.progress(0.95, "Saving");
    const name = String(options.name).trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "-") || "images";
    return {
      files: [{ name: `${name}.pdf`, type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `${inputs.length} page${inputs.length === 1 ? "" : "s"}.`,
    };
  },
};
