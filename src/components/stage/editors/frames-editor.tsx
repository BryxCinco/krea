"use client";

import { Camera, Images, Plus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { renameFile } from "@/lib/file-type";
import { extractFrames } from "@/lib/video";
import { formatDuration } from "@/tools/image/video";
import { cleanTimes, FRAME_FORMATS, FRAME_INTERVALS, FRAME_WIDTHS, frameName, frameSize, intervalTimes, MAX_FRAMES, type FrameFormat } from "@/tools/image/video-frames";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, Timeline, usePlayhead, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";

type Mode = "interval" | "moments";
const round = (value: number) => Math.round(value * 100) / 100;
const PREVIEW_LIMIT = 24;

export default function FramesEditor() {
  // Nothing is saved: the video and the frames live in memory until the tab is closed.
  const [mode, setMode] = useState<Mode>("interval");
  const [every, setEvery] = useState(1);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [moments, setMoments] = useState<number[]>([]);
  const [format, setFormat] = useState<FrameFormat>("jpg");
  const [width, setWidth] = useState(0);
  const [thumbs, setThumbs] = useState<{ url: string; time: number }[]>([]);
  const job = useVideoJob();
  const source = useVideoFile((loaded) => {
    job.clear();
    setThumbs([]);
    setStart(0);
    setEnd(round(loaded.info.duration));
    setMoments([]);
  });
  const { player, time, seek } = usePlayhead();
  const intervalId = useId();
  const widthId = useId();
  const video = source.video;
  const info = video?.info;

  // Free the preview images when they are replaced or the editor closes.
  useEffect(() => () => thumbs.forEach((thumb) => URL.revokeObjectURL(thumb.url)), [thumbs]);

  const times = info ? (mode === "interval" ? intervalTimes(start, end, every, info.duration) : cleanTimes(moments, info.duration)) : [];
  const tooMany = times.length > MAX_FRAMES;
  const outSize = info ? frameSize(info.width, info.height, width) : null;

  const run = () => {
    if (!video || !times.length || tooMany) return;
    setThumbs([]);
    job.run(async (control) => {
      const frames = await extractFrames(video.file, video.info, { times, format, width, ...control });
      const spec = FRAME_FORMATS[format];
      const base = video.file.name.replace(/\.[^.]+$/, "") || "frame";
      setThumbs(frames.slice(0, PREVIEW_LIMIT).map((frame) => ({ url: URL.createObjectURL(frame.blob), time: frame.time })));
      const missed = times.length - frames.length;
      const note = missed > 0 ? ` ${missed} moment${missed === 1 ? "" : "s"} had no frame to read.` : "";
      if (frames.length === 1) {
        return { blob: frames[0].blob, name: frameName(base, frames[0].time, spec.ext), kind: "image", note: `Frame at ${formatDuration(frames[0].time)}, ${outSize?.width} × ${outSize?.height}.${note}` };
      }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const used = new Set<string>();
      frames.forEach((frame, i) => {
        let name = frameName(base, frame.time, spec.ext);
        // Two asked times can land on the same frame; keep both files.
        if (used.has(name)) name = name.replace(/(\.[^.]+)$/, `-${i + 1}$1`);
        used.add(name);
        zip.file(name, frame.blob);
      });
      // PNG and JPG are already compressed, so STORE avoids wasting time.
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      return { blob, name: renameFile(video.file.name, "zip", "-frames"), kind: "file", note: `${frames.length} ${spec.label} frames, ${outSize?.width} × ${outSize?.height}.${note}` };
    }, "Tapos na ang frames.");
  };

  const addMoment = () => {
    if (!info) return;
    setMoments((list) => cleanTimes([...list, time], info.duration));
  };

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy} />
      <Group title="Frames">
        <Segmented
          label="Which frames"
          value={mode}
          onChange={setMode}
          options={[
            { value: "interval" as const, label: "Every N seconds" },
            { value: "moments" as const, label: "Pick moments" },
          ]}
        />
        {mode === "interval" ? (
          <>
            <div>
              <label htmlFor={intervalId} className="mb-1.5 block text-sm text-fg">
                One frame every
              </label>
              <select id={intervalId} value={every} onChange={(event) => setEvery(Number(event.target.value))} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
                {FRAME_INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {value} {value === 1 ? "second" : "seconds"}
                  </option>
                ))}
              </select>
            </div>
            {info && (
              <Timeline
                duration={info.duration}
                start={start}
                end={end}
                playhead={time}
                onSeek={seek}
                label="Part to sample"
                onChange={(nextStart, nextEnd) => {
                  setStart(nextStart);
                  if (nextEnd !== undefined) setEnd(nextEnd);
                }}
              />
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-muted">Play or scrub the video, pause on the moment you want, then add it.</p>
            <Button onClick={addMoment} disabled={!info || job.busy}>
              <Plus aria-hidden className="size-4" strokeWidth={1.75} />
              Add frame at <span className="font-mono">{formatDuration(time)}</span>
            </Button>
            {moments.length > 0 && (
              <ul aria-label="Chosen moments" className="flex flex-wrap gap-2">
                {moments.map((moment) => (
                  <li key={moment} className="flex items-center rounded-md border border-line">
                    <button type="button" onClick={() => seek(moment)} className="min-h-10 px-3 font-mono text-xs text-fg hover:text-accent" aria-label={`Go to ${formatDuration(moment)}`}>
                      {formatDuration(moment)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMoments((list) => list.filter((value) => value !== moment))}
                      className="flex min-h-10 min-w-10 items-center justify-center border-l border-line text-muted hover:text-signal"
                      aria-label={`Remove ${formatDuration(moment)}`}
                    >
                      <X aria-hidden className="size-4" strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Group>
      <Group title="Images">
        <Segmented label="Format" value={format} onChange={setFormat} options={(Object.keys(FRAME_FORMATS) as FrameFormat[]).map((value) => ({ value, label: FRAME_FORMATS[value].label }))} />
        <div>
          <label htmlFor={widthId} className="mb-1.5 block text-sm text-fg">
            Size
          </label>
          <select id={widthId} value={width} onChange={(event) => setWidth(Number(event.target.value))} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
            {FRAME_WIDTHS.map((value) => (
              <option key={value} value={value}>
                {value === 0 ? "Original size" : `Up to ${value} px wide`}
              </option>
            ))}
          </select>
          {outSize && <p className="mt-1.5 font-mono text-xs text-muted">Each image {outSize.width} × {outSize.height}</p>}
        </div>
        {info && (
          <p className={`font-mono text-xs ${tooMany ? "text-signal" : "text-muted"}`} data-frame-count={times.length}>
            {times.length} {times.length === 1 ? "frame" : "frames"}
            {times.length > 1 ? ", saved as one ZIP" : ""}
            {tooMany ? `. Up to ${MAX_FRAMES} only: pick a longer interval or a shorter part.` : ""}
          </p>
        )}
      </Group>
      <p className="text-xs leading-relaxed text-muted">{PHONE_NOTE}</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{video ? "Original" : "Your video"}</h2>
      {video ? (
        <video ref={player} src={video.url} controls playsInline preload="metadata" aria-label={`Original video, ${video.file.name}`} className="max-h-[50vh] w-full rounded-lg bg-ink" />
      ) : (
        <VideoPlaceholder icon={<Images aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label="Extracting frames" />
      <JobError job={job} />
      <JobResult job={job} />
      {job.result && job.result.kind === "file" && thumbs.length > 0 && (
        <ul aria-label="Extracted frames" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {thumbs.map((thumb) => (
            <li key={thumb.url} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not an optimisable asset */}
              <img src={thumb.url} alt={`Frame at ${formatDuration(thumb.time)}`} className="aspect-video w-full rounded-md bg-ink object-contain" />
              <span className="font-mono text-[11px] text-muted">{formatDuration(thumb.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const actions = <JobActions job={job} ready={!!video && times.length > 0 && !tooMany} runLabel="Extract frames" onRun={run} icon={<Camera aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Extract frames" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
