/**
 * Worker-side image helpers built on OffscreenCanvas and createImageBitmap.
 * Nothing here touches the DOM, so it is safe inside a Web Worker.
 */
import { KreaError, type WorkFile } from "@/tools/types";

/** Decoded pixels cost 4 bytes each; 80 MP is roughly 320 MB of RAM, a sane ceiling for phones. */
export const MAX_PIXELS = 80_000_000;
/** Canvas backing stores fail silently past browser limits, so we cap output area as well. */
export const MAX_CANVAS_PIXELS = 64_000_000;

export type Canvas2D = OffscreenCanvasRenderingContext2D;

/** Decode an image file, applying EXIF orientation. Throws clear errors for corrupt or oversized input. */
export async function decodeImage(file: WorkFile): Promise<ImageBitmap> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file.blob, { imageOrientation: "from-image" });
  } catch {
    throw new KreaError("corrupted", `Hindi mabasa ang "${file.name}". The image may be corrupted or not a real image file.`);
  }
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    const megapixels = Math.round((bitmap.width * bitmap.height) / 1e6);
    bitmap.close();
    throw new KreaError("too-large", `"${file.name}" is ${megapixels} MP, masyadong malaki for this device. Max is ${MAX_PIXELS / 1e6} MP.`);
  }
  return bitmap;
}

export function createCanvas(width: number, height: number): { canvas: OffscreenCanvas; ctx: Canvas2D } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w * h > MAX_CANVAS_PIXELS) {
    throw new KreaError("too-large", `Output of ${w} x ${h} px is too large to render safely. Try a smaller size.`);
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new KreaError("failed", "Could not create a drawing surface. Try closing other tabs.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

/** Encode a canvas. `quality` (0..1) only applies to JPEG and WebP. */
export async function encodeCanvas(canvas: OffscreenCanvas, mime: string, quality?: number): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type: mime, quality });
  // Browsers silently fall back to PNG when they cannot encode the requested type.
  if (blob.type !== mime) {
    throw new KreaError("unsupported", `This browser cannot export ${mime.replace("image/", "").toUpperCase()} files.`);
  }
  return blob;
}

/**
 * Draw `source` scaled into a new canvas of the given size.
 * Large downscales are done in halving steps, which avoids the aliasing a
 * single drawImage call produces when shrinking by more than 2x.
 */
export function scaleToCanvas(
  source: ImageBitmap | OffscreenCanvas,
  width: number,
  height: number,
  /** Source rectangle to sample; defaults to the full image. */
  crop?: { x: number; y: number; w: number; h: number },
): { canvas: OffscreenCanvas; ctx: Canvas2D } {
  let current: ImageBitmap | OffscreenCanvas = source;
  let sx = crop?.x ?? 0;
  let sy = crop?.y ?? 0;
  let sw = crop?.w ?? source.width;
  let sh = crop?.h ?? source.height;

  while (sw / 2 > width && sh / 2 > height) {
    const half = createCanvas(sw / 2, sh / 2);
    half.ctx.drawImage(current, sx, sy, sw, sh, 0, 0, half.canvas.width, half.canvas.height);
    current = half.canvas;
    sx = 0;
    sy = 0;
    sw = half.canvas.width;
    sh = half.canvas.height;
  }

  const out = createCanvas(width, height);
  out.ctx.drawImage(current, sx, sy, sw, sh, 0, 0, out.canvas.width, out.canvas.height);
  return out;
}

/** Paint a solid colour behind existing pixels (used before JPEG export, which has no transparency). */
export function flattenOnto(canvas: OffscreenCanvas, color: string): OffscreenCanvas {
  const out = createCanvas(canvas.width, canvas.height);
  out.ctx.fillStyle = color;
  out.ctx.fillRect(0, 0, canvas.width, canvas.height);
  out.ctx.drawImage(canvas, 0, 0);
  return out.canvas;
}

/** Output MIME that keeps the source format when we can encode it, otherwise PNG. */
export function sameFormat(mime: string): string {
  return mime === "image/jpeg" || mime === "image/webp" || mime === "image/png" ? mime : "image/png";
}

/** Turn a data URL (how picked logos and signatures are stored in settings) back into a Blob. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Trace a rounded rectangle path, falling back to square corners on older engines. */
export function roundedRect(ctx: Canvas2D, x: number, y: number, w: number, h: number, radius: number): void {
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}
