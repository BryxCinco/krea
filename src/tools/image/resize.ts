/** Tool 2: Image Resizer. Exact pixels or percent, with aspect-ratio handling. */
import { extensionFor, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { decodeImage, encodeCanvas, flattenOnto, sameFormat, scaleToCanvas } from "@/lib/image-utils";
import { KreaError, type Tool } from "../types";

export const resize: Tool = {
  id: 2,
  slug: "image-resizer",
  name: "Image Resizer",
  verb: "Resize",
  category: "image",
  description: "Resize images to exact pixels or a percentage, with presets for ID photos and screens.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "Image Resizer: exact pixels, percent and ID photo presets",
  seoDescription:
    "Resize JPG, PNG and WebP images to exact dimensions in your browser. Lock the aspect ratio, batch resize, download as ZIP. No upload.",
  howTo: [
    "Drop your images on the Stage.",
    "Type the width and height, pick a percentage, or tap a preset.",
    "Choose how the aspect ratio is handled, then resize and download.",
  ],
  faqs: [
    { q: "Is my file uploaded anywhere?", a: "No. The file is opened and processed inside your browser tab. Krea has no server to receive it, and it is cleared when you press Wipe session or close the tab." },
    { q: "What size in pixels is a 2x2 photo?", a: "At 300 DPI, which most print shops use, 2 x 2 inches is 600 x 600 pixels and 1 x 1 inch is 300 x 300 pixels. Both are presets." },
    { q: "What is the difference between fit inside and fill and crop?", a: "Fit inside keeps the whole picture and makes it as large as possible within the size you typed, so one side may be smaller. Fill and crop gives exactly the size you typed and trims the edges that do not fit." },
    { q: "Can I resize many photos at once?", a: "Yes. Drop several images and the same settings apply to all of them. The results download as one ZIP file." },
  ],
  icon: "resize",
  worker: "image",
  input: "each",
  fields: [
    {
      key: "mode",
      label: "Resize by",
      type: "select",
      default: "pixels",
      options: [
        { value: "pixels", label: "Exact pixels" },
        { value: "percent", label: "Percent" },
      ],
    },
    { key: "width", label: "Width", type: "number", min: 1, max: 12000, step: 1, unit: "px", default: 1200, showIf: (v) => v.mode === "pixels" },
    { key: "height", label: "Height", type: "number", min: 1, max: 12000, step: 1, unit: "px", default: 1200, showIf: (v) => v.mode === "pixels" },
    {
      key: "fit",
      label: "Aspect ratio",
      type: "select",
      default: "contain",
      showIf: (v) => v.mode === "pixels",
      options: [
        { value: "contain", label: "Locked: fit inside" },
        { value: "cover", label: "Locked: fill and crop" },
        { value: "stretch", label: "Unlocked: stretch" },
      ],
      hint: "Locked keeps proportions. Fit inside never crops; fill and crop gives the exact size.",
    },
    { key: "percent", label: "Scale", type: "slider", min: 5, max: 200, step: 5, unit: "%", default: 50, showIf: (v) => v.mode === "percent" },
  ],
  presets: [
    { id: "2x2", label: "2x2 in", hint: "600 x 600 px at 300 DPI", values: { mode: "pixels", width: 600, height: 600, fit: "cover" } },
    { id: "1x1", label: "1x1 in", hint: "300 x 300 px at 300 DPI", values: { mode: "pixels", width: 300, height: 300, fit: "cover" } },
    { id: "passport", label: "Passport 35x45 mm", hint: "413 x 531 px at 300 DPI", values: { mode: "pixels", width: 413, height: 531, fit: "cover" } },
    { id: "hd", label: "Full HD", hint: "Fits inside 1920 x 1080", values: { mode: "pixels", width: 1920, height: 1080, fit: "contain" } },
    { id: "half", label: "Half size", values: { mode: "percent", percent: 50 } },
  ],

  async run([file], options) {
    const bitmap = await decodeImage(file);
    let width: number;
    let height: number;
    let crop: { x: number; y: number; w: number; h: number } | undefined;

    if (options.mode === "percent") {
      const factor = Number(options.percent) / 100;
      width = bitmap.width * factor;
      height = bitmap.height * factor;
    } else {
      const boxW = Number(options.width);
      const boxH = Number(options.height);
      if (!(boxW >= 1) || !(boxH >= 1)) throw new KreaError("failed", "Width and height must be at least 1 px.");
      if (options.fit === "contain") {
        const factor = Math.min(boxW / bitmap.width, boxH / bitmap.height);
        width = bitmap.width * factor;
        height = bitmap.height * factor;
      } else if (options.fit === "cover") {
        width = boxW;
        height = boxH;
        // Centre-crop the source to the target ratio.
        const targetRatio = boxW / boxH;
        const cropW = Math.min(bitmap.width, bitmap.height * targetRatio);
        const cropH = cropW / targetRatio;
        crop = { x: (bitmap.width - cropW) / 2, y: (bitmap.height - cropH) / 2, w: cropW, h: cropH };
      } else {
        width = boxW;
        height = boxH;
      }
    }

    const mime = sameFormat(file.type);
    const { canvas } = scaleToCanvas(bitmap, width, height, crop);
    bitmap.close();
    const blob = await encodeCanvas(mime === "image/jpeg" ? flattenOnto(canvas, "#ffffff") : canvas, mime, 0.92);
    return {
      files: [{ name: renameFile(file.name, extensionFor(mime), `-${canvas.width}x${canvas.height}`), type: mime, blob }],
    };
  },
};
