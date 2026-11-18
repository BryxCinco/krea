/**
 * Shared video engine for the video tools (35 onwards), on the main thread. Mediabunny (MPL-2.0)
 * drives the browser's WebCodecs decoders and encoders, which run off the main thread on their
 * own; gifenc builds GIFs. Everything is loaded with `await import()` only when a video is opened.
 * ffmpeg.wasm is deliberately not used: its core build is GPL-2.0-or-later and about 31 MB.
 *
 * One runner (`runConversion`) gives every tool the same progress, cancel, error and cleanup
 * behaviour. Each job opens its own Input and disposes it afterwards, so memory is released.
 */
import type * as Mediabunny from "mediabunny";
import { KreaError } from "@/tools/types";
import { gifSize, gifTimestamps, targetSize, trimRange, type Preset } from "@/tools/image/video";
import { FRAME_FORMATS, frameSize, MAX_FRAMES, type FrameFormat } from "@/tools/image/video-frames";

export type MB = typeof Mediabunny;

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  canDecode: boolean;
  /** Average frames per second, when the file says (0 if unknown). */
  fps: number;
}

export interface JobControl {
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

export interface JobResult {
  blob: Blob;
  /** True when every kept track was copied without re-encoding. */
  copied: boolean;
  /** Tracks dropped by the conversion (e.g. audio with no encoder), with Mediabunny's reason. */
  dropped: string[];
}

/** WebCodecs is what does the work; without it nothing here can run. */
export function videoSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

export async function loadEngine(): Promise<MB> {
  return import("mediabunny");
}

export async function openInput(file: Blob) {
  const mb = await loadEngine();
  return { mb, input: new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS }) };
}

export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const { input } = await openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) throw new KreaError("unsupported", "Walang video track na nabasa. Use an MP4, MOV, WebM or MKV video.");
    const audio = await input.getPrimaryAudioTrack().catch(() => null);
    const stats = await track.computePacketStats(120).catch(() => null);
    return {
      duration: await input.computeDuration(),
      width: track.displayWidth,
      height: track.displayHeight,
      videoCodec: track.codec,
      audioCodec: audio?.codec ?? null,
      hasAudio: !!audio,
      canDecode: await track.canDecode(),
      fps: stats?.averagePacketRate ?? 0,
    };
  } catch (error) {
    if (error instanceof KreaError) throw error;
    throw new KreaError("unsupported", "Hindi mabasa ang video. Use an MP4, MOV, WebM or MKV file.");
  } finally {
    input.dispose();
  }
}

export interface ConversionSetup {
  format: Mediabunny.OutputFormat;
  mime: string;
  options: Omit<Mediabunny.ConversionOptions, "input" | "output">;
}

/**
 * Run one conversion. `setup` builds the output format and options once the engine and input
 * are open. The input is always disposed, cancel goes straight to Mediabunny, and every
 * failure becomes a KreaError with a plain message.
 */
export async function runConversion(file: Blob, setup: (mb: MB, input: Mediabunny.Input) => Promise<ConversionSetup>, control: JobControl): Promise<JobResult> {
  const { mb, input } = await openInput(file);
  try {
    const { format, mime, options } = await setup(mb, input);
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format, target });
    const conversion = await mb.Conversion.init({ tags: () => ({}), showWarnings: false, ...options, input, output });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((entry) => entry.reason.replaceAll("_", " ")).join(", ");
      throw new KreaError("unsupported", `Hindi ma-convert ang video (${reasons || "unsupported codec"}). Try another output format or browser.`);
    }
    const onAbort = () => void conversion.cancel();
    control.signal.addEventListener("abort", onAbort, { once: true });
    conversion.onProgress = (progress) => control.onProgress(progress);
    try {
      await conversion.execute();
    } finally {
      control.signal.removeEventListener("abort", onAbort);
    }
    if (control.signal.aborted) throw new KreaError("failed", "Cancelled.");
    if (!target.buffer) throw new KreaError("failed", "Walang lumabas na file. Try other settings.");
    // With copy mode "forced", every track that survived was copied packet for packet.
    const copied = typeof options.copy === "object" && options.copy.mode === "forced";
    return { blob: new Blob([target.buffer], { type: mime }), copied, dropped: conversion.discardedTracks.map((entry) => `${entry.track.type}: ${entry.reason.replaceAll("_", " ")}`) };
  } catch (error) {
    if (error instanceof KreaError) throw error;
    if (control.signal.aborted) throw new KreaError("failed", "Cancelled.");
    throw new KreaError("failed", "Hindi natapos ang video. The device may be low on memory: try a shorter part or a lower resolution.");
  } finally {
    input.dispose();
  }
}

