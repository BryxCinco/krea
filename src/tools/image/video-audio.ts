/**
 * Tool 40: Video to MP3. Save the sound of a video as MP3, M4A or WAV, optionally only a part.
 * MP3 is encoded with LAME 3.100 (LGPL) compiled to WebAssembly via @mediabunny/mp3-encoder (MPL-2.0),
 * because browsers have no MP3 encoder. Engine: src/lib/video.ts (extractAudio). UI: audio-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const videoAudio = editorTool(
  {
    id: 40,
    slug: "video-to-mp3",
    name: "Video to MP3",
    verb: "Extract audio",
    description: "Save the sound of a video as MP3, M4A or WAV, the whole thing or just a part.",
    seoTitle: "Video to MP3: extract the audio from a video, in your browser",
    seoDescription:
      "Turn MP4, MOV, WebM and MKV videos into MP3, M4A or WAV audio. Choose the bitrate and cut a part with a timeline. Nothing is uploaded.",
    howTo: [
      "Open a video that has sound.",
      "Choose MP3, M4A or WAV and the quality. Drag the timeline handles to keep only a part, if you like.",
      "Extract and download the audio file.",
    ],
    faqs: [
      { q: "Which format should I pick?", a: "MP3 plays everywhere. M4A (AAC) sounds a little better at the same size, and Same as original copies the video's AAC sound without re-encoding. WAV is uncompressed: best quality, but about 10 MB per minute." },
      { q: "Which bitrate is enough?", a: "128 kbps is fine for voice and most music on a phone. 192 kbps is a safe default. 256 or 320 kbps only helps on very good headphones." },
      { q: "Can I use this to download music I do not own?", a: "Krea only works on video files already on your device. Use it for your own recordings or content you have the right to use." },
      { q: "Is my video uploaded?", a: "No. The audio is extracted inside your browser. The MP3 encoder is part of Krea and is not downloaded from anywhere else." },
    ],
    icon: "audio",
  },
  "video",
);

export const BITRATES = [96_000, 128_000, 192_000, 256_000, 320_000] as const;
