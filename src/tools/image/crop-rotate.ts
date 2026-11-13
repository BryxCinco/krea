/** Tool 3: Crop & Rotate. Free or ratio-locked crop, 90 degree rotation, flips. */
import { extensionFor, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas, sameFormat } from "@/lib/image-utils";
import type { Tool } from "../types";

export const cropRotate: Tool = {
  id: 3,
  slug: "crop-rotate",
  name: "Crop & Rotate",
  verb: "Crop",
  category: "image",
  description: "Crop freely or to standard ratios, then rotate and flip.",
  accepts: IMAGE_MIMES,
  seoTitle: "Crop and Rotate Images: 1:1, 4:3, 16:9 and 2x2 ratios",
  seoDescription:
    "Crop, rotate and flip photos in your browser. Free crop or locked ratios including 1:1, 4:3, 16:9 and 2x2 ID. No upload needed.",
  howTo: [
    "Drop an image on the Stage.",
    "Drag the crop box or its corners. Pick a ratio to lock the shape.",
    "Rotate or flip if needed, then apply and download.",
  ],
  icon: "crop",
  worker: "image",
  input: "each",
  fields: [
    {
      key: "aspect",
      label: "Crop ratio",
      type: "select",
      default: "free",
      options: [
        { value: "free", label: "Free" },
        { value: "1:1", label: "1:1 Square" },
        { value: "4:3", label: "4:3" },
        { value: "3:4", label: "3:4 Portrait" },
        { value: "16:9", label: "16:9" },
        { value: "2:2", label: "2x2 ID" },
      ],
    },
    {
      key: "crop",
      label: "Crop area",
      type: "crop",
      aspectKey: "aspect",
      hint: "Drag on the preview. Arrow keys nudge the box. With several files the same area applies to each.",
    },
    {
      key: "rotate",
      label: "Rotate",
      type: "select",
      default: "0",
      options: [
        { value: "0", label: "None" },
        { value: "90", label: "90° right" },
        { value: "180", label: "180°" },
        { value: "270", label: "90° left" },
      ],
    },
    { key: "flipH", label: "Flip horizontal", type: "toggle", default: false },
    { key: "flipV", label: "Flip vertical", type: "toggle", default: false },
  ],

  async run([file], options) {
    const bitmap = await decodeImage(file);

    // Crop rectangle in source pixels (the box is stored normalized 0..1).
    const sx = Math.round(Number(options.cropX) * bitmap.width);
    const sy = Math.round(Number(options.cropY) * bitmap.height);
    const sw = Math.max(1, Math.round(Number(options.cropW) * bitmap.width));
    const sh = Math.max(1, Math.round(Number(options.cropH) * bitmap.height));

    const quarterTurns = Number(options.rotate) / 90;
    const swapped = quarterTurns % 2 === 1;
    const { canvas, ctx } = createCanvas(swapped ? sh : sw, swapped ? sw : sh);

    // Transform around the centre: rotate first, then mirror in the image's own axes.
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((quarterTurns * Math.PI) / 2);
    ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);
    ctx.drawImage(bitmap, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    bitmap.close();

    const mime = sameFormat(file.type);
    const blob = await encodeCanvas(canvas, mime, 0.92);
    return { files: [{ name: renameFile(file.name, extensionFor(mime), "-cropped"), type: mime, blob }] };
  },
};