/** First video codec this browser can encode at this size, for the given container. */
export async function pickVideoCodec(mb: MB, preferred: Mediabunny.VideoCodec[], width: number, height: number): Promise<Mediabunny.VideoCodec> {
  const codec = await mb.getFirstEncodableVideoCodec(preferred, { width, height });
  if (!codec) throw new KreaError("unsupported", "This browser cannot encode video at this size. Try a smaller size, or a recent Chrome, Edge or Safari.");
  return codec;
}

// ---------------------------------------------------------------- tool 35: compress

export interface CompressOptions extends JobControl {
  preset: Preset;
  /** Shorter-side cap (720 for 720p); 0 keeps the size. */
  resolution: number;
  removeAudio: boolean;
  start: number;
  end: number;
}

/** Re-encode to MP4 (H.264 when the browser can, else VP9 or AV1) and AAC or Opus audio. */
export async function compressVideo(file: Blob, info: VideoInfo, options: CompressOptions): Promise<Blob> {
  const range = trimRange(options.start, options.end, info.duration);
  if (!range) throw new KreaError("failed", "Masyadong maikli ang napiling part. Pick at least 0.1 seconds.");
  const result = await runConversion(
    file,
    async (mb) => {
      const size = targetSize(info.width, info.height, options.resolution);
      const codec = await pickVideoCodec(mb, ["avc", "vp9", "av1"], size.width, size.height);
      const audioCodec = options.removeAudio || !info.hasAudio ? null : await mb.getFirstEncodableAudioCodec(["aac", "opus"]);
      const quality = options.preset === "small" ? mb.QUALITY_LOW : options.preset === "balanced" ? mb.QUALITY_MEDIUM : mb.QUALITY_HIGH;
      return {
        format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
        mime: "video/mp4",
        options: {
          tracks: "primary",
          video: { width: size.width, height: size.height, fit: "fill", codec, bitrate: quality, forceTranscode: true },
          audio: audioCodec ? { codec: audioCodec, bitrate: options.preset === "small" ? 64_000 : 128_000 } : { discard: true },
          trim: range,
        },
      };
    },
    options,
  );
  return result.blob;
}

// ---------------------------------------------------------------- tool 35: GIF

export interface GifOptions extends JobControl {
  start: number;
  length: number;
  fps: number;
  width: number;
}

/** Sample frames at the chosen rate, quantize each to 256 colours and write an endlessly looping GIF. */
export async function videoToGif(file: Blob, info: VideoInfo, options: GifOptions): Promise<Blob> {
  const { mb, input } = await openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new KreaError("unsupported", "Walang video track na nabasa.");
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const size = gifSize(info.width, info.height, options.width);
    const times = gifTimestamps(options.start, options.length, options.fps, info.duration);
    const sink = new mb.CanvasSink(track, { width: size.width, height: size.height, fit: "fill", poolSize: 2 });
    const encoder = GIFEncoder();
    const delay = Math.round(1000 / options.fps);
    let done = 0;
    let wrote = false;
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (options.signal.aborted) throw new KreaError("failed", "Cancelled.");
      if (frame) {
        const { data, width, height } = canvasPixels(frame.canvas);
        const palette = quantize(data, 256);
        encoder.writeFrame(applyPalette(data, palette), width, height, { palette, delay });
        wrote = true;
      }
      options.onProgress(++done / times.length);
      await yieldToPage();
    }
    if (!wrote) throw new KreaError("failed", "Walang frame na nabasa sa part na ito. Pick another start time.");
    encoder.finish();
    return new Blob([encoder.bytes() as Uint8Array<ArrayBuffer>], { type: "image/gif" });
  } catch (error) {
    if (error instanceof KreaError) throw error;
    if (options.signal.aborted) throw new KreaError("failed", "Cancelled.");
    throw new KreaError("failed", "Hindi nagawa ang GIF. Try a smaller width or a shorter clip.");
  } finally {
    input.dispose();
  }
}

