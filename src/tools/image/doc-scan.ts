/**
 * Tool 34: Document Scanner. Photograph or open pages, drag four corners onto the paper,
 * straighten it, clean it up and save a PDF or JPGs.
 * The UI is an editor (components/stage/editors/doc-scan-editor.tsx) because the corners are
 * placed by hand, so it is not a chain step. The pixel work below is plain math on RGBA
 * buffers (no DOM), so it can be tested on its own.
 */
import { editorTool } from "../text/editor-tool";

export const docScan = editorTool(
  {
    id: 34,
    slug: "document-scanner",
    name: "Document Scanner",
    verb: "Scan",
    description: "Turn phone photos of papers into straight, clean pages and save them as one PDF.",
    seoTitle: "Document Scanner: phone photo to clean PDF, in your browser",
    seoDescription:
      "Take or open photos of receipts, forms and IDs, drag the corners to straighten each page, pick Enhance, Grayscale or Black & white, and save one PDF or JPGs. Nothing is uploaded.",
    howTo: [
      "Take a photo with your phone camera or open photos you already have. Add as many pages as you need.",
      "Drag the four corners onto the corners of the paper. Krea straightens it.",
      "Pick a look (Enhance, Grayscale or Black & white), reorder the pages, then save a PDF or JPGs.",
    ],
    faqs: [
      { q: "Are my documents uploaded?", a: "No. The photos are straightened and saved inside your browser. Krea has no server to receive them, and nothing is kept after you close the tab." },
      { q: "Does it find the edges of the paper by itself?", a: "No. You place the four corners yourself, which works on any background and in poor light. Drag each corner onto a corner of the paper, or select a corner and move it with the arrow keys." },
      { q: "Which look should I use?", a: "Enhance keeps colour and makes the paper brighter, good for receipts and IDs. Black & white gives the sharpest text and the smallest file, good for printed forms. Grayscale is in between." },
      { q: "Can I scan many pages into one PDF?", a: "Yes. Add up to 50 pages, reorder them with the arrows, and save them as one PDF in A4, Letter, Legal or the shape of the scan." },
      { q: "Does the saved file keep my photo's location?", a: "No. Each page is redrawn from the straightened pixels, so EXIF data, GPS location and camera details from the original photos are not carried over." },
    ],
    icon: "scan",
  },
  "image",
);

export type ScanFilter = "color" | "enhance" | "gray" | "bw";
export type Rotation = 0 | 90 | 180 | 270;

/** A point normalised to 0..1 on the source photo. */
export interface Point {
  x: number;
  y: number;
}
/** Top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** True when the four corners (normalised) form a convex, non-crossing shape covering at least 0.25% of the photo. */
export function validQuad(quad: Quad): boolean {
  const pts = quad;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) area += pts[i].x * pts[(i + 1) % 4].y - pts[(i + 1) % 4].x * pts[i].y;
  return Math.abs(area) / 2 >= 0.0025;
}

/** Output size in pixels for a quad on a `width` x `height` photo: the longer of each pair of opposite edges, capped. */
export function outputSize(quad: Quad, width: number, height: number, maxSide: number): { width: number; height: number } {
  const px = quad.map((p) => ({ x: p.x * width, y: p.y * height })) as Quad;
  let w = Math.max(dist(px[0], px[1]), dist(px[3], px[2]));
  let h = Math.max(dist(px[0], px[3]), dist(px[1], px[2]));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  return { width: w, height: h };
}

/**
 * Coefficients that map the unit square onto the quad (Heckbert's square-to-quad):
 * x = (a s + b t + c) / (g s + h t + 1), y = (d s + e t + f) / (g s + h t + 1).
 */
export function squareToQuad(q: Quad) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g,
    h,
  };
}

