"use client";

import { Clapperboard, Download, Film, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { formatBytes, renameFile } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { onTabListKeyDown } from "@/lib/use-focus-trap";
import { compressVideo, probeVideo, videoSupported, videoToGif, type VideoInfo } from "@/lib/video";
import { formatDuration, GIF_FPS, GIF_MAX_SECONDS, GIF_WIDTHS, gifSize, MAX_VIDEO_BYTES, PRESETS, RESOLUTIONS, targetSize, type Preset } from "@/tools/image/video";
import { KreaError } from "@/tools/types";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

type Mode = "compress" | "gif";
interface Loaded {
  file: File;
  url: string;
  info: VideoInfo;
}
interface Result {
  blob: Blob;
  url: string;
  name: string;
  seconds: number;
  kind: Mode;
}

const selectClass = "min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted";
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv";

export default function VideoEditor() {
  // Nothing is saved: the video and the result live in memory until the tab is closed.
  const [supported] = useState(videoSupported);
  const [video, setVideo] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<Mode>("compress");
  const [preset, setPreset] = useState<Preset>("balanced");
  const [resolution, setResolution] = useState(720);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [gifStart, setGifStart] = useState(0);
  const [gifLength, setGifLength] = useState(3);
  const [gifWidth, setGifWidth] = useState<number>(480);
  const [gifFps, setGifFps] = useState<number>(10);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);
  const cancel = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const tabsId = useId();
  const resolutionId = useId();
  const { setNotice } = useSession();

  // Release object URLs when they are replaced or the editor closes.
  useEffect(() => () => {
    if (video) URL.revokeObjectURL(video.url);
  }, [video]);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Masyadong malaki ang video (${formatBytes(file.size)}). Up to ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }
    setOpening(true);
    try {
      const info = await probeVideo(file);
      if (!info.canDecode) throw new KreaError("unsupported", `This browser cannot read ${info.videoCodec ?? "this"} video. Try Chrome or Edge, or another video.`);
      setVideo({ file, url: URL.createObjectURL(file), info });
      setResult(null);
      setStart(0);
      setEnd(Math.round(info.duration * 10) / 10);
      setGifStart(0);
      setGifLength(Math.min(3, Math.floor(info.duration * 10) / 10 || 1));
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Hindi mabuksan ang video.");
    } finally {
      setOpening(false);
    }
  };

  const run = async () => {
    if (!video) return;
    const controller = new AbortController();
    cancel.current = controller;
    setProgress(0);
    setResult(null);
    const began = performance.now();
    try {
      const blob =
        mode === "compress"
          ? await compressVideo(video.file, video.info, { preset, resolution, removeAudio, start, end, signal: controller.signal, onProgress: setProgress })
          : await videoToGif(video.file, video.info, { start: gifStart, length: gifLength, fps: gifFps, width: gifWidth, signal: controller.signal, onProgress: setProgress });
      if (controller.signal.aborted) return;
      const name = renameFile(video.file.name, mode === "compress" ? "mp4" : "gif", mode === "compress" ? "-compressed" : "");
      setResult({ blob, url: URL.createObjectURL(blob), name, seconds: (performance.now() - began) / 1000, kind: mode });
      setNotice(mode === "compress" ? "Tapos na ang compress." : "Tapos na ang GIF.");
    } catch (failure) {
      if (controller.signal.aborted) setNotice("Cancelled. Walang na-save.");
      else setError(failure instanceof Error && failure.message ? failure.message : "Hindi natapos. Try again with smaller settings.");
    } finally {
      cancel.current = null;
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const info = video?.info;
  const outSize = info ? targetSize(info.width, info.height, resolution) : null;
  const gifDims = info ? gifSize(info.width, info.height, gifWidth) : null;
  const setFromPlayer = (setter: (value: number) => void) => () => setter(Math.round((player.current?.currentTime ?? 0) * 10) / 10);

  const form = (
    <>
      <Group title="Video">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            open(event.dataTransfer.files[0]);
          }}
          className={`rounded-lg border border-dashed p-4 text-center ${dragging ? "border-accent bg-raised" : "border-line"}`}
        >
          <p className="text-sm text-fg">{video ? video.file.name : "I-drop o pumili ng video."}</p>
          {info && video && (
            <p className="mt-1 font-mono text-xs text-muted">
              {info.width} × {info.height} · {formatDuration(info.duration)} · {formatBytes(video.file.size)} · {info.videoCodec ?? "?"}
              {info.hasAudio ? ` + ${info.audioCodec ?? "audio"}` : ", no audio"}
            </p>
          )}
          <Button className="mt-3" variant={video ? "outline" : "primary"} onClick={() => fileInput.current?.click()} disabled={opening || busy || !supported}>
            <Film aria-hidden className="size-4" strokeWidth={1.75} />
            {opening ? "Opening…" : video ? "Open another video" : "Choose a video"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={VIDEO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              open(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {!supported && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            This browser has no video encoder (WebCodecs). Use a recent Chrome, Edge, Samsung Internet, Safari 16.4+ or desktop Firefox 130+.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            {error}
          </p>
        )}
      </Group>

      <div role="tablist" aria-label="Video tools" onKeyDown={onTabListKeyDown} className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1">
        {(
          [
            ["compress", "Compress"],
            ["gif", "To GIF"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${id}`}
            aria-selected={mode === id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={mode === id ? 0 : -1}
            onClick={() => setMode(id)}
            disabled={busy}
            className={`min-h-10 rounded px-2 text-sm transition-colors ${mode === id ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${mode}`} className="flex flex-col gap-5">
        {mode === "compress" ? (
          <Group title="Compress">
            <Segmented label="Quality" value={preset} onChange={setPreset} options={PRESETS.map((entry) => ({ value: entry.id, label: entry.label }))} />
            <div>
              <label htmlFor={resolutionId} className="mb-1.5 block text-sm text-fg">
                Resolution
              </label>
              <select id={resolutionId} value={resolution} onChange={(event) => setResolution(Number(event.target.value))} className={selectClass} aria-describedby={`${resolutionId}-hint`}>
                {RESOLUTIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <p id={`${resolutionId}-hint`} className="mt-1.5 font-mono text-xs text-muted">
                {outSize ? `Output ${outSize.width} × ${outSize.height}` : "The shorter side is capped, so portrait videos work the same."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Start" unit="s" value={start} onChange={setStart} step={0.1} />
              <NumberInput label="End" unit="s" value={end} onChange={setEnd} step={0.1} />
            </div>
            {video && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={setFromPlayer(setStart)}>Start = player time</Button>
                <Button onClick={setFromPlayer(setEnd)}>End = player time</Button>
              </div>
            )}
            <label className="flex min-h-10 items-center gap-3 text-sm text-fg">
              <input type="checkbox" checked={removeAudio} onChange={(event) => setRemoveAudio(event.target.checked)} className="size-5 accent-lime" />
              Remove audio
            </label>
          </Group>
        ) : (
          <Group title="To GIF">
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Start" unit="s" value={gifStart} onChange={setGifStart} step={0.1} />
              <NumberInput label="Length" unit="s" value={gifLength} onChange={(value) => setGifLength(Math.min(GIF_MAX_SECONDS, value))} step={0.5} hint={`Up to ${GIF_MAX_SECONDS} seconds.`} />
            </div>
            {video && <Button onClick={setFromPlayer(setGifStart)}>Start = player time</Button>}
            <Segmented label="Width" value={String(gifWidth)} onChange={(value) => setGifWidth(Number(value))} options={GIF_WIDTHS.map((value) => ({ value: String(value), label: `${value}px` }))} />
            <Segmented label="Frames per second" value={String(gifFps)} onChange={(value) => setGifFps(Number(value))} options={GIF_FPS.map((value) => ({ value: String(value), label: `${value} fps` }))} />
            {gifDims && (
              <p className="font-mono text-xs text-muted">
                {gifDims.width} × {gifDims.height}, {Math.max(1, Math.floor(Math.min(gifLength, GIF_MAX_SECONDS) * gifFps))} frames, no sound
              </p>
            )}
          </Group>
        )}
        <p className="text-xs leading-relaxed text-muted">Uses your browser&apos;s own video encoder. Long or 4K videos can take minutes and need a lot of memory on phones. Hindi ina-upload ang video.</p>
      </div>
    </>
  );

  const ratio = result && video && result.kind === "compress" ? result.blob.size / video.file.size : null;
  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{video ? "Original" : "Your video"}</h2>
      {video ? (
        <video ref={player} src={video.url} controls playsInline preload="metadata" aria-label={`Original video, ${video.file.name}`} className="max-h-[50vh] w-full rounded-lg bg-ink" />
      ) : (
        <div className="checkerboard flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-line p-6 text-center">
          <Clapperboard aria-hidden className="size-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Open a video to start. Nothing is uploaded.</p>
        </div>
      )}
      {busy && (
        <div>
          <div className="mb-1 flex justify-between font-mono text-xs text-muted">
            <span>{mode === "compress" ? "Compressing" : "Making GIF"}</span>
            <span>{Math.round((progress ?? 0) * 100)}%</span>
          </div>
          <div role="progressbar" aria-label={mode === "compress" ? "Compress progress" : "GIF progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)} className="h-2 overflow-hidden rounded-full bg-ink">
            <div className="h-full bg-lime transition-[width] motion-reduce:transition-none" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}
      {result && (
        <section aria-label="Result" className="flex flex-col gap-3 border-t border-line pt-4">
          <h2 className="text-xs uppercase tracking-widest text-muted">Result</h2>
          {result.kind === "compress" ? (
            <video src={result.url} controls playsInline preload="metadata" aria-label="Compressed video" className="max-h-[50vh] w-full rounded-lg bg-ink" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not an optimisable asset
            <img src={result.url} alt="The GIF you made" className="mx-auto max-h-[50vh] max-w-full rounded-lg" />
          )}
          <p className="font-mono text-sm text-fg" data-result-size={result.blob.size}>
            {formatBytes(result.blob.size)}
            {ratio !== null && video && <span className="text-muted"> from {formatBytes(video.file.size)} ({ratio < 1 ? `${Math.round((1 - ratio) * 100)}% smaller` : "not smaller"})</span>}
            <span className="text-muted"> · {result.seconds.toFixed(1)} s</span>
          </p>
          {ratio !== null && ratio >= 1 && (
            <p role="note" className="flex gap-2 rounded-md border border-signal/60 p-3 text-sm text-fg">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.75} />
              Hindi lumiit: this video is already well compressed. Try Smallest or a lower resolution, or keep the original.
            </p>
          )}
        </section>
      )}
    </div>
  );

  const actions = busy ? (
    <Button onClick={() => cancel.current?.abort()}>
      <X aria-hidden className="size-4" strokeWidth={1.75} />
      Cancel
    </Button>
  ) : (
    <>
      <Button variant="primary" onClick={run} disabled={!video}>
        <Clapperboard aria-hidden className="size-4" strokeWidth={2} />
        {mode === "compress" ? "Compress" : "Make GIF"}
      </Button>
      {result && (
        <Button onClick={() => downloadBlob(result.blob, result.name)}>
          <Download aria-hidden className="size-4" strokeWidth={1.75} />
          Download {result.kind === "compress" ? "MP4" : "GIF"}
        </Button>
      )}
    </>
  );

  return <EditorShell label="Video compressor and GIF maker" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
