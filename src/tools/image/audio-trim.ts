/**
 * Tool 52: Audio Trimmer & Converter. Cut a part of an audio file (MP3, WAV, M4A,
 * OGG, FLAC, WebM, or the sound of a video) and save it as MP3 or WAV. Uses
 * Mediabunny on the browser's WebCodecs, and LAME for MP3 like Video to MP3.
 * Engine: src/lib/video.ts (probeAudio, convertAudio). UI: audio-trim-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const audioTrim = editorTool(
  {
    id: 52,
    slug: "audio-trimmer",
    name: "Audio Trimmer & Converter",
    verb: "Trim audio",
    description: "Cut a part of a song, voice memo or recording and save it as MP3 or WAV.",
    seoTitle: "Audio Trimmer: cut MP3, WAV, M4A and convert to MP3 or WAV",
    seoDescription:
      "Trim audio in your browser: pick the start and end on a timeline, then save as MP3 or WAV. Works with MP3, WAV, M4A, OGG, FLAC and voice memos. Copies MP3 without quality loss. No upload.",
    howTo: [
      "Open an audio file, such as an MP3, a phone voice memo (M4A) or a WAV recording.",
      "Drag the two handles on the timeline, or type the start and end times. Play to check.",
      "Choose MP3 or WAV and the quality, then save.",
    ],
    faqs: [
      { q: "Which files can I open?", a: "MP3, WAV, M4A and AAC (iPhone voice memos), OGG and Opus, FLAC and WebM audio, and the sound of MP4 or MOV videos. If your browser cannot decode a format, Krea tells you instead of making a broken file." },
      { q: "Does trimming lower the quality?", a: "Not when you trim an MP3 and keep Same as original: the audio is copied as it is, cut to the nearest MP3 frame (about 1/40 of a second). Converting or changing the bitrate re-encodes, and WAV is lossless but much bigger." },
      { q: "MP3 or WAV?", a: "MP3 is small and plays everywhere: use it for sharing, ringtones and podcasts. WAV is uncompressed (about 10 MB per minute in stereo) and best when you will edit the audio again." },
      { q: "Is my recording uploaded?", a: "No. The audio is cut and converted inside your browser. Nothing is sent anywhere." },
    ],
    icon: "audiotrim",
  },
  "video",
);

export const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.weba,.webm,.mp4,.mov";
export const MP3_BITRATES = [96_000, 128_000, 192_000, 256_000, 320_000] as const;
