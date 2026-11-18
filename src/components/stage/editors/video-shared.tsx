"use client";

/**
 * Building blocks shared by the video tools (35 onwards): opening a video with the size policy,
 * running a job with progress, ETA and Cancel, showing and downloading the result, and a
 * two-handle timeline. Object URLs are revoked when replaced or when the editor closes.
 */
import { Download, Film, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { probeVideo, videoSupported, type JobControl, type VideoInfo } from "@/lib/video";
import { formatDuration, MAX_VIDEO_BYTES, WARN_VIDEO_BYTES } from "@/tools/image/video";
import { KreaError } from "@/tools/types";
import { Group } from "./form";

export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,video/3gpp,.mp4,.mov,.m4v,.webm,.mkv,.3gp";

export interface LoadedVideo {
  file: File;
  url: string;
  info: VideoInfo;
}

/** Open and probe a video; enforces the size policy and frees the previous one. */
export function useVideoFile(onOpened?: (video: LoadedVideo) => void) {
  const [supported] = useState(videoSupported);
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );
  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Masyadong malaki ang video (${formatBytes(file.size)}). Krea handles up to ${formatBytes(MAX_VIDEO_BYTES)}: trim it on the phone first, or use a computer.`);
      return;
    }
    setOpening(true);
    try {
      const info = await probeVideo(file);
      if (!info.canDecode) throw new KreaError("unsupported", `This browser cannot read ${info.videoCodec ?? "this"} video. Try Chrome or Edge, or another video.`);
      const loaded = { file, url: URL.createObjectURL(file), info };
      setVideo(loaded);
      onOpened?.(loaded);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Hindi mabuksan ang video.");
    } finally {
      setOpening(false);
    }
  };
  return { supported, video, opening, error, setError, open, big: !!video && video.file.size > WARN_VIDEO_BYTES };
}

export function VideoPicker({ state, busy, children }: { state: ReturnType<typeof useVideoFile>; busy: boolean; children?: ReactNode }) {
  const { supported, video, opening, error, open, big } = state;
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const info = video?.info;
  return (
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
        <p className="break-all text-sm text-fg">{video ? video.file.name : "I-drop o pumili ng video."}</p>
        {info && video && (
          <p className="mt-1 font-mono text-xs text-muted" data-video-info>
            {info.width} × {info.height} · {formatDuration(info.duration)} · {formatBytes(video.file.size)} · {info.videoCodec ?? "?"}
            {info.hasAudio ? ` + ${info.audioCodec ?? "audio"}` : ", no audio"}
          </p>
        )}
        <Button className="mt-3" variant={video ? "outline" : "primary"} onClick={() => input.current?.click()} disabled={opening || busy || !supported}>
          <Film aria-hidden className="size-4" strokeWidth={1.75} />
          {opening ? "Opening…" : video ? "Open another video" : "Choose a video"}
        </Button>
        <input
          ref={input}
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
      {big && (
        <p role="note" className="flex gap-2 rounded-md border border-signal/60 p-3 text-sm leading-relaxed text-fg">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.75} />
          Malaking video ito (over {formatBytes(WARN_VIDEO_BYTES)}). On a phone it can run out of memory: work on a shorter part, or use a computer.
        </p>
      )}
      {children}
    </Group>
  );
}

export type ResultKind = "video" | "audio" | "image" | "file";
export interface JobOutput {
  blob: Blob;
  name: string;
  kind: ResultKind;
  /** One line about how it was made (e.g. "Copied without re-encoding"). */
  note?: string;
}
export interface JobResultView extends JobOutput {
  url: string;
  seconds: number;
}

/** Run one job at a time with progress, an ETA, Cancel and a result whose URL is freed when replaced. */
export function useVideoJob() {
  const [progress, setProgress] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [result, setResult] = useState<JobResultView | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const began = useRef(0);
  const { setNotice } = useSession();
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  // Stop a running job if the editor closes.
  useEffect(() => () => controller.current?.abort(), []);

  const onProgress = useCallback((fraction: number) => {
    const value = Math.max(0, Math.min(1, fraction));
    setProgress(value);
    const elapsed = (performance.now() - began.current) / 1000;
    setEta(value > 0.03 && elapsed > 1 ? Math.max(0, (elapsed / value) * (1 - value)) : null);
  }, []);

  const run = async (job: (control: JobControl) => Promise<JobOutput>, done = "Tapos na.") => {
    const abort = new AbortController();
    controller.current = abort;
    began.current = performance.now();
    setError("");
    setResult(null);
    setProgress(0);
    setEta(null);
    try {
      const output = await job({ signal: abort.signal, onProgress });
      if (abort.signal.aborted) return;
      setResult({ ...output, url: URL.createObjectURL(output.blob), seconds: (performance.now() - began.current) / 1000 });
      setNotice(done);
    } catch (failure) {
      if (abort.signal.aborted) setNotice("Cancelled. Walang na-save.");
      else setError(failure instanceof Error && failure.message ? failure.message : "Hindi natapos. Try again with other settings.");
    } finally {
      controller.current = null;
      setProgress(null);
      setEta(null);
    }
  };
  return { run, cancel: () => controller.current?.abort(), busy: progress !== null, progress, eta, result, error, clear: () => setResult(null) };
}

export function JobProgress({ job, label }: { job: ReturnType<typeof useVideoJob>; label: string }) {
  if (!job.busy) return null;
  const percent = Math.round((job.progress ?? 0) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-xs text-muted">
        <span>{label}</span>
        <span>
          {percent}%{job.eta !== null ? ` · about ${job.eta < 60 ? `${Math.ceil(job.eta)} s` : `${Math.ceil(job.eta / 60)} min`} left` : ""}
        </span>
      </div>
      <div role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-ink">
        <div className="h-full bg-lime transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function JobError({ job }: { job: ReturnType<typeof useVideoJob> }) {
  return job.error ? (
    <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
      {job.error}
    </p>
  ) : null;
}

export function JobResult({ job, original }: { job: ReturnType<typeof useVideoJob>; original?: number }) {
  const result = job.result;
  if (!result) return null;
  return (
    <section aria-label="Result" className="flex flex-col gap-3 border-t border-line pt-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">Result</h2>
      {result.kind === "video" && <video src={result.url} controls playsInline preload="metadata" aria-label="Result video" className="max-h-[50vh] w-full rounded-lg bg-ink" />}
      {result.kind === "audio" && <audio src={result.url} controls preload="metadata" aria-label="Result audio" className="w-full" />}
      {result.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not an optimisable asset
        <img src={result.url} alt="Result" className="mx-auto max-h-[50vh] max-w-full rounded-lg" />
      )}
      <p className="font-mono text-sm text-fg" data-result-size={result.blob.size}>
        {result.name} · {formatBytes(result.blob.size)}
        {original ? <span className="text-muted"> from {formatBytes(original)}</span> : null}
        <span className="text-muted"> · {result.seconds.toFixed(1)} s</span>
      </p>
      {result.note && <p className="text-sm text-muted">{result.note}</p>}
    </section>
  );
}

/** Run / Cancel / Download buttons for the action bar. */
export function JobActions({ job, ready, runLabel, onRun, icon }: { job: ReturnType<typeof useVideoJob>; ready: boolean; runLabel: string; onRun: () => void; icon: ReactNode }) {
  if (job.busy)
    return (
      <Button onClick={job.cancel}>
        <X aria-hidden className="size-4" strokeWidth={1.75} />
        Cancel
      </Button>
    );
  return (
    <>
      <Button variant="primary" onClick={onRun} disabled={!ready}>
        {icon}
        {runLabel}
      </Button>
      {job.result && (
        <Button onClick={() => job.result && downloadBlob(job.result.blob, job.result.name)}>
          <Download aria-hidden className="size-4" strokeWidth={1.75} />
          Download {job.result.name.split(".").pop()?.toUpperCase()}
        </Button>
      )}
    </>
  );
}

export function VideoPlaceholder({ icon, text = "Open a video to start. Nothing is uploaded." }: { icon: ReactNode; text?: string }) {
  return (
    <div className="checkerboard flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-line p-6 text-center">
      {icon}
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

export const PHONE_NOTE = "Uses your browser's own video decoder and encoder. Long, 4K or very large videos can take minutes and may run out of memory on phones. Hindi ina-upload ang video.";

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Timeline with a start and an end handle (or one handle when `end` is omitted), plus a playhead.
 * Handles are sliders: arrows move 0.1 s (Shift: 1 s), Home/End jump; drag works with mouse and touch.
 */
export function Timeline({
  duration,
  start,
  end,
  onChange,
  playhead,
  onSeek,
  label = "Selection",
  step = 0.1,
}: {
  duration: number;
  start: number;
  end?: number;
  onChange: (start: number, end?: number) => void;
  playhead?: number;
  onSeek?: (time: number) => void;
  label?: string;
  step?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<"start" | "end" | null>(null);
  const two = end !== undefined;
  const pct = (time: number) => `${(Math.max(0, Math.min(duration, time)) / Math.max(duration, 1e-6)) * 100}%`;
  const timeAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration);
  };
  const set = (which: "start" | "end", time: number) => {
    if (which === "start") onChange(Math.min(time, two ? (end as number) - step : duration), end);
    else onChange(start, Math.max(time, start + step));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const time = timeAt(event.clientX);
    const which = !two || Math.abs(time - start) <= Math.abs(time - (end as number)) ? "start" : "end";
    drag.current = which;
    event.currentTarget.setPointerCapture(event.pointerId);
    set(which, time);
    onSeek?.(time);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const time = timeAt(event.clientX);
    set(drag.current, time);
    onSeek?.(time);
  };
  const keys = (which: "start" | "end") => (event: KeyboardEvent<HTMLDivElement>) => {
    const value = which === "start" ? start : (end as number);
    const big = event.shiftKey ? 1 : step;
    const next = event.key === "ArrowLeft" || event.key === "ArrowDown" ? value - big : event.key === "ArrowRight" || event.key === "ArrowUp" ? value + big : event.key === "Home" ? 0 : event.key === "End" ? duration : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = round(Math.max(0, Math.min(duration, next)));
    set(which, clamped);
    onSeek?.(clamped);
  };
  const handle = (which: "start" | "end", value: number, name: string) => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={round(duration)}
      aria-valuenow={round(value)}
      aria-valuetext={formatDuration(value)}
      onKeyDown={keys(which)}
      className="absolute top-1/2 z-10 flex h-11 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center focus-visible:outline-2 focus-visible:outline-accent"
      style={{ left: pct(value) }}
    >
      <span className="h-9 w-2.5 rounded-sm border border-ink bg-lime" />
    </div>
  );
  return (
    <div>
      <div
        ref={track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative h-12 cursor-pointer touch-none select-none"
        aria-label={label}
        role="group"
      >
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-ink" />
        {two && <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-accent/60" style={{ left: pct(start), width: `calc(${pct(end as number)} - ${pct(start)})` }} />}
        {playhead !== undefined && <div aria-hidden className="absolute top-1 bottom-1 w-0.5 bg-fg" style={{ left: pct(playhead) }} />}
        {handle("start", start, two ? "Start handle" : "Time handle")}
        {two && handle("end", end as number, "End handle")}
      </div>
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{formatDuration(start)}</span>
        {two && <span>Selected {formatDuration((end as number) - start)}</span>}
        {two ? <span>{formatDuration(end as number)}</span> : <span>{formatDuration(duration)}</span>}
      </div>
    </div>
  );
}

/** Keep a media element's current time in state, for the timeline playhead. Pass HTMLAudioElement for audio. */
export function usePlayhead<T extends HTMLMediaElement = HTMLVideoElement>() {
  const player = useRef<T>(null);
  const [time, setTime] = useState(0);
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    const update = () => setTime(el.currentTime);
    el.addEventListener("timeupdate", update);
    el.addEventListener("seeked", update);
    return () => {
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("seeked", update);
    };
  });
  const seek = (value: number) => {
    if (player.current) player.current.currentTime = value;
  };
  return { player, time, seek };
}
