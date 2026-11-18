/**
 * Tool 37: Video Speed. Slow down or speed up a video from 0.25x to 4x, keeping voices at their
 * normal pitch (WSOLA time-stretch in src/lib/time-stretch.ts) or muting the audio.
 * Engine: src/lib/video.ts (speedVideo). UI: components/stage/editors/speed-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const videoSpeed = editorTool(
  {
    id: 37,
    slug: "video-speed",
    name: "Video Speed",
    verb: "Change speed",
    description: "Slow motion or fast forward from 0.25x to 4x, with voices kept at normal pitch.",
    seoTitle: "Change video speed: slow motion or fast forward, in your browser",
    seoDescription:
      "Speed up or slow down MP4, MOV and WebM videos from 0.25x to 4x. Audio keeps its normal pitch, or mute it. See the new length before you start. Nothing is uploaded.",
    howTo: [
      "Open a video.",
      "Pick a speed (0.5x, 1.5x, 2x...) or type your own from 0.25 to 4, and choose to keep or mute the audio.",
      "Check the new length, start, and download.",
    ],
    faqs: [
      { q: "Will voices sound like chipmunks?", a: "No. Krea stretches the audio in time without changing its pitch, so voices sound normal, just faster or slower. Very high or very low speeds can sound a little choppy." },
      { q: "Does slow motion add frames?", a: "No. Each frame is shown longer, so 0.25x of a 30 fps video plays at about 7.5 frames per second and looks steppy. Videos recorded at 60 fps or more make smoother slow motion." },
      { q: "What happens to frames when I speed up?", a: "Krea keeps up to 60 frames per second and leaves out the frames in between, which players could not show anyway." },
      { q: "Is my video uploaded?", a: "No. The video is processed inside your browser and never leaves your device." },
    ],
    icon: "speed",
  },
  "video",
);

/** New duration and a rough output size (same bitrate as the original, audio removed if muted). */
export function speedEstimate(duration: number, bytes: number, speed: number, hasAudio: boolean, mute: boolean): { duration: number; bytes: number } {
  const newDuration = duration / speed;
  const perSecond = bytes / Math.max(duration, 0.001);
  const audioPerSecond = hasAudio && mute ? 160_000 / 8 : 0;
  return { duration: newDuration, bytes: Math.max(0, (perSecond - audioPerSecond) * newDuration) };
}
