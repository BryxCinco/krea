/** Tool 4: Format Converter. JPG, PNG and WebP, batch-capable. */
import { extensionFor, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas } from "@/lib/image-utils";
import type { Tool } from "../types";

export const convert: Tool = {
  id: 4,
  slug: "format-converter",
  name: "Format Converter",
  verb: "Convert",
  category: "image",
  description: "Convert between JPG, PNG and WebP, one file or a whole batch.",
  accepts: IMAGE_MIMES,
  seoTitle: "Image Format Converter: JPG, PNG, WebP in batch",
  seoDescription:
    "Convert images between JPG, PNG and WebP in your browser. Batch convert and download a ZIP. Private: files never leave your device.",
  howTo: [
    "Drop the images you want to convert.",
    "Choose the output format and, for JPG or WebP, the quality.",
    "Convert and download. Batches are zipped for you.",
  ],
  icon: "convert",
  worker: "image",
  input: "each",
  compare: true,
  fields: [
    {
      key: "format",
      label: "Convert to",
      type: "select",
      default: "image/jpeg",
      options: [
        { value: "image/jpeg", label: "JPG" },
        { value: "image/png", label: "PNG" },
        { value: "image/webp", label: "WebP" },
      ],
    },
    {
      key: "quality",
      label: "Quality",
      type: "slider",
      min: 10,
      max: 100,
      step: 1,
      unit: "%",
      default: 90,
      showIf: (v) => v.format !== "image/png",
    },
    {
      key: "background",
      label: "Background for transparent areas",
      type: "color",
      default: "#ffffff",
      hint: "JPG has no transparency, so see-through pixels get this colour.",
      showIf: (v) => v.format === "image/jpeg",
    },
  ],

  async run([file], options) {
    const bitmap = await decodeImage(file);
    const mime = String(options.format);
    const { canvas, ctx } = createCanvas(bitmap.width, bitmap.height);
    if (mime === "image/jpeg") {
      ctx.fillStyle = String(options.background);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await encodeCanvas(canvas, mime, Number(options.quality) / 100);
    return { files: [{ name: renameFile(file.name, extensionFor(mime)), type: mime, blob }] };
  },
};
