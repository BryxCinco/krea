/**
 * Tool 13: Compress PDF.
 *
 * Two real techniques, no faking:
 *  1. Structural: rewrite the file with compressed object streams.
 *  2. Images: re-encode embedded JPEG photos at a lower quality and resolution.
 * Text, fonts and vector graphics are never touched, so text stays selectable.
 * If neither technique makes the file smaller, the original is returned and the
 * result says so.
 */
import type { PDFDict } from "pdf-lib";
import { formatBytes, PDF_MIME, renameFile } from "@/lib/file-type";
import { createCanvas, encodeCanvas } from "@/lib/image-utils";
import { loadPdf, pdfBlob } from "@/lib/pdf-utils";
import type { Tool, WorkFile } from "../types";

interface Level {
  label: string;
  /** JPEG quality 0..1, or null to leave images alone. */
  quality: number | null;
  /** Longest side allowed for an embedded photo, in pixels. */
  maxSide: number;
}

const LEVELS: Record<string, Level> = {
  lossless: { label: "structure only", quality: null, maxSide: Infinity },
  balanced: { label: "balanced", quality: 0.72, maxSide: 1800 },
  strong: { label: "strong", quality: 0.5, maxSide: 1300 },
  extreme: { label: "smallest", quality: 0.35, maxSide: 1000 },
};