/** Straighten the quad of `src` into a `width` x `height` image, with bilinear sampling. White outside the photo. */
export function warp(src: Pixels, quad: Quad, width: number, height: number): Pixels {
  const px = quad.map((p) => ({ x: p.x * src.width, y: p.y * src.height })) as Quad;
  const m = squareToQuad(px);
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  for (let y = 0; y < height; y++) {
    const t = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const den = m.g * u + m.h * t + 1;
      const fx = (m.a * u + m.b * t + m.c) / den - 0.5;
      const fy = (m.d * u + m.e * t + m.f) / den - 0.5;
      const o = (y * width + x) * 4;
      if (fx < -0.5 || fy < -0.5 || fx > sw - 0.5 || fy > sh - 0.5) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255;
        continue;
      }
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const ax = Math.max(0, Math.min(1, fx - x0));
      const ay = Math.max(0, Math.min(1, fy - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax;
        const bottom = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax;
        out[o + c] = top + (bottom - top) * ay;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height };
}

/** Rotate clockwise by 0, 90, 180 or 270 degrees. */
export function rotate(src: Pixels, rotation: Rotation): Pixels {
  if (rotation === 0) return src;
  const { width: w, height: h, data } = src;
  const ow = rotation === 180 ? w : h;
  const oh = rotation === 180 ? h : w;
  const out = new Uint8ClampedArray(ow * oh * 4);
  const s32 = new Uint32Array(data.buffer, data.byteOffset, w * h);
  const o32 = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = s32[y * w + x];
      if (rotation === 90) o32[x * ow + (h - 1 - y)] = v;
      else if (rotation === 180) o32[(h - 1 - y) * ow + (w - 1 - x)] = v;
      else o32[(w - 1 - x) * ow + y] = v;
    }
  }
  return { data: out, width: ow, height: oh };
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Dark and light points of a histogram (luminance, or one channel 0-2), ignoring the extreme `cut` fraction each side. */
function levels(data: Uint8ClampedArray, cut: number, channel?: number): [number, number] {
  const hist = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[channel === undefined ? Math.round(luma(data[i], data[i + 1], data[i + 2])) : data[i + channel]]++;
  const limit = n * cut;
  let low = 0;
  let acc = 0;
  while (low < 255 && acc + hist[low] <= limit) acc += hist[low++];
  let high = 255;
  acc = 0;
  while (high > 0 && acc + hist[high] <= limit) acc += hist[high--];
  if (high - low < 32) return [Math.max(0, low - 16), Math.min(255, high + 16)];
  return [low, high];
}

/** Apply a look in place. */
export function applyFilter(px: Pixels, filter: ScanFilter): Pixels {
  const d = px.data;
  if (filter === "color") return px;
  const curve = (low: number, high: number, gamma: number) => {
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.max(0, Math.min(1, (v - low) / (high - low))), gamma);
    return lut;
  };
  if (filter === "gray") {
    // Stretch the levels so the paper turns white and the ink dark.
    const lut = curve(...levels(d, 0.01), 1);
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lut[Math.round(luma(d[i], d[i + 1], d[i + 2]))];
    return px;
  }
  if (filter === "enhance") {
    // Each channel is stretched on its own, which also removes a yellow or blue cast from indoor light.
    const luts = [0, 1, 2].map((c) => curve(...levels(d, 0.01, c), 1.1));
    for (let i = 0; i < d.length; i += 4) {
      d[i] = luts[0][d[i]];
      d[i + 1] = luts[1][d[i + 1]];
      d[i + 2] = luts[2][d[i + 2]];
    }
    return px;
  }
  // Black & white: adaptive threshold (Bradley) against the local average, so shadows across the page do not turn black.
  const { width: w, height: h } = px;
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = luma(d[i], d[i + 1], d[i + 2]);
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += gray[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const half = Math.max(4, Math.round(Math.max(w, h) / 32));
  const sensitivity = 0.15;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = gray[y * w + x] < mean * (1 - sensitivity) ? 0 : 255;
      const o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = v;
      d[o + 3] = 255;
    }
  }
  return px;
}

/** Straighten, rotate and filter in one go. */
export function processPage(src: Pixels, quad: Quad, rotation: Rotation, filter: ScanFilter, maxSide: number): Pixels {
  const size = outputSize(quad, src.width, src.height, maxSide);
  return applyFilter(rotate(warp(src, quad, size.width, size.height), rotation), filter);
}

/** PDF page sizes in points (1/72 inch). */
export const PAGE_SIZES = {
  fit: null,
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
} as const;
export type PageSize = keyof typeof PAGE_SIZES;

/**
 * Where an image of `w` x `h` pixels goes on the PDF page: on a fixed paper size it is fitted
 * inside a small margin and centred (paper turned to landscape for wide scans); "fit" makes the
 * page the scan's own shape at 200 dpi.
 */
export function placeOnPage(w: number, h: number, size: PageSize) {
  const paper = PAGE_SIZES[size];
  if (!paper) {
    const pw = (w * 72) / 200;
    const ph = (h * 72) / 200;
    return { pageWidth: pw, pageHeight: ph, x: 0, y: 0, width: pw, height: ph };
  }
  const landscape = w > h;
  const pageWidth = landscape ? paper[1] : paper[0];
  const pageHeight = landscape ? paper[0] : paper[1];
  const margin = 18;
  const scale = Math.min((pageWidth - 2 * margin) / w, (pageHeight - 2 * margin) / h);
  const width = w * scale;
  const height = h * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}
