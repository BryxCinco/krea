/**
 * Fallback for browsers without OffscreenCanvas (iOS Safari before 16.4, and
 * some WebKit builds). There, image and PDF Moves run on the page instead of in
 * a worker, and this shim gives them an OffscreenCanvas made from a regular
 * <canvas>, with convertToBlob() implemented on top of toBlob().
 */

export function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== "undefined" && "convertToBlob" in OffscreenCanvas.prototype;
}

/** Install the shim on the main thread. Safe to call more than once. */
export function ensureOffscreenCanvas(): void {
  if (hasOffscreenCanvas() || typeof document === "undefined") return;

  class CanvasBackedOffscreenCanvas {
    constructor(width: number, height: number) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      // Returning an object from a constructor makes `new` produce that object.
      return Object.assign(canvas, {
        convertToBlob: ({ type = "image/png", quality }: { type?: string; quality?: number } = {}) =>
          new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))), type, quality),
          ),
      });
    }
  }
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = CanvasBackedOffscreenCanvas;
}
