/**
 * Tool 61: SVG Converter. Turns SVG files into PNG, JPG or WebP at any size.
 * The browser renders the SVG as an image (an <img>), where scripts never run and
 * nothing outside the file is loaded, then it is painted onto a canvas at the chosen
 * size. UI: components/stage/editors/svg-convert-editor.tsx. Nothing is uploaded.
 */
import { editorTool } from "../text/editor-tool";

export const svgConvert = editorTool(
  {
    id: 61,
    slug: "svg-converter",
    name: "SVG Converter",
    verb: "Convert SVG",
    description: "Convert SVG files to PNG, JPG or WebP at any size, with a transparent or solid background.",
    seoTitle: "SVG Converter: SVG to PNG, JPG or WebP at any size, offline",
    seoDescription:
      "Convert SVG logos, icons and illustrations to PNG, JPG or WebP in your browser. Pick the exact width or 2x and 4x for sharp results, keep transparency or add a background. Batch to ZIP, no upload.",
    howTo: [
      "Open or drop one or more SVG files.",
      "Choose PNG, JPG or WebP, the size (scale or exact width) and the background.",
      "Download the image, or a ZIP when there are several.",
    ],
    faqs: [
      { q: "Why convert an SVG to PNG?", a: "Many apps, forms and social sites do not accept SVG. A PNG works everywhere, keeps transparency and, made at 2x or 4x, stays sharp on phone screens." },
      { q: "How big can the image be?", a: "Up to 8,192 pixels on the longest side. SVG is a vector format, so it stays sharp at any size you pick." },
      { q: "Is it safe to open an SVG from someone else?", a: "Yes. SVG files can contain scripts, but Krea draws them the way a browser shows a picture, where scripts never run and links to other files are not loaded. Nothing is uploaded." },
      { q: "Why does my SVG look different?", a: "Fonts that are not installed on your device are replaced, and images or styles the SVG links to on other sites are not loaded. Convert text to outlines in your design app for an exact result." },
      { q: "Can I turn a PNG into an SVG?", a: "Use Image to SVG. It traces the shapes and colours of a logo or drawing into vector paths." },
    ],
    icon: "svg",
  },
  "image",
);

export const SVG_MIME = "image/svg+xml";
/** Longest side of the output, and its area, so a phone tab does not run out of memory. */
export const MAX_SIDE = 8192;
export const MAX_PIXELS = 40_000_000;
/** Size used when an SVG has neither a width/height nor a viewBox (the browser default). */
const FALLBACK = { width: 300, height: 150 };

const UNITS: Record<string, number> = { "": 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, em: 16, rem: 16 };

/** True when the text looks like an SVG document. */
export function isSvgText(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}

/** "120", "120px", "2in", "50%" to pixels, or null for a relative or invalid length. */
export function lengthToPx(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value);
  if (!match) return null;
  const factor = UNITS[match[2].toLowerCase()];
  const px = Number(match[1]) * (factor ?? NaN);
  return Number.isFinite(px) && px > 0 ? px : null;
}

/** The root <svg> tag's attributes (a light parse that works without a DOM). */
function rootAttributes(text: string): Record<string, string> {
  const tag = /<svg\b([^>]*)>/i.exec(text)?.[1] ?? "";
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) attributes[match[1].toLowerCase()] = match[3] ?? match[4] ?? "";
  return attributes;
}

export interface SvgSize {
  width: number;
  height: number;
  /** "0 0 w h" style viewBox, when the file has one. */
  viewBox: [number, number, number, number] | null;
}

/** Intrinsic size of an SVG: width/height when absolute, else the viewBox, else 300 × 150. */
export function svgSize(text: string): SvgSize {
  const attributes = rootAttributes(text);
  const box = (attributes.viewbox ?? "").trim().split(/[\s,]+/).map(Number);
  const viewBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? (box as [number, number, number, number]) : null;
  let width = lengthToPx(attributes.width);
  let height = lengthToPx(attributes.height);
  if (viewBox) {
    // One side given: keep the viewBox's proportions.
    if (width && !height) height = (width * viewBox[3]) / viewBox[2];
    if (height && !width) width = (height * viewBox[2]) / viewBox[3];
    width ??= viewBox[2];
    height ??= viewBox[3];
  }
  return { width: width ?? FALLBACK.width, height: height ?? FALLBACK.height, viewBox };
}

/**
 * Output size in whole pixels for a scale (1, 2, 4) or an exact width, keeping the
 * proportions. Returns a problem when it would be larger than the limits.
 */
export function outputSize(size: SvgSize, mode: "scale" | "width", value: number): { width: number; height: number } | { problem: string } {
  if (!(value > 0) || !Number.isFinite(value)) return { problem: mode === "scale" ? "Pick a scale." : "Enter a width in pixels." };
  const factor = mode === "scale" ? value : value / size.width;
  const width = Math.max(1, Math.round(size.width * factor));
  const height = Math.max(1, Math.round(size.height * factor));
  if (Math.max(width, height) > MAX_SIDE || width * height > MAX_PIXELS) {
    return { problem: `${width} × ${height} px is too large. Keep the longest side at ${MAX_SIDE.toLocaleString()} px or less.` };
  }
  return { width, height };
}
