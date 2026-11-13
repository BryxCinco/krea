/** Tool 6: ID Photo Maker. Standard sizes at 300 DPI, background swap, print sheet layout. */
import { cutOutSubject } from "@/lib/bg-removal";
import { setJpegDpi } from "@/lib/dpi";
import { IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas, scaleToCanvas } from "@/lib/image-utils";
import type { Tool } from "../types";

const DPI = 300;

/** Photo sizes in pixels at 300 DPI. */
const SIZES: Record<string, { w: number; h: number; label: string }> = {
  "2x2": { w: 600, h: 600, label: "2x2" },
  "1x1": { w: 300, h: 300, label: "1x1" },
  passport: { w: 413, h: 531, label: "passport" }, // 35 x 45 mm
};

/** Print sheets in pixels at 300 DPI. */
const SHEETS: Record<string, { w: number; h: number }> = {
  "4r": { w: 1200, h: 1800 }, // 4 x 6 in
  a4: { w: 2480, h: 3508 },
};

const BACKGROUNDS: Record<string, string> = { white: "#ffffff", blue: "#2a5caa" };

export const idPhoto: Tool = {
  id: 6,
  slug: "id-photo-maker",
  name: "ID Photo Maker",
  verb: "Make ID Photo",
  category: "image",
  description: "Make 2x2, 1x1 and passport-size photos at 300 DPI with a white or blue background and a print-ready sheet.",
  accepts: IMAGE_MIMES,
  seoTitle: "ID Photo Maker: 2x2, 1x1 and passport size, print ready",
  seoDescription:
    "Create 2x2, 1x1 and passport ID photos at 300 DPI in your browser. White or blue background, 4R and A4 print sheets. Your photo never leaves your device.",
  howTo: [
    "Drop a front-facing photo with your head and shoulders visible.",
    "Pick the size and background. Use Zoom and Vertical position to frame your face.",
    "Download a single photo, or a 4R or A4 sheet you can print and cut.",
  ],
  icon: "id",
  worker: "image",
  input: "each",
  fields: [
    {
      key: "size",
      label: "Photo size",
      type: "select",
      default: "2x2",
      options: [
        { value: "2x2", label: "2x2 in (600 x 600 px)" },
        { value: "1x1", label: "1x1 in (300 x 300 px)" },
        { value: "passport", label: "Passport 35 x 45 mm" },
      ],
    },
    {
      key: "background",
      label: "Background",
      type: "select",
      default: "white",
      hint: "White and blue replace the background with the on-device AI model (one-time download).",
      options: [
        { value: "white", label: "White" },
        { value: "blue", label: "Blue" },
        { value: "keep", label: "Keep original" },
      ],
    },
    { key: "zoom", label: "Zoom", type: "slider", min: 100, max: 250, step: 5, unit: "%", default: 100 },
    {
      key: "offsetY",
      label: "Vertical position",
      type: "slider",
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      default: 30,
      hint: "0 keeps the top of the photo, 100 the bottom.",
    },
    {
      key: "layout",
      label: "Output",
      type: "select",
      default: "single",
      options: [
        { value: "single", label: "Single photo" },
        { value: "4r", label: "4R print sheet (4 x 6 in)" },
        { value: "a4", label: "A4 print sheet" },
      ],
    },
  ],
  presets: [
    { id: "2x2-white", label: "2x2 white", hint: "The usual requirement for applications and IDs", values: { size: "2x2", background: "white", layout: "single" } },
    { id: "1x1-white", label: "1x1 white", values: { size: "1x1", background: "white", layout: "single" } },
    { id: "passport-white", label: "Passport size", hint: "35 x 45 mm, white background", values: { size: "passport", background: "white", layout: "single" } },
    { id: "2x2-sheet", label: "2x2 sheet for printing", hint: "Six copies on a 4R sheet", values: { size: "2x2", background: "white", layout: "4r" } },
  ],

  async run([file], options, ctx) {
    const size = SIZES[String(options.size)];
    const original = await decodeImage(file);

    let subject: ImageBitmap = original;
    const background = String(options.background);
    if (background !== "keep") {
      // Segment a reduced copy: far faster, and still above the output resolution.
      const maxSide = 1600;
      const factor = Math.min(1, maxSide / Math.max(original.width, original.height));
      const { canvas: reduced } = scaleToCanvas(original, original.width * factor, original.height * factor);
      const cutout = await cutOutSubject(await encodeCanvas(reduced, "image/png"), "isnet_quint8", ctx);
      subject = await createImageBitmap(cutout);
      original.close();
    }
    ctx.progress(0.95, "Framing");

    // Cover-crop the subject to the photo ratio, with zoom and vertical placement.
    const ratio = size.w / size.h;
    const zoom = Number(options.zoom) / 100;
    const cropW = Math.min(subject.width, subject.height * ratio) / zoom;
    const cropH = cropW / ratio;
    const crop = {
      x: (subject.width - cropW) / 2,
      y: (subject.height - cropH) * (Number(options.offsetY) / 100),
      w: cropW,
      h: cropH,
    };

    const photo = createCanvas(size.w, size.h);
    photo.ctx.fillStyle = BACKGROUNDS[background] ?? "#ffffff";
    photo.ctx.fillRect(0, 0, size.w, size.h);
    photo.ctx.drawImage(scaleToCanvas(subject, size.w, size.h, crop).canvas, 0, 0);
    subject.close();

    let output = photo.canvas;
    let suffix = `-${size.label}`;
    let note: string | undefined;

    const sheet = SHEETS[String(options.layout)];
    if (sheet) {
      // Tile as many copies as fit, with hairline cut guides. Prefer generous
      // spacing, but tighten it when that fits more photos (six 2x2s fill a 4R
      // sheet edge to edge, which is how photo shops lay them out).
      const count = (margin: number, gap: number) =>
        Math.floor((sheet.w - margin * 2 + gap) / (size.w + gap)) * Math.floor((sheet.h - margin * 2 + gap) / (size.h + gap));
      const spacings: [number, number][] = [[75, 36], [30, 12], [0, 0]];
      const [margin, gap] = spacings.reduce((best, option) => (count(...option) > count(...best) ? option : best));
      const columns = Math.floor((sheet.w - margin * 2 + gap) / (size.w + gap));
      const rows = Math.floor((sheet.h - margin * 2 + gap) / (size.h + gap));
      const startX = (sheet.w - (columns * size.w + (columns - 1) * gap)) / 2;
      const startY = (sheet.h - (rows * size.h + (rows - 1) * gap)) / 2;

      const page = createCanvas(sheet.w, sheet.h);
      page.ctx.fillStyle = "#ffffff";
      page.ctx.fillRect(0, 0, sheet.w, sheet.h);
      page.ctx.strokeStyle = "#b5b5b5";
      page.ctx.lineWidth = 1;
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = Math.round(startX + column * (size.w + gap));
          const y = Math.round(startY + row * (size.h + gap));
          page.ctx.drawImage(photo.canvas, x, y);
          page.ctx.strokeRect(x - 0.5, y - 0.5, size.w + 1, size.h + 1);
        }
      }
      output = page.canvas;
      suffix += `-sheet-${options.layout}`;
      note = `${columns * rows} copies on the sheet. I-print at 100% scale (walang "fit to page") para tama ang sukat.`;
    }

    const blob = await setJpegDpi(await encodeCanvas(output, "image/jpeg", 0.95), DPI);
    return { files: [{ name: renameFile(file.name, "jpg", suffix), type: "image/jpeg", blob }], note };
  },
};
