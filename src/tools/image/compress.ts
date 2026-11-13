/** Tool 1: Image Compressor. Quality slider or a target size in KB. */
import { extensionFor, formatBytes, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { decodeImage, encodeCanvas, flattenOnto, scaleToCanvas } from "@/lib/image-utils";
import type { Tool } from "../types";

/** Find the highest quality whose output fits `maxBytes`. Returns the smallest attempt if none fit. */
async function fitQuality(canvas: OffscreenCanvas, mime: string, maxBytes: number): Promise<Blob> {
  let low = 0.05;
  let high = 0.95;
  let best: Blob | null = null;
  let smallest: Blob | null = null;
  for (let i = 0; i < 7; i++) {
    const quality = (low + high) / 2;
    const blob = await encodeCanvas(canvas, mime, quality);
    if (!smallest || blob.size < smallest.size) smallest = blob;
    if (blob.size <= maxBytes) {
      best = blob;
      low = quality;
    } else {
      high = quality;
    }
  }
  return best ?? smallest!;
}

export const compress: Tool = {
  id: 1,
  slug: "image-compressor",
  name: "Image Compressor",
  verb: "Compress",
  category: "image",
  description: "Shrink JPG, PNG and WebP files with a quality slider or an exact target size in KB.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "Image Compressor: compress to an exact KB size, offline",
  seoDescription:
    "Compress JPG, PNG and WebP to a target size like 200 KB right in your browser. No upload, no account. Works offline.",
  howTo: [
    "Drop one or more images on the Stage.",
    "Pick a quality level, or switch to Target size and type the limit in KB.",
    "Compare before and after, then download. Several files come out as one ZIP.",
  ],
  icon: "compress",
  worker: "image",
  input: "each",
  live: true,
  compare: true,
  fields: [
    {
      key: "mode",
      label: "Mode",
      type: "select",
      default: "quality",
      options: [
        { value: "quality", label: "Quality" },
        { value: "target", label: "Target size" },
      ],
    },
    {
      key: "quality",
      label: "Quality",
      type: "slider",
      min: 5,
      max: 100,
      step: 1,
      unit: "%",
      default: 75,
      showIf: (v) => v.mode === "quality",
    },
    {
      key: "targetKB",
      label: "Target size",
      type: "number",
      min: 10,
      max: 20000,
      step: 10,
      unit: "KB",
      default: 200,
      hint: "Krea lowers quality first, then dimensions, until the file fits.",
      showIf: (v) => v.mode === "target",
    },
    {
      key: "format",
      label: "Output format",
      type: "select",
      default: "auto",
      hint: "Auto keeps JPG as JPG and turns PNG into WebP so transparency survives.",
      options: [
        { value: "auto", label: "Auto" },
        { value: "image/jpeg", label: "JPG" },
        { value: "image/webp", label: "WebP" },
      ],
    },
  ],
  presets: [
    { id: "gov-200", label: "Gov portal 200 KB", hint: "Common limit on government upload forms", values: { mode: "target", targetKB: 200, format: "image/jpeg" } },
    { id: "form-500", label: "Online form 500 KB", values: { mode: "target", targetKB: 500, format: "image/jpeg" } },
    { id: "job-1mb", label: "Job application 1 MB", values: { mode: "target", targetKB: 1000, format: "image/jpeg" } },
  ],

  async run([file], options, ctx) {
    const bitmap = await decodeImage(file);
    const mime = options.format === "auto" ? (file.type === "image/jpeg" ? "image/jpeg" : "image/webp") : String(options.format);

    const prepare = (width: number, height: number) => {
      const { canvas } = scaleToCanvas(bitmap, width, height);
      return mime === "image/jpeg" ? flattenOnto(canvas, "#ffffff") : canvas;
    };

    let blob: Blob;
    let note: string | undefined;

    if (options.mode === "target") {
      const maxBytes = Math.max(1, Number(options.targetKB) || 200) * 1024;
      let scale = 1;
      blob = await fitQuality(prepare(bitmap.width, bitmap.height), mime, maxBytes);
      // Quality alone was not enough: shrink dimensions step by step.
      for (let attempt = 0; attempt < 8 && blob.size > maxBytes; attempt++) {
        scale *= Math.max(0.5, Math.min(0.9, Math.sqrt(maxBytes / blob.size)));
        ctx.progress((attempt + 1) / 9, "Resizing to fit");
        blob = await fitQuality(prepare(bitmap.width * scale, bitmap.height * scale), mime, maxBytes);
      }
      if (blob.size > maxBytes) {
        note = `Hindi umabot sa ${options.targetKB} KB. Smallest we could get is ${formatBytes(blob.size)}.`;
      } else if (scale < 1) {
        note = `Scaled to ${Math.round(scale * 100)}% of the original dimensions to fit ${options.targetKB} KB.`;
      }
    } else {
      blob = await encodeCanvas(prepare(bitmap.width, bitmap.height), mime, Number(options.quality) / 100);
      if (blob.size >= file.blob.size) {
        note = "Result is not smaller than the original. This file is already well compressed; try a lower quality.";
      }
    }

    bitmap.close();
    return { files: [{ name: renameFile(file.name, extensionFor(mime), "-compressed"), type: mime, blob }], note };
  },
};
