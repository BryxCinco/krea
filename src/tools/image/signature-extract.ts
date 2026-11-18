/**
 * Tool 53: Signature Extractor. Turns a photo of a signature on paper into a
 * transparent PNG: the paper disappears and only the ink stays, recoloured if
 * wanted, cropped tight. Uneven light and phone shadows are evened out by
 * comparing each pixel with the local paper brightness instead of one global
 * cut-off. Pure pixel code (no DOM), so it runs anywhere.
 * UI: components/stage/editors/signature-extract-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const signatureExtract = editorTool(
  {
    id: 53,
    slug: "signature-extractor",
    name: "Signature Extractor",
    verb: "Extract signature",
    description: "Turn a photo of your signature on paper into a clean, transparent PNG.",
    seoTitle: "Signature Extractor: photo of a signature to transparent PNG",
    seoDescription:
      "Remove the paper from a photo of your signature and get a transparent PNG for documents. Even out shadows, pick black or blue ink, crop, and save it for Sign PDF. Nothing is uploaded.",
    howTo: [
      "Sign on clean white paper with a dark pen and take a photo in good light, straight from above.",
      "Open the photo and drag a box around the signature.",
      "Adjust Sensitivity until thin strokes stay and the paper is gone, pick the ink colour, then download the PNG or save it for Sign PDF.",
    ],
    faqs: [
      { q: "How do I get the cleanest result?", a: "Use white paper, a black or dark blue pen, and daylight or a bright lamp, with the phone held flat above the page. Crop close to the signature. Even lighting removes most shadows; raise Sensitivity if thin strokes disappear." },
      { q: "Why make the ink black or blue?", a: "A photo often makes ink grey or uneven. Black or blue gives the whole signature one solid colour, so it looks like it was signed on the document. Keep original keeps the photo's colours." },
      { q: "Is my signature uploaded?", a: "No. The photo is processed inside your browser and never leaves your device. If you save it for Sign PDF, it is stored only in this browser, and you can delete it any time." },
      { q: "Can I use this to copy someone else's signature?", a: "No. Use it only for your own signature, or with clear permission. Putting someone else's signature on a document without consent can be forgery." },
    ],
    icon: "sigextract",
  },
  "image",
);

export type InkMode = "original" | "black" | "blue";
export const INK_RGB: Record<Exclude<InkMode, "original">, [number, number, number]> = {
  black: [20, 20, 24],
  blue: [24, 52, 150],
};

export interface ExtractOptions {
  /** 0..100: higher keeps fainter strokes (and more noise). */
  sensitivity: number;
  ink: InkMode;
  /** Compare each pixel with the local paper brightness, which removes shadows and gradients. */
  evenLight: boolean;
  /** Drop tiny isolated dots (dust, paper grain). */
  despeckle: boolean;
}

export interface Crop {
  /** Normalized 0..1 of the source image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ExtractResult extends PixelImage {
  /** Pixels that ended up mostly opaque; 0 means nothing was found. */
  inkPixels: number;
}

const PADDING = 8;

/** Box blur with a summed-area table: O(pixels), whatever the radius. */
function boxBlur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += values[y * width + x];
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const total = sums[y1 * (width + 1) + x1] - sums[y0 * (width + 1) + x1] - sums[y1 * (width + 1) + x0] + sums[y0 * (width + 1) + x0];
      out[y * width + x] = total / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Remove opaque blobs smaller than `minArea` pixels (8-connected). */
function despeckle(alpha: Uint8ClampedArray, width: number, height: number, minArea: number): void {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const blob: number[] = [];
  for (let start = 0; start < alpha.length; start++) {
    if (seen[start] || alpha[start] < 90) continue;
    blob.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      blob.push(index);
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!seen[next] && alpha[next] >= 90) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (blob.length < minArea) for (const index of blob) alpha[index] = 0;
  }
  // Faint pixels that no longer touch any ink are noise too.
  for (let i = 0; i < alpha.length; i++) if (alpha[i] < 90 && !seen[i]) alpha[i] = Math.min(alpha[i], 40);
}

/** Paper becomes transparent, ink stays (recoloured if asked), then the result is cropped to the ink. */
export function extractSignature(source: PixelImage, crop: Crop, options: ExtractOptions): ExtractResult {
  const sx = Math.max(0, Math.min(source.width - 1, Math.round(crop.x * source.width)));
  const sy = Math.max(0, Math.min(source.height - 1, Math.round(crop.y * source.height)));
  const width = Math.max(1, Math.min(source.width - sx, Math.round(crop.w * source.width)));
  const height = Math.max(1, Math.min(source.height - sy, Math.round(crop.h * source.height)));
  const count = width * height;

  const luminance = new Float32Array(count);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((sy + y) * source.width + sx + x) * 4;
      luminance[y * width + x] = 0.299 * source.data[i] + 0.587 * source.data[i + 1] + 0.114 * source.data[i + 2];
    }
  }

  // Paper brightness: local when evening out light (blur, then blur again with ink replaced by
  // the first estimate, so dark strokes do not drag the paper level down), else the bright end of the image.
  let paper: Float32Array;
  if (options.evenLight) {
    const radius = Math.max(8, Math.round(Math.min(width, height) / 10));
    const first = boxBlur(luminance, width, height, radius);
    const lifted = new Float32Array(count);
    for (let i = 0; i < count; i++) lifted[i] = Math.max(luminance[i], first[i]);
    paper = boxBlur(lifted, width, height, radius);
  } else {
    const sorted = Float32Array.from(luminance).sort();
    paper = new Float32Array(count).fill(sorted[Math.floor(count * 0.9)] || 255);
  }

  // Sensitivity 0..100 moves the cut-off between "clearly ink" and "paper".
  const cut = 0.6 + (Math.max(0, Math.min(100, options.sensitivity)) / 100) * 0.32;
  const soft = 0.16;
  const alpha = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) {
    const relative = luminance[i] / Math.max(24, paper[i]);
    alpha[i] = Math.round(Math.max(0, Math.min(1, (cut - relative) / soft)) * 255);
  }
  if (options.despeckle) despeckle(alpha, width, height, Math.max(6, Math.round(count * 0.00003)));

  // Tight box around the ink.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let inkPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alpha[y * width + x];
      if (a > 25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (a > 128) inkPixels++;
    }
  }
  if (maxX < 0) return { data: new Uint8ClampedArray(4), width: 1, height: 1, inkPixels: 0 };
  minX = Math.max(0, minX - PADDING);
  minY = Math.max(0, minY - PADDING);
  maxX = Math.min(width - 1, maxX + PADDING);
  maxY = Math.min(height - 1, maxY + PADDING);
  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const out = new Uint8ClampedArray(outW * outH * 4);
  const solid = options.ink === "original" ? null : INK_RGB[options.ink];
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const local = (minY + y) * width + minX + x;
      const o = (y * outW + x) * 4;
      const a = alpha[local];
      if (!a) continue;
      if (solid) {
        out[o] = solid[0];
        out[o + 1] = solid[1];
        out[o + 2] = solid[2];
      } else {
        // Keep the pen's hue but drop the paper's brightness mixed into edge pixels.
        const i = ((sy + minY + y) * source.width + sx + minX + x) * 4;
        const darken = 0.75;
        out[o] = source.data[i] * darken;
        out[o + 1] = source.data[i + 1] * darken;
        out[o + 2] = source.data[i + 2] * darken;
      }
      out[o + 3] = a;
    }
  }
  return { data: out, width: outW, height: outH, inkPixels };
}
