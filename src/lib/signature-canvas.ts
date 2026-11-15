/** Canvas helpers shared by the signature pad (Sign PDF) and the Signature Maker. Main thread only. */

/** Crop a canvas to the pixels that were actually drawn on. Returns null when nothing was drawn. */
export function trimmedCanvas(canvas: HTMLCanvasElement, pad = 8): HTMLCanvasElement | null {
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")!.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Same crop as a transparent PNG data URL ("" if empty). */
export function trimmedDataUrl(canvas: HTMLCanvasElement, pad = 8): string {
  return trimmedCanvas(canvas, pad)?.toDataURL("image/png") ?? "";
}
