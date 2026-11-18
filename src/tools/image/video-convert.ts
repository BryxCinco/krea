/**
 * Tool 41: Video Format Converter. MP4, WebM, MOV and MKV in; MP4, WebM or MOV out.
 * "Original quality" moves the streams into the new container without re-encoding when the
 * codecs fit; otherwise it re-encodes with the target's codecs. Engine: src/lib/video.ts (convertVideo).
 */
import { editorTool } from "../text/editor-tool";

export const videoConvert = editorTool(
  {
    id: 41,
    slug: "video-converter",
    name: "Video Format Converter",
    verb: "Convert video",
    description: "Convert MOV, MKV and WebM to MP4, or MP4 to WebM or MOV, without re-encoding when possible.",
    seoTitle: "Convert MOV to MP4, MP4 to WebM and more, in your browser",
    seoDescription:
      "Convert videos between MP4, WebM and MOV, including iPhone MOV and MKV files. Copies the video without quality loss when the format allows it, or re-encodes with H.264, VP9, AAC or Opus. Nothing is uploaded.",
    howTo: [
      "Open a video (MP4, MOV, WebM, MKV or 3GP).",
      "Pick the format you need, and Original quality or a smaller size.",
      "Convert and download. Krea tells you which codecs it used and whether it re-encoded.",
    ],
    faqs: [
      { q: "Which codecs does each format use?", a: "MP4 and MOV get H.264 video with AAC sound. WebM gets VP9 video with Opus sound. If your browser lacks one of these encoders, Krea uses the next one it has (for example AV1 or VP8) and tells you." },
      { q: "Will converting lower the quality?", a: "Not with Original quality when the codecs already fit the new format, for example an iPhone MOV with H.264 to MP4: the video is copied as it is, in seconds. Otherwise it is re-encoded at high quality." },
      { q: "Which videos cannot be converted?", a: "Ones your browser cannot decode. Common examples: HEVC (H.265) video in Firefox or on some Windows PCs without the HEVC extension, ProRes from cameras, and AC-3 or DTS sound in MKV files. Krea shows a clear message instead of a broken file." },
      { q: "Is my video uploaded?", a: "No. The conversion runs in your browser with its own video encoders. Nothing leaves your device." },
    ],
    icon: "vconvert",
  },
  "video",
);

export const TARGETS = ["mp4", "webm", "mov"] as const;
export const CODEC_NOTE: Record<(typeof TARGETS)[number], string> = {
  mp4: "H.264 video + AAC sound. Plays almost everywhere.",
  webm: "VP9 video + Opus sound. Good for websites; not for iPhone Photos.",
  mov: "H.264 video + AAC sound, in Apple's QuickTime format.",
};
