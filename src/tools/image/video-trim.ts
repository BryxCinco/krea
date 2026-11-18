/**
 * Tool 36: Video Trimmer. Cut a part out of a video. Fast mode copies the streams (no re-encode,
 * no quality loss) and cuts at key frames; Exact mode re-encodes for a frame-exact start.
 * Engine: src/lib/video.ts (trimVideo). UI: components/stage/editors/trim-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const videoTrim = editorTool(
  {
    id: 36,
    slug: "video-trimmer",
    name: "Video Trimmer",
    verb: "Trim video",
    description: "Cut the part you need out of a video, without re-encoding when possible.",
    seoTitle: "Trim or cut a video in your browser, no upload",
    seoDescription:
      "Cut MP4, MOV, WebM and MKV videos with a timeline and two handles. Fast mode copies the video without re-encoding, so there is no quality loss. Nothing is uploaded.",
    howTo: [
      "Open a video.",
      "Drag the two handles on the timeline, or type the start and end times.",
      "Choose Fast (no re-encode) or Exact, cut, and download. The original format is kept.",
    ],
    faqs: [
      { q: "Does trimming lower the quality?", a: "Not in Fast mode: the video and audio are copied as they are, without re-encoding, so the quality is identical and it takes seconds. Exact mode re-encodes, which can lose a little quality." },
      { q: "Why does my clip start a bit earlier than I chose?", a: "Fast mode can only start a copied video at a key frame, so it starts at the key frame just before your start time and keeps everything you chose. Krea shows the real start. Use Exact for a cut on the exact frame." },
      { q: "Is my video uploaded?", a: "No. The video is cut inside your browser. Krea has no server to receive it." },
      { q: "Which formats work?", a: "MP4, MOV, WebM and MKV that your browser can read. The output keeps the same format as the input." },
    ],
    icon: "trim",
  },
  "video",
);

export type TrimMode = "fast" | "exact";
