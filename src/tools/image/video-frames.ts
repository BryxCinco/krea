/**
 * Tool 42: Extract Frames. Save still images from a video: one every N seconds over a chosen part,
 * or at moments picked on the player. PNG or JPG, one image or a ZIP. Frames are decoded with the
 * browser's WebCodecs through Mediabunny (CanvasSink). Engine: src/lib/video.ts (extractFrames).
 * UI: components/stage/editors/frames-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const videoFrames = editorTool(
  {
    id: 42,
    slug: "extract-frames",
    name: "Extract Frames",
    verb: "Extract frames",
    description: "Save still images from a video, every few seconds or at the moments you pick, as PNG or JPG.",
    seoTitle: "Extract frames from a video as PNG or JPG, in your browser",
    seoDescription:
      "Grab still images from MP4, MOV, WebM and MKV videos: one every N seconds or at exact moments you pick. Download one PNG or JPG, or all of them in a ZIP. Nothing is uploaded.",
    howTo: [
      "Open a video.",
      "Choose Every N seconds and drag the timeline to the part you want, or pause the player and add the moments you need.",
      "Pick PNG or JPG and the size, extract, and download the image or the ZIP.",
    ],
    faqs: [
      { q: "PNG or JPG?", a: "PNG keeps every pixel exactly and is best for screenshots with text, but the files are large. JPG is much smaller and fine for photos, thumbnails and sharing." },
      { q: "Are the frames full resolution?", a: "With Original size, yes: each image has the video's own width and height. You can also cap the width at 1920, 1280 or 640 pixels for smaller files." },
      { q: "Why is there a limit on the number of frames?", a: "Every frame is kept in memory until the ZIP is made, so Krea stops at 300 frames to stay safe on phones. Use a longer interval or a shorter part for long videos." },
      { q: "Is my video uploaded?", a: "No. The frames are decoded and saved inside your browser. Nothing leaves your device." },
    ],
    icon: "frames",
  },
  "video",
);

export type FrameFormat = "png" | "jpg";
export const FRAME_FORMATS: Record<FrameFormat, { ext: string; mime: string; label: string }> = {
  png: { ext: "png", mime: "image/png", label: "PNG" },
  jpg: { ext: "jpg", mime: "image/jpeg", label: "JPG" },
};
export const FRAME_WIDTHS = [0, 1920, 1280, 640] as const;
export const FRAME_INTERVALS = [0.5, 1, 2, 5, 10, 30] as const;
export const MAX_FRAMES = 300;

/** Times (seconds) every `interval` seconds over [start, end], clamped to the video. Empty when the range is empty. */
export function intervalTimes(start: number, end: number, interval: number, duration: number): number[] {
  const from = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, duration));
  const to = Math.max(from, Math.min(Number.isFinite(end) && end > 0 ? end : duration, duration));
  if (!(interval > 0)) return [];
  const count = Math.floor((to - from) / interval + 1e-9) + 1;
  // Never ask for the very last instant: decoders often have no frame exactly at the end.
  const last = Math.max(0, duration - 0.001);
  return Array.from({ length: count }, (_, i) => Math.min(last, Math.round((from + i * interval) * 1000) / 1000));
}

/** Sorted, de-duplicated (to the millisecond) times inside the video. */
export function cleanTimes(times: number[], duration: number): number[] {
  const last = Math.max(0, duration - 0.001);
  const unique = new Set(times.filter(Number.isFinite).map((time) => Math.round(Math.max(0, Math.min(time, last)) * 1000) / 1000));
  return [...unique].sort((a, b) => a - b);
}

/** Output size for a width cap (0 keeps the original), keeping the aspect ratio and never enlarging. */
export function frameSize(width: number, height: number, cap: number): { width: number; height: number } {
  if (!cap || width <= cap) return { width: Math.round(width), height: Math.round(height) };
  return { width: cap, height: Math.max(1, Math.round((cap * height) / width)) };
}

/** "clip-0012.50s.png": sortable by name and says where the frame came from. */
export function frameName(base: string, time: number, ext: string): string {
  const seconds = time.toFixed(2).padStart(7, "0");
  return `${base}-${seconds}s.${ext}`;
}
