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
          return { format: outputFormat(mb, container), mime: spec.mime, options: { tracks: "primary", trim: range, copy: { mode: "forced", boundaryPolicy: "expand" } } };
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

export function canvasPixels(canvas: HTMLCanvasElement | OffscreenCanvas): ImageData {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));
