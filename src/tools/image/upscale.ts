/** Tool 8: Image Upscaler. 2x and 4x resampling with sharpening. Not generative AI. */
import { extensionFor, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas, MAX_CANVAS_PIXELS } from "@/lib/image-utils";
import type { Tool } from "../types";

/** Rows per sharpening pass. Bounds memory to one strip instead of the whole image. */
const BAND = 512;

/**
 * Sharpen in place with a 3x3 kernel, strip by strip.
 * Each output pixel = centre * (1 + 4a) - a * (up + down + left + right).
 */
function sharpen(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, amount: number): void {
  const { width, height } = canvas;
  const a = amount;
  // A finished strip is written only after the next one has been read, so every
  // strip samples original pixels rather than rows that were already sharpened.
  let pending: { data: ImageData; top: number } | null = null;
  for (let top = 0; top < height; top += BAND) {
    const rows = Math.min(BAND, height - top);
    // Read one extra row above and below so strip edges sharpen correctly.
    const readTop = Math.max(0, top - 1);
    const readRows = Math.min(height, top + rows + 1) - readTop;
    const source = ctx.getImageData(0, readTop, width, readRows).data;
    if (pending) ctx.putImageData(pending.data, 0, pending.top);
    const out = ctx.createImageData(width, rows);
    const target = out.data;

    for (let y = 0; y < rows; y++) {
      const sy = y + (top - readTop);
      const up = Math.max(0, sy - 1) * width * 4;
      const mid = sy * width * 4;
      const down = Math.min(readRows - 1, sy + 1) * width * 4;
      for (let x = 0; x < width; x++) {
        const left = Math.max(0, x - 1) * 4;
        const right = Math.min(width - 1, x + 1) * 4;
        const i = x * 4;
        const o = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          target[o + c] =
            source[mid + i + c] * (1 + 4 * a) -
            a * (source[up + i + c] + source[down + i + c] + source[mid + left + c] + source[mid + right + c]);
        }
        target[o + 3] = source[mid + i + 3];
      }
    }
    pending = { data: out, top };
  }
  if (pending) ctx.putImageData(pending.data, 0, pending.top);
}

export const upscale: Tool = {
  id: 8,
  slug: "image-upscaler",
  name: "Image Upscaler",
  verb: "Upscale",
  category: "image",
  description: "Enlarge images 2x or 4x with smooth resampling and sharpening. Not generative AI: it cannot invent detail.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "Image Upscaler: enlarge photos 2x or 4x in your browser",
  seoDescription:
    "Upscale images 2x or 4x on your device with high-quality resampling and sharpening. Honest: this is not generative AI. No upload.",
  howTo: [
    "Drop an image on the Stage.",
    "Choose 2x or 4x and how much sharpening you want.",
    "Upscale and download. Small images benefit most; very large ones may be refused to protect memory.",
  ],
  icon: "upscale",
  worker: "image",
  input: "each",
  fields: [
    {
      key: "scale",
      label: "Scale",
      type: "select",
      default: "2",
      hint: "Canvas-based enhancement, hindi generative AI. Edges get cleaner, but missing detail is not recreated.",
      options: [
        { value: "2", label: "2x" },
        { value: "4", label: "4x" },
      ],
    },
    { key: "sharpen", label: "Sharpening", type: "slider", min: 0, max: 100, step: 5, unit: "%", default: 40 },
  ],

  warn(inputs, options) {
    const factor = Number(options.scale);
    const biggest = Math.max(...inputs.map((input) => (input.width ?? 0) * (input.height ?? 0) * factor * factor));
    const megapixels = Math.round(biggest / 1e6);
    if (biggest > MAX_CANVAS_PIXELS) {
      return `Output would be about ${megapixels} MP, lampas sa ${MAX_CANVAS_PIXELS / 1e6} MP limit. Use 2x or a smaller image.`;
    }
    if (biggest > 24e6) return `Heads up: output will be about ${megapixels} MP. Malaki ito, so it may take a while and a lot of memory.`;
    return null;
  },

  async run([file], options, ctx) {
    const bitmap = await decodeImage(file);
    const factor = Number(options.scale);
    // Validate the final size up front (createCanvas throws a clear "too large" error).
    let current = createCanvas(bitmap.width, bitmap.height);
    createCanvas(bitmap.width * factor, bitmap.height * factor);
    current.ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Doubling in steps gives smoother edges than one big jump.
    const steps = Math.log2(factor);
    const amount = (Number(options.sharpen) / 100) * 0.35;
    for (let step = 0; step < steps; step++) {
      ctx.progress(step / steps, `Upscaling ${2 ** (step + 1)}x`);
      const next = createCanvas(current.canvas.width * 2, current.canvas.height * 2);
      next.ctx.drawImage(current.canvas, 0, 0, next.canvas.width, next.canvas.height);
      current = next;
      if (amount > 0) sharpen(current.canvas, current.ctx, amount);
    }

    const mime = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await encodeCanvas(current.canvas, mime, 0.95);
    return {
      files: [{ name: renameFile(file.name, extensionFor(mime), `-${factor}x`), type: mime, blob }],
      note: `Now ${current.canvas.width} x ${current.canvas.height} px. Enhanced by resampling and sharpening, not generative AI.`,
    };
  },
};
