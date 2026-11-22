/**
 * Tool 62: Image to SVG. Traces a PNG, JPG or WebP (best: logos, icons, drawings
 * and signatures) into vector paths: colour layers, or black and white. The tracer
 * is src/lib/trace.ts. The image is traced at a reduced size for speed and the SVG
 * keeps the original dimensions.
 */
import { IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage } from "@/lib/image-utils";
import { KreaError, type Tool } from "../types";

const DETAIL = {
  low: { side: 500, tolerance: 1.4 },
  medium: { side: 900, tolerance: 0.9 },
  high: { side: 1400, tolerance: 0.55 },
} as const;
/** Past this the SVG is too heavy to be useful (and to open in design apps). */
const MAX_SVG_BYTES = 25 * 1024 * 1024;

export const imageToSvg: Tool = {
  id: 62,
  slug: "image-to-svg",
  name: "Image to SVG",
  verb: "Trace to SVG",
  category: "image",
  description: "Turn a PNG or JPG logo, icon, drawing or signature into a scalable SVG by tracing its shapes and colours.",
  accepts: IMAGE_MIMES,
  output: "data",
  seoTitle: "PNG to SVG: trace logos and drawings into vector SVG, offline",
  seoDescription:
    "Convert PNG, JPG or WebP images to real vector SVG in your browser. Traces logos, icons, line art and signatures into colour or black and white paths you can scale and edit. No upload.",
  howTo: [
    "Drop a logo, icon, drawing or signature on the Stage.",
    "Choose colour (and how many colours) or black and white, the level of detail and smooth curves.",
    "Trace and download the SVG. Open it in Figma, Illustrator, Inkscape or Canva.",
  ],
  faqs: [
    {
      q: "Is this a real vector SVG?",
      a: "Yes. Krea traces the shapes into paths, so the SVG stays sharp at any size and can be edited in design apps. It does not just wrap the picture inside an SVG file.",
    },
    { q: "What images work best?", a: "Logos, icons, flat illustrations, line art and signatures with clear edges and few colours. Photos trace into many small shapes and make large files; keep them as JPG." },
    { q: "How many colours should I pick?", a: "As many as the logo really has, plus one for the background. Two to six suits most logos. Black and white is best for signatures, stamps and line drawings." },
    { q: "Can I remove the white background?", a: "Yes. Turn on Remove background in colour mode and the colour around the edges is left out, so the SVG is transparent. Black and white mode keeps only the dark shapes." },
    { q: "Is my image uploaded?", a: "No. The tracing runs inside your browser, so your logo or signature never leaves your device." },
  ],
  icon: "trace",
  worker: "image",
  input: "each",
  fields: [
    {
      key: "mode",
      label: "Trace as",
      type: "select",
      default: "color",
      options: [
        { value: "color", label: "Colour" },
        { value: "bw", label: "Black and white" },
      ],
    },
    {
      key: "colors",
      label: "Colours",
      type: "select",
      default: "6",
      options: ["2", "3", "4", "6", "8", "12", "16"].map((value) => ({ value, label: value })),
      hint: "Count the background too.",
      showIf: (values) => values.mode === "color",
    },
    {
      key: "detail",
      label: "Detail",
      type: "select",
      default: "medium",
      options: [
        { value: "low", label: "Low (smaller file)" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High (follows small details)" },
      ],
    },
    { key: "smooth", label: "Smooth curves", type: "toggle", default: true, hint: "Off keeps sharp corners, for pixel art and blocky logos." },
    { key: "removeBackground", label: "Remove background", type: "toggle", default: false, showIf: (values) => values.mode === "color" },
  ],

  async run([file], options, ctx) {
    ctx.progress(0.05, "Reading image");
    const bitmap = await decodeImage(file);
    const detail = DETAIL[String(options.detail) as keyof typeof DETAIL] ?? DETAIL.medium;
    const scale = Math.min(1, detail.side / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const { canvas, ctx: draw } = createCanvas(width, height);
    draw.drawImage(bitmap, 0, 0, width, height);
    const outWidth = bitmap.width;
    const outHeight = bitmap.height;
    bitmap.close();
    const pixels = draw.getImageData(0, 0, canvas.width, canvas.height).data;

    ctx.progress(0.3, "Tracing shapes");
    const { traceToSvg } = await import("@/lib/trace");
    const result = traceToSvg(pixels, width, height, outWidth, outHeight, {
      mode: options.mode === "bw" ? "bw" : "color",
      colors: Number(options.colors) || 6,
      tolerance: detail.tolerance,
      smooth: Boolean(options.smooth),
      removeBackground: Boolean(options.removeBackground),
    });
    if (!result.paths) throw new KreaError("failed", `Walang ma-trace sa "${file.name}": the image is empty or fully transparent.`);
    const blob = new Blob([result.svg], { type: "image/svg+xml" });
    if (blob.size > MAX_SVG_BYTES) {
      throw new KreaError("too-large", `Masyadong mabigat ang SVG (${Math.round(blob.size / 1024 / 1024)} MB): this looks like a photo. Try fewer colours or Low detail, or keep it as JPG.`);
    }
    ctx.progress(0.95, "Saving");
    const colorText = options.mode === "bw" ? "black and white" : `${result.colors.length} ${result.colors.length === 1 ? "colour" : "colours"}`;
    return {
      files: [{ name: renameFile(file.name, "svg"), type: "image/svg+xml", blob }],
      note: `Traced in ${colorText}, ${outWidth} × ${outHeight}. ${Math.max(1, Math.round(blob.size / 1024))} KB SVG.${scale < 1 ? " Traced at a reduced size; use High detail for small features." : ""}`,
    };
  },
};
