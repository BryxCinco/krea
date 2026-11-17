/**
 * Tool 39: Video Watermark. Put text or a logo on every frame: one of 9 spots or dragged anywhere,
 * size, opacity, margin, or tiled across the picture. `drawWatermark` renders the overlay for both
 * the live preview and the export, so what you see is what you get.
 * Engine: src/lib/video.ts (watermarkVideo). UI: watermark-video-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const videoWatermark = editorTool(
  {
    id: 39,
    slug: "video-watermark",
    name: "Video Watermark",
    verb: "Add watermark",
    description: "Put your name, handle or logo on a video, in a corner or tiled across it.",
    seoTitle: "Add a text or logo watermark to a video, in your browser",
    seoDescription:
      "Add your name, page handle or logo to MP4, MOV and WebM videos: 9 positions or drag, size, opacity, margin, or tiled. Live preview. Nothing is uploaded.",
    howTo: [
      "Open a video.",
      "Type your text or choose a logo image, then pick a spot (or drag it on the preview), size and opacity. Turn on Tile to repeat it across the video.",
      "Add the watermark and download. The sound is kept.",
    ],
    faqs: [
      { q: "Does a watermark protect my video?", a: "Only a little. A visible watermark shows where a video came from, but anyone can crop, blur or cover it. It is not a security feature. Use it on your own content, never to claim someone else's." },
      { q: "Can I use my logo?", a: "Yes. Choose a PNG (transparent background works best), JPG or WebP image. Krea keeps its shape and lets you set the size and opacity." },
      { q: "What does Tile do?", a: "It repeats the watermark diagonally across the whole video, which is harder to crop out than a single corner mark." },
      { q: "Is my video uploaded?", a: "No. The watermark is added inside your browser. Neither the video nor the logo leaves your device." },
    ],
    icon: "vwatermark",
  },
  "video",
);

export const SPOTS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
export type Spot = (typeof SPOTS)[number];
export const SPOT_LABEL: Record<Spot, string> = { tl: "Top left", tc: "Top center", tr: "Top right", ml: "Middle left", mc: "Center", mr: "Middle right", bl: "Bottom left", bc: "Bottom center", br: "Bottom right" };

export interface WatermarkSettings {
  kind: "text" | "logo";
  text: string;
  color: string;
  /** Text height, or logo width, as a percentage of the picture (height for text, width for logo). */
  size: number;
  /** 0-100. */
  opacity: number;
  /** Margin from the edges, percentage of the shorter side. */
  margin: number;
  spot: Spot | "custom";
  /** Centre of the mark when `spot` is "custom", normalised 0..1. */
  x: number;
  y: number;
  tile: boolean;
  shadow: boolean;
  /** CSS font family for text (the page passes its own, since next/font renames families). */
  family?: string;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Logo = CanvasImageSource & { width: number; height: number };

/** Size of the mark in pixels on a `w` x `h` picture. */
export function markSize(ctx: Ctx, s: WatermarkSettings, w: number, h: number, logo: Logo | null): { mw: number; mh: number; font: string } {
  if (s.kind === "logo" && logo) {
    const mw = Math.max(4, (w * s.size) / 100);
    return { mw, mh: (mw * logo.height) / logo.width, font: "" };
  }
  const px = Math.max(6, Math.round((h * s.size) / 100));
  const font = `600 ${px}px ${s.family || "system-ui, sans-serif"}`;
  ctx.font = font;
  return { mw: ctx.measureText(s.text || " ").width, mh: px, font };
}

/** Top-left of the mark for a spot (or the custom centre), inside the margin. */
export function markOrigin(s: WatermarkSettings, w: number, h: number, mw: number, mh: number): { x: number; y: number } {
  const m = (Math.min(w, h) * s.margin) / 100;
  if (s.spot === "custom") return { x: Math.max(0, Math.min(w - mw, s.x * w - mw / 2)), y: Math.max(0, Math.min(h - mh, s.y * h - mh / 2)) };
  const col = s.spot[1] === "l" ? 0 : s.spot[1] === "c" ? 1 : 2;
  const row = s.spot[0] === "t" ? 0 : s.spot[0] === "m" ? 1 : 2;
  return { x: [m, (w - mw) / 2, w - mw - m][col], y: [m, (h - mh) / 2, h - mh - m][row] };
}

function stamp(ctx: Ctx, s: WatermarkSettings, x: number, y: number, mw: number, mh: number, font: string, logo: Logo | null) {
  if (s.kind === "logo" && logo) {
    ctx.drawImage(logo, x, y, mw, mh);
    return;
  }
  ctx.font = font;
  ctx.textBaseline = "top";
  if (s.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = Math.max(2, mh * 0.12);
    ctx.shadowOffsetY = Math.max(1, mh * 0.05);
  }
  ctx.fillStyle = s.color;
  // Text sits a little low with textBaseline top; nudge it so the box matches the glyphs.
  ctx.fillText(s.text, x, y - mh * 0.08);
}

/** Draw the watermark over a picture already on `ctx` (w x h). */
export function drawWatermark(ctx: Ctx, w: number, h: number, s: WatermarkSettings, logo: Logo | null): void {
  if (s.kind === "text" ? !s.text.trim() : !logo) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity / 100));
  const { mw, mh, font } = markSize(ctx, s, w, h, logo);
  if (s.tile) {
    // Diagonal grid covering the whole picture, rotated -30 degrees around the centre.
    const gapX = mw * 1.6 + w * 0.04;
    const gapY = mh * 3 + h * 0.04;
    const reach = Math.hypot(w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-30 * Math.PI) / 180);
    let row = 0;
    for (let y = -reach; y < reach; y += gapY, row++) {
      for (let x = -reach + (row % 2) * (gapX / 2); x < reach; x += gapX) stamp(ctx, s, x, y, mw, mh, font, logo);
    }
  } else {
    const { x, y } = markOrigin(s, w, h, mw, mh);
    stamp(ctx, s, x, y, mw, mh, font, logo);
  }
  ctx.restore();
}
