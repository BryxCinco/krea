/**
 * Video engine for tool 35, on the main thread. Mediabunny drives the browser's WebCodecs
 * decoders and encoders (which run off the main thread themselves); gifenc builds GIFs.
 * Both are loaded with `await import()` only when a video is opened.
 */
import { KreaError } from "@/tools/types";
import { gifSize, gifTimestamps, targetSize, trimRange, type Preset } from "@/tools/image/video";

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  canDecode: boolean;
}

/** WebCodecs is what does the work; without it nothing here can run. */
export function videoSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

async function openInput(file: Blob) {
  const mb = await import("mediabunny");
  return { mb, input: new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS }) };
}

export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const { input } = await openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) throw new KreaError("unsupported", "Walang video track na nabasa. Use an MP4, MOV or WebM video.");
    const audio = await input.getPrimaryAudioTrack().catch(() => null);
    return {
      duration: await input.computeDuration(),
      width: track.displayWidth,
      height: track.displayHeight,
      videoCodec: track.codec,
      audioCodec: audio?.codec ?? null,
      hasAudio: !!audio,
      canDecode: await track.canDecode(),
    };
  } catch (error) {
    if (error instanceof KreaError) throw error;
    throw new KreaError("unsupported", "Hindi mabasa ang video. Use an MP4, MOV or WebM file.");
  } finally {
    input.dispose();
  }
}

export interface CompressOptions {
  preset: Preset;
  /** Shorter-side cap (720 for 720p); 0 keeps the size. */
  resolution: number;
  removeAudio: boolean;
  start: number;
  end: number;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}

/** Re-encode to MP4 (H.264 when the browser can, else VP9 or AV1) and AAC or Opus audio. */
export async function compressVideo(file: Blob, info: VideoInfo, options: CompressOptions): Promise<Blob> {
  const { mb, input } = await openInput(file);
  try {
    const range = trimRange(options.start, options.end, info.duration);
    if (!range) throw new KreaError("failed", "Masyadong maikli ang napiling part. Pick at least 0.1 seconds.");
    const size = targetSize(info.width, info.height, options.resolution);
    const videoCodec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: size.width, height: size.height });
    if (!videoCodec) throw new KreaError("unsupported", "This browser cannot encode video at this size. Try 720p, or use a recent Chrome, Edge or Safari.");
    const audioCodec = options.removeAudio || !info.hasAudio ? null : await mb.getFirstEncodableAudioCodec(["aac", "opus"]);
    const quality = options.preset === "small" ? mb.QUALITY_LOW : options.preset === "balanced" ? mb.QUALITY_MEDIUM : mb.QUALITY_HIGH;
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      video: { width: size.width, height: size.height, fit: "fill", codec: videoCodec, bitrate: quality, forceTranscode: true },
      audio: audioCodec ? { codec: audioCodec, bitrate: options.preset === "small" ? 64_000 : 128_000 } : { discard: true },
      trim: { start: range.start, end: range.end },
      // Do not copy the original's tags (location, camera model, title).
      tags: () => ({}),
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((entry) => entry.reason).join(", ");
      throw new KreaError("unsupported", `Hindi ma-convert ang video (${reasons || "unsupported codec"}). Try another browser or video.`);
    }
    const onAbort = () => void conversion.cancel();
    options.signal.addEventListener("abort", onAbort, { once: true });
    conversion.onProgress = (progress) => options.onProgress(progress);
    try {
      await conversion.execute();
    } finally {
      options.signal.removeEventListener("abort", onAbort);
    }
    if (options.signal.aborted) throw new KreaError("failed", "Cancelled.");
    if (!target.buffer) throw new KreaError("failed", "Walang lumabas na video. Try a lower resolution.");
    return new Blob([target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (error instanceof KreaError) throw error;
    if (options.signal.aborted) throw new KreaError("failed", "Cancelled.");
    throw new KreaError("failed", "Hindi natapos ang compress. The device may be low on memory: try 720p or a shorter part.");
  } finally {
    input.dispose();
  }
}

export interface GifOptions {
  start: number;
  length: number;
  fps: number;
  width: number;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
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
    let last: { width: number; height: number } | null = null;
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (options.signal.aborted) throw new KreaError("failed", "Cancelled.");
      if (frame) {
        const ctx = frame.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        const { data, width, height } = ctx.getImageData(0, 0, frame.canvas.width, frame.canvas.height);
        const palette = quantize(data, 256);
        encoder.writeFrame(applyPalette(data, palette), width, height, { palette, delay });
        last = { width, height };
      }
      options.onProgress(++done / times.length);
      // Let the page breathe between frames.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!last) throw new KreaError("failed", "Walang frame na nabasa sa part na ito. Pick another start time.");
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