// ---------------------------------------------------------------- containers

export type Container = "mp4" | "mov" | "webm" | "mkv";
export const CONTAINERS: Record<Container, { ext: string; mime: string; label: string; video: Mediabunny.VideoCodec[]; audio: Mediabunny.AudioCodec[] }> = {
  mp4: { ext: "mp4", mime: "video/mp4", label: "MP4", video: ["avc", "hevc", "vp9", "av1"], audio: ["aac", "opus"] },
  mov: { ext: "mov", mime: "video/quicktime", label: "MOV", video: ["avc", "hevc", "vp9", "av1"], audio: ["aac", "opus"] },
  webm: { ext: "webm", mime: "video/webm", label: "WebM", video: ["vp9", "vp8", "av1"], audio: ["opus", "vorbis"] },
  mkv: { ext: "mkv", mime: "video/x-matroska", label: "MKV", video: ["avc", "vp9", "av1", "vp8"], audio: ["aac", "opus"] },
};

/** The input's container, so tools can keep the original format. Unknown formats become MP4. */
export async function containerOf(mb: MB, input: Mediabunny.Input): Promise<Container> {
  const format = await input.getFormat();
  if (format === mb.QTFF) return "mov";
  if (format === mb.WEBM) return "webm";
  if (format === mb.MATROSKA) return "mkv";
  return "mp4";
}

export function outputFormat(mb: MB, container: Container): Mediabunny.OutputFormat {
  if (container === "mov") return new mb.MovOutputFormat({ fastStart: "in-memory" });
  if (container === "webm") return new mb.WebMOutputFormat();
  if (container === "mkv") return new mb.MkvOutputFormat();
  return new mb.Mp4OutputFormat({ fastStart: "in-memory" });
}

// ---------------------------------------------------------------- tool 36: trim

export interface TrimOptions extends JobControl {
  start: number;
  end: number;
  /** "fast" copies the streams (cut at key frames); "exact" re-encodes for frame-exact cuts. */
  mode: "fast" | "exact";
}
export interface TrimResult extends JobResult {
  container: Container;
  /** Where the copied clip really starts (the key frame at or before the chosen start). */
  actualStart: number;
  reencoded: boolean;
}

/**
 * Cut [start, end]. Fast mode copies packets without re-encoding, starting at the key frame at or
 * before `start` (so nothing chosen is lost); if a track cannot be copied it falls back to
 * re-encoding and says so. The original container is kept.
 */
export async function trimVideo(file: Blob, info: VideoInfo, options: TrimOptions): Promise<TrimResult> {
  const range = trimRange(options.start, options.end, info.duration);
  if (!range) throw new KreaError("failed", "Masyadong maikli ang napiling part. Pick at least 0.1 seconds.");
  let container: Container = "mp4";
  let actualStart = range.start;
  const attempt = (copy: boolean) =>
    runConversion(
      file,
      async (mb, input) => {
        container = await containerOf(mb, input);
        const spec = CONTAINERS[container];
        if (copy) {
          const track = await input.getPrimaryVideoTrack();
          const key = track ? await new mb.EncodedPacketSink(track).getKeyPacket(range.start, { verifyKeyPackets: true }).catch(() => null) : null;
          if (key) actualStart = Math.min(range.start, key.timestamp);
          return { format: outputFormat(mb, container), mime: spec.mime, options: { tracks: "primary", trim: range, copy: { mode: "forced", boundaryPolicy: "expand", shiftTolerance: Infinity } } };
        }
        actualStart = range.start;
        const codec = await pickVideoCodec(mb, spec.video, info.width, info.height);
        const audioCodec = info.hasAudio ? await mb.getFirstEncodableAudioCodec(spec.audio) : null;
        return {
          format: outputFormat(mb, container),
          mime: spec.mime,
          options: { tracks: "primary", trim: range, copy: false, video: { codec, bitrate: mb.QUALITY_HIGH }, audio: audioCodec ? { codec: audioCodec, bitrate: 160_000 } : { discard: true } },
        };
      },
      options,
    );
  if (options.mode === "fast") {
    try {
      const copied = await attempt(true);
      if (!copied.dropped.length) return { ...copied, container, actualStart, reencoded: false };
    } catch (error) {
      if (options.signal.aborted) throw error;
    }
  }
  const encoded = await attempt(false);
  return { ...encoded, copied: false, container, actualStart, reencoded: true };
}

