/** Tool 7: Watermark Tool. Text or logo, with position, opacity, rotation and tile mode. */
import { extensionFor, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, dataUrlToBlob, decodeImage, encodeCanvas, sameFormat } from "@/lib/image-utils";
import { KreaError, type Tool } from "../types";

const FONTS: Record<string, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, Consolas, 'Courier New', monospace",
};

/** Anchor points as fractions of the image: [x, y]. */
const POSITIONS: Record<string, [number, number]> = {
  "top-left": [0, 0],
  top: [0.5, 0],
  "top-right": [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  "bottom-left": [0, 1],
  bottom: [0.5, 1],
  "bottom-right": [1, 1],
};

export const watermark: Tool = {
  id: 7,
  slug: "watermark",
  name: "Watermark Tool",
  verb: "Watermark",
  category: "image",
  description: "Stamp text or your logo on photos. Set position, opacity and rotation, or tile it across the image.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "Watermark Images: add text or a logo, offline",
  seoDescription:
    "Add a text or logo watermark to photos in your browser. Control position, opacity, rotation and tiling. Batch watermark and download a ZIP. No upload.",
  howTo: [
    "Drop one or more images on the Stage.",
    "Type your text or pick a logo, then set the size, position and opacity. The preview updates as you go.",
    "Apply and download. Several images come out as one ZIP.",
  ],
  faqs: [
    { q: "Is my file uploaded anywhere?", a: "No. The file is opened and processed inside your browser tab. Krea has no server to receive it, and it is cleared when you press Wipe session or close the tab." },
    { q: "Can I use my logo as the watermark?", a: "Yes. Choose Logo and pick an image from your device. A PNG with a transparent background looks best." },
    { q: "How do I stop people from cropping out the watermark?", a: "Turn on Tile across the image. The mark repeats over the whole picture, which makes it much harder to remove." },
    { q: "Can I watermark many photos at once?", a: "Yes. Drop several images; the same watermark is applied to each and you get one ZIP file." },
  ],
  icon: "watermark",
  worker: "image",
  input: "each",
  live: true,
  fields: [
    {
      key: "kind",
      label: "Watermark",
      type: "select",
      default: "text",
      options: [
        { value: "text", label: "Text" },
        { value: "logo", label: "Logo" },
      ],
    },
    { key: "text", label: "Text", type: "text", placeholder: "Your name or brand", default: "Krea", showIf: (v) => v.kind === "text" },
    {
      key: "font",
      label: "Font",
      type: "select",
      default: "sans",
      showIf: (v) => v.kind === "text",
      options: [
        { value: "sans", label: "Sans" },
        { value: "serif", label: "Serif" },
        { value: "mono", label: "Mono" },
      ],
    },
    { key: "color", label: "Text colour", type: "color", default: "#ffffff", showIf: (v) => v.kind === "text" },
    { key: "logo", label: "Logo image", type: "image", hint: "PNG with a transparent background works best.", showIf: (v) => v.kind === "logo" },
    { key: "size", label: "Size", type: "slider", min: 5, max: 100, step: 1, unit: "%", default: 30, hint: "Width of the watermark, as a share of the image width." },
    { key: "opacity", label: "Opacity", type: "slider", min: 5, max: 100, step: 5, unit: "%", default: 60 },
    { key: "rotation", label: "Rotation", type: "slider", min: -90, max: 90, step: 5, unit: "°", default: 0 },
    { key: "tile", label: "Tile across the image", type: "toggle", default: false },
    {
      key: "position",
      label: "Position",
      type: "select",
      default: "bottom-right",
      showIf: (v) => !v.tile,
      options: [
        { value: "top-left", label: "Top left" },
        { value: "top", label: "Top" },
        { value: "top-right", label: "Top right" },
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
        { value: "bottom-left", label: "Bottom left" },
        { value: "bottom", label: "Bottom" },
        { value: "bottom-right", label: "Bottom right" },
      ],
    },
  ],

  async run([file], options) {
    const bitmap = await decodeImage(file);
    const { canvas, ctx } = createCanvas(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Build the mark once on its own canvas, at its final size.
    const markWidth = Math.max(8, (canvas.width * Number(options.size)) / 100);
    let mark: OffscreenCanvas;
    if (options.kind === "logo") {
      if (!options.logo) throw new KreaError("failed", "Pumili muna ng logo image for the watermark.");
      let logo: ImageBitmap;
      try {
        logo = await createImageBitmap(await dataUrlToBlob(String(options.logo)));
      } catch {
        throw new KreaError("corrupted", "The logo image could not be read. Try a PNG or JPG.");
      }
      const made = createCanvas(markWidth, (markWidth * logo.height) / logo.width);
      made.ctx.drawImage(logo, 0, 0, made.canvas.width, made.canvas.height);
      logo.close();
      mark = made.canvas;
    } else {
      const text = String(options.text).trim();
      if (!text) throw new KreaError("failed", "I-type muna ang watermark text.");
      const family = FONTS[String(options.font)] ?? FONTS.sans;
      // Measure at a reference size, then scale the font so the text spans markWidth.
      ctx.font = `600 100px ${family}`;
      const fontSize = Math.max(6, (100 * markWidth) / Math.max(1, ctx.measureText(text).width));
      const made = createCanvas(markWidth, fontSize * 1.3);
      made.ctx.font = `600 ${fontSize}px ${family}`;
      made.ctx.textBaseline = "middle";
      made.ctx.textAlign = "center";
      // A soft shadow keeps the text legible on both light and dark photos.
      made.ctx.shadowColor = "rgb(0 0 0 / 0.45)";
      made.ctx.shadowBlur = fontSize * 0.08;
      made.ctx.fillStyle = String(options.color);
      made.ctx.fillText(text, made.canvas.width / 2, made.canvas.height / 2, made.canvas.width);
      mark = made.canvas;
    }

    const angle = (Number(options.rotation) * Math.PI) / 180;
    ctx.globalAlpha = Number(options.opacity) / 100;

    if (options.tile) {
      // Rotate the whole grid around the centre and cover the image diagonal so no corner is left bare.
      const reach = Math.hypot(canvas.width, canvas.height) / 2;
      const stepX = mark.width * 1.5;
      const stepY = mark.height * 2.6;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle);
      for (let y = -reach, row = 0; y < reach; y += stepY, row++) {
        for (let x = -reach - (row % 2) * (stepX / 2); x < reach; x += stepX) ctx.drawImage(mark, x, y);
      }
    } else {
      const [ax, ay] = POSITIONS[String(options.position)] ?? POSITIONS["bottom-right"];
      const margin = canvas.width * 0.03;
      const cx = margin + mark.width / 2 + ax * (canvas.width - mark.width - margin * 2);
      const cy = margin + mark.height / 2 + ay * (canvas.height - mark.height - margin * 2);
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.drawImage(mark, -mark.width / 2, -mark.height / 2);
    }

    const mime = sameFormat(file.type);
    const blob = await encodeCanvas(canvas, mime, 0.92);
    return { files: [{ name: renameFile(file.name, extensionFor(mime), "-watermarked"), type: mime, blob }] };
  },
};
