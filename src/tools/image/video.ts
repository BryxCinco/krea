/**
 * Tool 35: Video Compressor & MP4 to GIF.
 * Uses the browser's own video encoder (WebCodecs) through Mediabunny (MPL-2.0), and gifenc
 * (MIT) for GIFs. ffmpeg.wasm was not used: its core build is GPL-2.0-or-later and about 31 MB.
 * The UI is an editor (components/stage/editors/video-editor.tsx); the engine is src/lib/video.ts.
 */
import { editorTool } from "../text/editor-tool";

export const video = editorTool(
  {
    id: 35,
    slug: "video-compressor-gif",
    name: "Video Compressor & MP4 to GIF",
    verb: "Compress video",
    description: "Make a video smaller for Messenger, email or school uploads, or turn a clip into a GIF.",
    seoTitle: "Compress a video or turn MP4 into GIF, in your browser",
    seoDescription:
      "Shrink MP4, MOV and WebM videos by lowering the resolution and bitrate, trim them, remove audio, or turn a short clip into a GIF. Uses your browser's own video encoder. Nothing is uploaded.",
    howTo: [
      "Open a video (MP4, MOV or WebM).",
      "Compress: pick a size and quality, trim if you like, and start. To GIF: pick the start, length, width and frame rate.",
      "Download the smaller MP4 or the GIF. You can cancel at any time.",
    ],
    faqs: [
      { q: "Is my video uploaded?", a: "No. The video is read, re-encoded and saved inside your browser with the video encoder your browser already has. Krea has no server to receive it." },
      { q: "Which browsers work?", a: "Recent Chrome, Edge and Samsung Internet on phones and computers, Safari 16.4 or newer, and Firefox 130 or newer on computers. If the browser has no video encoder, Krea says so instead of failing halfway." },
      { q: "How much smaller will it get?", a: "It depends on the video. Phone videos recorded at 1080p or 4K usually shrink a lot at 720p. A video that is already small may not shrink, and Krea tells you when the result is not smaller." },
      { q: "How long can a GIF be?", a: "Up to 15 seconds. GIFs have only 256 colours per frame and no sound, and they get big fast, so short clips at 320 to 480 pixels wide work best." },
      { q: "Does the compressed video keep my location?", a: "No. Krea does not copy the original's metadata tags, such as location or camera model, into the new file." },
    ],
    icon: "video",
  },
  "video",
);

/** Quality presets: the bitrate is chosen by Mediabunny from the resolution. */
export const PRESETS = [
  { id: "small", label: "Smallest" },
  { id: "balanced", label: "Balanced" },
  { id: "better", label: "Better quality" },
] as const;
export type Preset = (typeof PRESETS)[number]["id"];

/** Longest side caps. "Original" keeps the size. */
export const RESOLUTIONS = [
  { value: 0, label: "Original size" },
  { value: 1080, label: "1080p" },
  { value: 720, label: "720p (recommended)" },
  { value: 480, label: "480p" },
  { value: 360, label: "360p" },
] as const;

export const GIF_WIDTHS = [240, 320, 480, 640] as const;
export const GIF_FPS = [5, 10, 15] as const;
export const GIF_MAX_SECONDS = 15;
/** Warn above this size: phones may run out of memory. */
export const WARN_VIDEO_BYTES = 100 * 1024 * 1024;
/** Refuse inputs over this size: the output is held in memory until it is saved. Set from tests (see LAUNCH-CHECKLIST). */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/**
 * Output size for a "720p"-style cap: the shorter side is limited to `cap` (so portrait phone
 * videos are treated like landscape ones), never enlarged, and both sides are even for H.264.
 */
export function targetSize(width: number, height: number, cap: number): { width: number; height: number } {
  if (!cap || Math.min(width, height) <= cap) return { width: even(width), height: even(height) };
  const scale = cap / Math.min(width, height);
  return { width: even(width * scale), height: even(height * scale) };
}

/** GIF size for a chosen width, keeping the aspect ratio. */
export function gifSize(width: number, height: number, gifWidth: number): { width: number; height: number } {
  const w = Math.min(gifWidth, width);
  return { width: Math.round(w), height: Math.max(1, Math.round((w * height) / width)) };
}

/** Frame timestamps (seconds) for a GIF clip, clamped to the video. */
export function gifTimestamps(start: number, length: number, fps: number, duration: number): number[] {
  const from = Math.max(0, Math.min(start, duration));
  const to = Math.min(duration, from + Math.min(length, GIF_MAX_SECONDS));
  const count = Math.max(1, Math.floor((to - from) * fps));
  return Array.from({ length: count }, (_, i) => from + i / fps);
}

/** Clamp a trim range to the video; null when it is empty. */
export function trimRange(start: number, end: number, duration: number): { start: number; end: number } | null {
  const s = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, duration));
  const e = Math.max(0, Math.min(Number.isFinite(end) && end > 0 ? end : duration, duration));
  return e - s >= 0.1 ? { start: s, end: e } : null;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "?";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