// ---------------------------------------------------------------- tool 37: speed

export interface SpeedOptions extends JobControl {
  speed: number;
  /** "keep" time-stretches the audio with the pitch kept; "mute" drops it. */
  audio: "keep" | "mute";
}

/** Output frame rate cap when speeding up (frames in between are dropped). */
const SPEED_MAX_FPS = 60;

/**
 * Change the speed. Video frames are re-timed (and thinned out above 60 fps when speeding up; slow
 * motion repeats nothing, each frame just lasts longer). Audio goes through the WSOLA time-stretcher,
 * so voices keep their pitch. Both use the same clock, so they stay in sync. The container is kept.
 */
export async function speedVideo(file: Blob, info: VideoInfo, options: SpeedOptions): Promise<{ blob: Blob; container: Container }> {
  const { speed } = options;
  if (!(speed >= 0.25 && speed <= 4) || speed === 1) throw new KreaError("failed", "Pick a speed from 0.25x to 4x (not 1x).");
  const { TimeStretcher, keepFrame } = await import("./time-stretch");
  let container: Container = "mp4";
  const result = await runConversion(
    file,
    async (mb, input) => {
      container = await containerOf(mb, input);
      const spec = CONTAINERS[container];
      const codec = await pickVideoCodec(mb, spec.video, info.width, info.height);
      const audioCodec = options.audio === "keep" && info.hasAudio ? await mb.getFirstEncodableAudioCodec(spec.audio) : null;
      let lastKept: number | null = null;
      let stretcher: InstanceType<typeof TimeStretcher> | null = null;
      let audioStart = 0;
      let emitted = 0;
      return {
        format: outputFormat(mb, container),
        mime: spec.mime,
        options: {
          tracks: "primary",
          video: {
            codec,
            bitrate: mb.QUALITY_HIGH,
            forceTranscode: true,
            process: (sample) => {
              const timestamp = sample.timestamp / speed;
              if (speed > 1 && !keepFrame(timestamp, lastKept, SPEED_MAX_FPS)) return null;
              lastKept = timestamp;
              const out = sample.clone();
              out.setTimestamp(timestamp);
              out.setDuration(speed > 1 ? Math.max(sample.duration / speed, 1 / SPEED_MAX_FPS) : sample.duration / speed);
              return out;
            },
          },
          audio: audioCodec
            ? {
                codec: audioCodec,
                bitrate: 160_000,
                forceTranscode: true,
                process: (sample) => {
                  const channels = sample.numberOfChannels;
                  if (!stretcher) {
                    stretcher = new TimeStretcher(sample.sampleRate, channels, speed);
                    audioStart = sample.timestamp / speed;
                  }
                  const planes = Array.from({ length: channels }, (_, plane) => {
                    const data = new Float32Array(sample.numberOfFrames);
                    sample.copyTo(data, { planeIndex: plane, format: "f32-planar" });
                    return data;
                  });
                  const out = stretcher.push(planes);
                  const frames = out[0].length;
                  if (!frames) return [];
                  const data = new Float32Array(frames * channels);
                  out.forEach((plane, c) => data.set(plane, c * frames));
                  const stretched = new mb.AudioSample({ data, format: "f32-planar", numberOfChannels: channels, sampleRate: sample.sampleRate, timestamp: audioStart + emitted / sample.sampleRate });
                  emitted += frames;
                  return stretched;
                },
              }
            : { discard: true },
        },
      };
    },
    options,
  );
  return { blob: result.blob, container };
}

