/**
 * Tool 38: Video Crop & Rotate. Draw a crop box (free or 9:16, 1:1, 4:5, 16:9), rotate in 90-degree
 * steps and flip. Mediabunny applies rotate, then horizontal flip, then crop, so the crop box is drawn
 * on the rotated and flipped picture. Engine: src/lib/video.ts (cropVideo). UI: crop-video-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const videoCrop = editorTool(
  {
    id: 38,
    slug: "video-crop-rotate",
    name: "Video Crop & Rotate",
    verb: "Crop video",
    description: "Crop a video to 9:16, 1:1, 4:5 or 16:9, rotate it and flip it.",
    seoTitle: "Crop and rotate a video for Reels, TikTok and Stories, in your browser",
    seoDescription:
      "Crop MP4, MOV and WebM videos to 9:16, 1:1, 4:5, 16:9 or any shape, rotate sideways phone videos and flip them. Works with touch on phones. Nothing is uploaded.",
    howTo: [
      "Open a video. Rotate or flip it first if it is sideways or mirrored.",
      "Pick a shape (9:16, 1:1, 4:5, 16:9 or Free) and drag the box over the part to keep.",
      "Crop and download. The sound is kept.",
    ],
    faqs: [
      { q: "Why is the size a little different from what I drew?", a: "Video encoders need even widths and heights, so Krea rounds the crop to even numbers of pixels and shows the final size." },
      { q: "Which shape should I use?", a: "9:16 for TikTok, Reels, Shorts and Stories, 1:1 or 4:5 for feed posts, and 16:9 for YouTube and most screens." },
      { q: "Does it lower the quality?", a: "Cropping and rotating need a re-encode, which Krea does at high quality. The audio is copied as it is when possible." },
      { q: "Is my video uploaded?", a: "No. Everything happens inside your browser, and nothing leaves your device." },
    ],
    icon: "vcrop",
  },
  "video",
);

export type Rotation = 0 | 90 | 180 | 270;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ASPECTS = [
  { id: "free", label: "Free", ratio: 0 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
] as const;
export type AspectId = (typeof ASPECTS)[number]["id"];

/** Size of the picture after rotating. */
export function rotatedSize(width: number, height: number, rotation: Rotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/**
 * What to ask Mediabunny for. A vertical flip is a 180-degree turn plus a horizontal flip,
 * applied in Mediabunny's order (rotate, then flip).
 */
export function transformFor(rotation: Rotation, flipH: boolean, flipV: boolean): { rotate: Rotation; flip: boolean } {
  return { rotate: ((rotation + (flipV ? 180 : 0)) % 360) as Rotation, flip: flipH !== flipV };
}

/** Largest box of `ratio` (width / height) centred in a frame; the whole frame for Free. */
export function fitAspect(frameW: number, frameH: number, ratio: number): Rect {
  if (!ratio) return { x: 0, y: 0, w: frameW, h: frameH };
  let w = frameW;
  let h = w / ratio;
  if (h > frameH) {
    h = frameH;
    w = h * ratio;
  }
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

/** Whole pixels inside the frame, with even width and height (at least 16 px). */
export function evenRect(rect: Rect, frameW: number, frameH: number): Rect {
  const w = Math.max(16, Math.floor(Math.min(rect.w, frameW) / 2) * 2);
  const h = Math.max(16, Math.floor(Math.min(rect.h, frameH) / 2) * 2);
  const x = Math.max(0, Math.min(Math.round(rect.x), frameW - w));
  const y = Math.max(0, Math.min(Math.round(rect.y), frameH - h));
  return { x, y, w, h };
}

/** Keep a box inside the frame, at least `min` pixels, and (if `ratio`) at that shape, anchored at `anchor`. */
export function clampBox(rect: Rect, frameW: number, frameH: number, ratio: number, min = 32): Rect {
  let { x, y, w, h } = rect;
  w = Math.max(min, Math.min(w, frameW));
  h = Math.max(min, Math.min(h, frameH));
  if (ratio) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
  }
  x = Math.max(0, Math.min(x, frameW - w));
  y = Math.max(0, Math.min(y, frameH - h));
  return { x, y, w, h };
}
