/**
 * Converts iPhone HEIC photos (and AVIF) to JPEG when they arrive on the Stage,
 * so every image tool can use them.
 *
 * HEIC: decoded with heic-to (libheif compiled to WebAssembly, about 3 MB),
 * imported only when a HEIC file is actually dropped. It decodes in its own
 * worker. AVIF: modern browsers decode it natively, so the browser does it.
 */
import { renameFile } from "@/lib/file-type";
import { ensureOffscreenCanvas } from "@/lib/offscreen-shim";
import { KreaError } from "@/tools/types";

/** Give up on a decoder that does not answer, instead of hanging the Stage. */
const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

async function viaBrowser(blob: Blob): Promise<Blob> {
  ensureOffscreenCanvas();
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

/** Returns a JPEG version of the photo, named like the original with a .jpg extension. */
export async function convertToJpeg(blob: Blob, name: string, mime: string): Promise<{ blob: Blob; name: string }> {
  const target = renameFile(name, "jpg");
  // Safari decodes HEIC itself, and every modern browser decodes AVIF: try that first, it is instant.
  try {
    return { blob: await withTimeout(viaBrowser(blob), 15_000), name: target };
  } catch {
    // Not decodable natively (Chrome, Edge, Firefox for HEIC).
  }
  try {
    if (mime !== "image/heic") throw new Error("not HEIC");
    const { heicTo } = await import("heic-to/next");
    return { blob: await withTimeout(heicTo({ blob, type: "image/jpeg", quality: 0.92 }), 60_000), name: target };
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new KreaError(
      "unsupported",
      offline
        ? `Hindi ma-convert ang "${name}" offline yet: the HEIC converter has not been downloaded. Connect once, then try again.`
        : `Hindi ma-open ang "${name}". The photo may be damaged, or this HEIF variant is not supported. Sa iPhone, try Settings > Camera > Formats > Most Compatible.`,
    );
  }
}