// ---------------------------------------------------------------- tool 38: crop and rotate

export interface CropOptions extends JobControl {
  rotate: 0 | 90 | 180 | 270;
  flip: boolean;
  /** In pixels of the rotated and flipped picture; already even. Null keeps the whole picture. */
  crop: { left: number; top: number; width: number; height: number } | null;
}

/** Rotate, flip and crop, baked into the frames (not left as metadata some players ignore). Audio is copied when possible. */
export async function cropVideo(file: Blob, info: VideoInfo, options: CropOptions): Promise<{ blob: Blob; container: Container }> {
  let container: Container = "mp4";
  const result = await runConversion(
    file,
    async (mb, input) => {
      container = await containerOf(mb, input);
      const spec = CONTAINERS[container];
      const turned = options.rotate === 90 || options.rotate === 270;
      const width = options.crop?.width ?? (turned ? info.height : info.width);
      const height = options.crop?.height ?? (turned ? info.width : info.height);
      const codec = await pickVideoCodec(mb, spec.video, width, height);
      return {
        format: outputFormat(mb, container),
        mime: spec.mime,
        options: {
          tracks: "primary",
          video: {
            codec,
            bitrate: mb.QUALITY_HIGH,
            rotate: options.rotate,
            flip: options.flip,
            crop: options.crop ?? undefined,
            allowTransformationMetadata: false,
            forceTranscode: true,
          },
        },
      };
    },
    options,
  );
  return { blob: result.blob, container };
}

// ---------------------------------------------------------------- tool 39: watermark

