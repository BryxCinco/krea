/**
 * Tool 32: Blur & Redact. Draw boxes on a photo to black out, pixelate or blur them.
 * The UI is an editor (components/stage/editors/redact-editor.tsx) because every box is
 * placed by hand, so it is not offered as a chain step. The pixel work is below.
 */
import { editorTool } from "../text/editor-tool";

export const redact = editorTool(
  {
    id: 32,
    slug: "blur-redact",
    name: "Blur & Redact",
    verb: "Redact",
    description: "Black out, pixelate or blur ID numbers, plate numbers and faces in a photo.",
    seoTitle: "Redact a photo: black out, blur or pixelate ID numbers and faces",
    seoDescription:
      "Hide ID numbers, plate numbers, addresses and faces before you share a photo. Draw boxes to black out, pixelate or blur; the export is flattened and has no metadata. Nothing is uploaded.",
    howTo: [
      "Open or drop a photo.",
      "Drag on the photo to draw a box over what to hide, and pick Black out, Pixelate or Blur. Add as many boxes as you need.",
      "Download. The boxes are burned into the pixels and the photo's metadata is removed.",
    ],
    faqs: [
      { q: "Can someone undo the redaction?", a: "Not for Black out: those pixels are replaced with solid black in the saved file, and the original pixels are not kept anywhere in it. Blur and pixelate are different: on short text such as ID or card numbers they can sometimes be guessed or partly reversed, so use Black out for anything sensitive." },
      { q: "Is my photo uploaded?", a: "No. The photo is opened, edited and saved inside your browser. Krea has no server to receive it." },
      { q: "Does the saved photo still contain the original?", a: "No. Krea draws a new image from the edited pixels, so hidden previews, EXIF data, GPS location and camera details from the original are not carried over." },
      { q: "Can I hide a face?", a: "Yes. Draw a box over the face and choose Black out, or Pixelate with a high strength. Krea does not detect faces automatically, so you place each box yourself." },
      { q: "Does it work on a phone?", a: "Yes. Drag with your finger to draw a box, tap a box to select it, and use the buttons below the photo to change or delete it." },
    ],
    icon: "redact",
  },
  "image",
);

export type RedactMode = "black" | "pixelate" | "blur";

export interface RedactBox {
  id: number;
  /** Normalised 0..1 position and size on the image. */
  x: number;
  y: number;
  w: number;
  h: number;
  mode: RedactMode;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function scratch(width: number, height: number) {
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  return { canvas, ctx: canvas.getContext("2d") as Ctx };
}

/** Pixel rectangle for a box, rounded outwards so no partly covered pixel keeps original colour. */
export function boxRect(box: RedactBox, width: number, height: number) {
  const x = Math.max(0, Math.floor(box.x * width));
  const y = Math.max(0, Math.floor(box.y * height));
  const right = Math.min(width, Math.ceil((box.x + box.w) * width));
  const bottom = Math.min(height, Math.ceil((box.y + box.h) * height));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

/**
 * Apply every box to `ctx`, which already holds the photo. `strength` is 1..10.
 * Effects read only the photo pixels inside each box, so nothing leaks in from outside.
 */
export function applyBoxes(ctx: Ctx, boxes: RedactBox[], strength: number) {
  const { width, height } = ctx.canvas;
  // Effect size scales with the photo, so the same strength looks the same at any resolution.
  const unit = Math.max(4, Math.round((Math.min(width, height) / 100) * strength * 0.9));
  for (const box of boxes) {
    const r = boxRect(box, width, height);
    if (box.mode === "black") {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000000";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      continue;
    }
    const block = box.mode === "pixelate" ? unit : Math.max(2, Math.round(unit / 2));
    const sw = Math.max(1, Math.ceil(r.w / block));
    const sh = Math.max(1, Math.ceil(r.h / block));
    const small = scratch(sw, sh);
    small.ctx.imageSmoothingEnabled = true;
    small.ctx.imageSmoothingQuality = "high";
    small.ctx.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
    if (box.mode === "blur") {
      // A second, smaller pass makes the blur smooth instead of blocky.
      const tiny = scratch(Math.max(1, Math.ceil(sw / 2)), Math.max(1, Math.ceil(sh / 2)));
      tiny.ctx.imageSmoothingQuality = "high";
      tiny.ctx.drawImage(small.canvas, 0, 0, tiny.canvas.width, tiny.canvas.height);
      small.ctx.clearRect(0, 0, sw, sh);
      small.ctx.drawImage(tiny.canvas, 0, 0, sw, sh);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = box.mode === "blur";
    ctx.imageSmoothingQuality = "high";
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.drawImage(small.canvas, 0, 0, sw, sh, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}