/** Run one optimization pass. Loads a fresh copy because recompression mutates the document. */
async function optimize(file: WorkFile, level: Level): Promise<{ bytes: Uint8Array; images: number }> {
  const { PDFName, PDFRawStream, PDFArray, PDFNumber } = await import("pdf-lib");
  const pdf = await loadPdf(file);
  let images = 0;

  if (level.quality !== null) {
    const name = (dict: PDFDict, key: string) => {
      const value = dict.lookup(PDFName.of(key));
      return value instanceof PDFName ? value.decodeText() : value instanceof PDFArray ? "array" : undefined;
    };

    for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      const dict = object.dict;
      if (name(dict, "Subtype") !== "Image") continue;

      // Only plain JPEG photos in RGB or grayscale. Everything else (CMYK, masks,
      // indexed colour, non-JPEG encodings) is left untouched because converting it
      // safely is not possible with canvas alone.
      const filter = dict.lookup(PDFName.of("Filter"));
      const filterName =
        filter instanceof PDFName ? filter.decodeText() : filter instanceof PDFArray && filter.size() === 1 ? String(filter.lookup(0)).slice(1) : "";
      const colorSpace = name(dict, "ColorSpace");
      if (filterName !== "DCTDecode") continue;
      if (colorSpace !== "DeviceRGB" && colorSpace !== "DeviceGray") continue;
      if (dict.has(PDFName.of("ImageMask")) || dict.has(PDFName.of("Mask")) || dict.has(PDFName.of("Decode"))) continue;

      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(new Blob([object.contents as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
      } catch {
        continue; // an exotic JPEG variant the browser cannot decode: keep the original
      }
      const factor = Math.min(1, level.maxSide / Math.max(bitmap.width, bitmap.height));
      const { canvas, ctx } = createCanvas(bitmap.width * factor, bitmap.height * factor);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const encoded = new Uint8Array(await (await encodeCanvas(canvas, "image/jpeg", level.quality)).arrayBuffer());
      if (encoded.length >= object.contents.length) continue; // no gain, keep the original

      dict.set(PDFName.of("Width"), PDFNumber.of(canvas.width));
      dict.set(PDFName.of("Height"), PDFNumber.of(canvas.height));
      dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB")); // canvas JPEGs are always 3-channel
      dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
      dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      dict.delete(PDFName.of("DecodeParms"));
      pdf.context.assign(ref, PDFRawStream.of(dict, encoded));
      images++;
    }
  }

  return { bytes: await pdf.save({ useObjectStreams: true }), images };
}

export const compressPdf: Tool = {
  id: 13,
  slug: "compress-pdf",
  name: "Compress PDF",
  verb: "Compress PDF",
  category: "pdf",
  description: "Shrink PDFs by optimizing their structure and recompressing photos. Text stays selectable.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Compress PDF: reduce PDF size offline, text stays selectable",
  seoDescription:
    "Compress PDF files in your browser. Krea optimizes structure and recompresses embedded photos, then reports the real before and after size. No upload.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Pick a level, or set a target size in MB and Krea will try stronger levels until it fits.",
    "Check the before and after size. If the file cannot be made smaller, Krea tells you and keeps the original.",
  ],
  faqs: [
    { q: "Is my PDF uploaded to compress it?", a: "No. Krea optimizes the PDF inside your browser; it never leaves your device." },
    { q: "Why did my PDF not get smaller?", a: "Krea only shrinks the file structure and embedded JPEG photos. PDFs made mostly of text, or already optimized, may not get smaller. Krea tells you and keeps the original instead of making it worse." },
    { q: "Will the text still be selectable?", a: "Yes. Text, fonts and vector graphics are never touched; only photos are recompressed. Pages are never turned into images." },
    { q: "How do I get a PDF under 2 MB for email?", a: "Use the Email-safe 2 MB preset. Krea tries stronger levels until the file fits and says so if it cannot." },
  ],
  icon: "compress-pdf",
  worker: "pdf",
  input: "each",
  fields: [
    {
      key: "level",
      label: "Level",
      type: "select",
      default: "balanced",
      hint: "Structure only is lossless. The others also lower the quality of embedded photos. Scans saved as PNG-style images, and text, are not changed.",
      options: [
        { value: "lossless", label: "Structure only (lossless)" },
        { value: "balanced", label: "Balanced" },
        { value: "strong", label: "Strong" },
        { value: "extreme", label: "Smallest" },
      ],
    },
    {
      key: "targetMB",
      label: "Target size (optional)",
      type: "number",
      min: 0,
      max: 200,
      step: 0.5,
      unit: "MB",
      default: 0,
      hint: "0 means no target. With a target, Krea steps up the level until the file fits, and says so if it cannot.",
    },
  ],
  presets: [
    { id: "email", label: "Email-safe 2 MB", hint: "Most email providers accept attachments this size", values: { level: "balanced", targetMB: 2 } },
    { id: "portal", label: "Portal upload 5 MB", values: { level: "balanced", targetMB: 5 } },
  ],

  async run([file], options, ctx) {
    const original = file.blob.size;
    const target = Number(options.targetMB) > 0 ? Number(options.targetMB) * 1024 * 1024 : null;

    // With a target, start at the chosen level and escalate only as far as needed.
    const order = ["lossless", "balanced", "strong", "extreme"];
    const start = Math.max(0, order.indexOf(String(options.level)));
    const attempts = target ? order.slice(start) : [order[start]];

    let best: { bytes: Uint8Array; images: number; level: Level } | null = null;
    for (let i = 0; i < attempts.length; i++) {
      const level = LEVELS[attempts[i]];
      ctx.progress(i / attempts.length, `Optimizing (${level.label})`);
      const pass = await optimize(file, level);
      if (!best || pass.bytes.length < best.bytes.length) best = { ...pass, level };
      if (!target || best.bytes.length <= target) break;
    }

    const size = best!.bytes.length;
    if (size >= original) {
      return {
        files: [{ name: file.name, type: PDF_MIME, blob: file.blob }],
        note: `Hindi na mapaliit: this PDF is already optimized (${formatBytes(original)}). The original file is returned unchanged.`,
      };
    }

    const parts = [
      `${best!.level.label[0].toUpperCase()}${best!.level.label.slice(1)} level.`,
      best!.images ? `${best!.images} photo${best!.images === 1 ? "" : "s"} recompressed.` : "No recompressible photos found, so only the structure was optimized.",
    ];
    if (target && size > target) {
      parts.push(`Hindi umabot sa ${options.targetMB} MB target: ${formatBytes(size)} is the smallest Krea can get without rasterizing pages.`);
    }
    return {
      files: [{ name: renameFile(file.name, "pdf", "-compressed"), type: PDF_MIME, blob: pdfBlob(best!.bytes) }],
      note: parts.join(" "),
    };
  },
};