export interface WatermarkOptions extends JobControl {
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

/**
 * Draw every frame onto a canvas, add the overlay with `draw`, and encode that canvas. The canvas
 * is reused frame to frame; Mediabunny copies it into a new frame each time. Audio is copied.
 */
export async function watermarkVideo(file: Blob, info: VideoInfo, options: WatermarkOptions): Promise<{ blob: Blob; container: Container }> {
  let container: Container = "mp4";
  const canvas = document.createElement("canvas");
  try {
    const result = await runConversion(
      file,
      async (mb, input) => {
        container = await containerOf(mb, input);
        const spec = CONTAINERS[container];
        const codec = await pickVideoCodec(mb, spec.video, info.width, info.height);
        const ctx = canvas.getContext("2d")!;
        return {
          format: outputFormat(mb, container),
          mime: spec.mime,
          options: {
            tracks: "primary",
            video: {
              codec,
              bitrate: mb.QUALITY_HIGH,
              forceTranscode: true,
              process: (sample) => {
                const w = sample.displayWidth;
                const h = sample.displayHeight;
                if (canvas.width !== w || canvas.height !== h) {
                  canvas.width = w;
                  canvas.height = h;
                }
                ctx.clearRect(0, 0, w, h);
                sample.draw(ctx, 0, 0, w, h);
                options.draw(ctx, w, h);
                return canvas;
              },
            },
          },
        };
      },
      options,
    );
    return { blob: result.blob, container };
  } finally {
    canvas.width = canvas.height = 0;
  }
}

// ---------------------------------------------------------------- tool 40: extract audio

export type AudioFormat = "mp3" | "m4a" | "wav";
export const AUDIO_FORMATS: Record<AudioFormat, { ext: string; mime: string; label: string }> = {
  mp3: { ext: "mp3", mime: "audio/mpeg", label: "MP3" },
  m4a: { ext: "m4a", mime: "audio/mp4", label: "M4A (AAC)" },
  wav: { ext: "wav", mime: "audio/wav", label: "WAV" },
};

export interface AudioOptions extends JobControl {
  format: AudioFormat;
  /** Bits per second for MP3 and M4A; 0 for M4A copies the original AAC without re-encoding. */
  bitrate: number;
  start: number;
  end: number;
}

let mp3Registered = false;

/** Browsers cannot encode MP3, so Krea registers LAME (LGPL, compiled to WebAssembly) once, on first use. */
async function ensureMp3Encoder(mb: MB): Promise<void> {
  if (mp3Registered || (await mb.canEncodeAudio("mp3"))) return;
  const { registerMp3Encoder } = await import("@mediabunny/mp3-encoder");
  registerMp3Encoder();
  mp3Registered = true;
}

/**
 * Save the audio track. MP3 uses LAME (LGPL) compiled to WebAssembly through @mediabunny/mp3-encoder,
 * because browsers cannot encode MP3; it runs in its own inline worker, with no download. M4A uses the
 * browser's AAC encoder (or copies the original AAC); WAV is uncompressed 16-bit PCM.
 */
export async function extractAudio(file: Blob, info: VideoInfo, options: AudioOptions): Promise<{ blob: Blob; copied: boolean }> {
  if (!info.hasAudio) throw new KreaError("unsupported", "Walang audio ang video na ito, so there is nothing to extract.");
  const range = trimRange(options.start, options.end, info.duration);
  if (!range) throw new KreaError("failed", "Masyadong maikli ang napiling part. Pick at least 0.1 seconds.");
  const spec = AUDIO_FORMATS[options.format];
  const copy = options.format === "m4a" && options.bitrate === 0 && info.audioCodec === "aac";
  const result = await runConversion(
    file,
    async (mb) => {
      if (options.format === "mp3") await ensureMp3Encoder(mb);
      const format = options.format === "mp3" ? new mb.Mp3OutputFormat() : options.format === "wav" ? new mb.WavOutputFormat() : new mb.Mp4OutputFormat({ fastStart: "in-memory" });
      if (copy) return { format, mime: spec.mime, options: { tracks: "primary", video: { discard: true }, trim: range, copy: { mode: "forced", boundaryPolicy: "expand", shiftTolerance: Infinity } } };
      if (options.format === "m4a" && !(await mb.canEncodeAudio("aac"))) throw new KreaError("unsupported", "This browser cannot encode AAC. Choose MP3 or WAV.");
      const codec = options.format === "mp3" ? "mp3" : options.format === "wav" ? "pcm-s16" : "aac";
      return {
        format,
        mime: spec.mime,
        options: { tracks: "primary", video: { discard: true }, audio: { codec, ...(options.format === "wav" ? {} : { bitrate: options.bitrate || 192_000 }), forceTranscode: true }, trim: range },
      };
    },
    options,
  );
  return { blob: result.blob, copied: copy };
}

// ---------------------------------------------------------------- tool 52: audio trimmer and converter

export interface AudioInfo {
  duration: number;
  codec: string | null;
  sampleRate: number;
  channels: number;
  canDecode: boolean;
}

/** Read an audio file (MP3, WAV, M4A/AAC, OGG/Opus, FLAC, WebM, or a video's sound track). */
export async function probeAudio(file: Blob): Promise<AudioInfo> {
  const { input } = await openInput(file);
  try {
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    if (!track) throw new KreaError("unsupported", "Walang audio na nabasa sa file na ito. Use an MP3, WAV, M4A, OGG, FLAC or WebM audio file.");
    return {
      duration: await input.computeDuration(),
      codec: track.codec,
      sampleRate: track.sampleRate,
      channels: track.numberOfChannels,
      canDecode: await track.canDecode(),
    };
  } catch (error) {
    if (error instanceof KreaError) throw error;
    throw new KreaError("unsupported", "Hindi mabasa ang audio. Use an MP3, WAV, M4A, OGG, FLAC or WebM file.");
  } finally {
    input.dispose();
  }
}

export type AudioOutput = "mp3" | "wav";
export const AUDIO_OUTPUTS: Record<AudioOutput, { ext: string; mime: string; label: string }> = {
  mp3: { ext: "mp3", mime: "audio/mpeg", label: "MP3" },
  wav: { ext: "wav", mime: "audio/wav", label: "WAV" },
};

export interface AudioConvertOptions extends JobControl {
  format: AudioOutput;
  /** MP3 bits per second; 0 copies an MP3 input's frames without re-encoding. */
  bitrate: number;
  start: number;
  end: number;
  mono: boolean;
}

/**
 * Trim and convert audio. MP3 to MP3 at "same as original" copies frames (cut at
 * the nearest MP3 frame, about 26 ms, with no quality loss); everything else is
 * decoded and re-encoded: MP3 with LAME, WAV as 16-bit PCM.
 */
export async function convertAudio(file: Blob, info: AudioInfo, options: AudioConvertOptions): Promise<{ blob: Blob; copied: boolean }> {
  if (!info.canDecode) throw new KreaError("unsupported", `This browser cannot decode ${info.codec ?? "this"} audio. Try Chrome or Edge, or convert the file to MP3 or WAV with another app first.`);
  const range = trimRange(options.start, options.end, info.duration);
  if (!range) throw new KreaError("failed", "Masyadong maikli ang napiling part. Pick at least 0.1 seconds.");
  const spec = AUDIO_OUTPUTS[options.format];
  const attempt = (copy: boolean) =>
    runConversion(
      file,
      async (mb) => {
        const format = options.format === "mp3" ? new mb.Mp3OutputFormat() : new mb.WavOutputFormat();
        // A cut that starts between MP3 frames shifts the audio by a few milliseconds. With a single
        // track that cannot break sync, so any shift is allowed (Mediabunny allows none by default).
        if (copy) return { format, mime: spec.mime, options: { tracks: "primary", video: { discard: true }, trim: range, copy: { mode: "forced", boundaryPolicy: "expand", shiftTolerance: Infinity } } };
        if (options.format === "mp3") await ensureMp3Encoder(mb);
        const codec = options.format === "mp3" ? "mp3" : "pcm-s16";
        return {
          format,
          mime: spec.mime,
          options: {
            tracks: "primary",
            video: { discard: true },
            audio: { codec, ...(options.format === "mp3" ? { bitrate: options.bitrate || 192_000 } : {}), ...(options.mono ? { numberOfChannels: 1 } : {}), forceTranscode: true },
            trim: range,
          },
        };
      },
      options,
    );
  if (options.format === "mp3" && options.bitrate === 0 && info.codec === "mp3" && !options.mono) {
    try {
      const copied = await attempt(true);
      if (!copied.dropped.length) return { blob: copied.blob, copied: true };
    } catch (error) {
      if (options.signal.aborted) throw error;
    }
    // Copying failed (an unusual MP3): re-encode at a high bitrate instead of giving up.
    options = { ...options, bitrate: 256_000 };
  }
  const result = await attempt(false);
  return { blob: result.blob, copied: false };
}

// ---------------------------------------------------------------- tool 41: format converter

export interface ConvertOptions extends JobControl {
  target: Container;
  /** "copy" keeps the streams as they are when the target allows it (no quality loss). */
  quality: "copy" | Preset;
  /** Shorter-side cap; 0 keeps the size. Ignored for "copy". */
  resolution: number;
}
export interface ConvertResult {
  blob: Blob;
  copied: boolean;
  videoCodec: string;
  audioCodec: string | null;
  dropped: string[];
}

/**
 * Change the container. With "copy", streams are moved into the new container untouched when its
 * rules allow it (e.g. H.264 + AAC from MOV to MP4); otherwise, and for the presets, they are
 * re-encoded with the target's codecs: MP4/MOV = H.264 + AAC, WebM = VP9 + Opus.
 */
export async function convertVideo(file: Blob, info: VideoInfo, options: ConvertOptions): Promise<ConvertResult> {
  const spec = CONTAINERS[options.target];
  if (options.quality === "copy") {
    try {
      const copied = await runConversion(
        file,
        async (mb) => ({ format: outputFormat(mb, options.target), mime: spec.mime, options: { tracks: "primary", copy: { mode: "forced" } } }),
        options,
      );
      if (!copied.dropped.length) return { blob: copied.blob, copied: true, videoCodec: info.videoCodec ?? "?", audioCodec: info.audioCodec, dropped: [] };
    } catch (error) {
      if (options.signal.aborted) throw error;
    }
  }
  let videoCodec = "";
  let audioCodec: string | null = null;
  const preset = options.quality === "copy" ? "better" : options.quality;
  const result = await runConversion(
    file,
    async (mb) => {
      const size = targetSize(info.width, info.height, options.quality === "copy" ? 0 : options.resolution);
      videoCodec = await pickVideoCodec(mb, spec.video.filter((codec) => codec !== "hevc"), size.width, size.height);
      audioCodec = info.hasAudio ? await mb.getFirstEncodableAudioCodec(spec.audio) : null;
      const quality = preset === "small" ? mb.QUALITY_LOW : preset === "balanced" ? mb.QUALITY_MEDIUM : mb.QUALITY_HIGH;
      return {
        format: outputFormat(mb, options.target),
        mime: spec.mime,
        options: {
          tracks: "primary",
          video: { width: size.width, height: size.height, fit: "fill", codec: videoCodec as Mediabunny.VideoCodec, bitrate: quality, forceTranscode: true },
          audio: audioCodec ? { codec: audioCodec as Mediabunny.AudioCodec, bitrate: preset === "small" ? 96_000 : 160_000, forceTranscode: true } : { discard: true },
        },
      };
    },
    options,
  );
  return { blob: result.blob, copied: false, videoCodec, audioCodec, dropped: result.dropped };
}

// ---------------------------------------------------------------- tool 42: extract frames

export interface FramesOptions extends JobControl {
  /** Times in seconds, already sorted and inside the video. */
  times: number[];
  format: FrameFormat;
  /** Width cap in pixels; 0 keeps the video's size. */
  width: number;
}
export interface ExtractedFrame {
  blob: Blob;
  /** The frame's own timestamp, which can be a little before the asked time. */
  time: number;
}

function canvasBlob(canvas: HTMLCanvasElement | OffscreenCanvas, mime: string, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: mime, quality });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), mime, quality));
}

/**
 * Decode the frame shown at each time and save it as PNG or JPG. Frames come from the browser's
 * WebCodecs decoder through Mediabunny's CanvasSink (the frame at or before each time, as a player shows it).
 */
export async function extractFrames(file: Blob, info: VideoInfo, options: FramesOptions): Promise<ExtractedFrame[]> {
  if (!options.times.length) throw new KreaError("failed", "Walang napiling oras. Add at least one moment or pick an interval.");
  if (options.times.length > MAX_FRAMES) throw new KreaError("failed", `Masyadong marami ang frames (${options.times.length}). Krea saves up to ${MAX_FRAMES} at a time: use a longer interval or a shorter part.`);
  const { mb, input } = await openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new KreaError("unsupported", "Walang video track na nabasa.");
    const size = frameSize(info.width, info.height, options.width);
    const spec = FRAME_FORMATS[options.format];
    const sink = new mb.CanvasSink(track, { width: size.width, height: size.height, fit: "fill", poolSize: 1 });
    const frames: ExtractedFrame[] = [];
    let done = 0;
    for await (const frame of sink.canvasesAtTimestamps(options.times)) {
      if (options.signal.aborted) throw new KreaError("failed", "Cancelled.");
      // The canvas is reused for the next frame, so encode it before moving on.
      if (frame) frames.push({ blob: await canvasBlob(frame.canvas, spec.mime, 0.92), time: frame.timestamp });
      options.onProgress(++done / options.times.length);
      await yieldToPage();
    }
    if (!frames.length) throw new KreaError("failed", "Walang frame na nabasa sa mga oras na ito. Pick other moments.");
    return frames;
  } catch (error) {
    if (error instanceof KreaError) throw error;
    if (options.signal.aborted) throw new KreaError("failed", "Cancelled.");
    throw new KreaError("failed", "Hindi nakuha ang frames. Try a smaller size or fewer frames.");
  } finally {
    input.dispose();
  }
}

export function canvasPixels(canvas: HTMLCanvasElement | OffscreenCanvas): ImageData {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));
