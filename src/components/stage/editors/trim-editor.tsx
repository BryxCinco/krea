"use client";

import { Scissors } from "lucide-react";
import { useState } from "react";
import { renameFile } from "@/lib/file-type";
import { CONTAINERS, trimVideo } from "@/lib/video";
import { formatDuration } from "@/tools/image/video";
import type { TrimMode } from "@/tools/image/video-trim";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, Timeline, usePlayhead, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";

const round = (value: number) => Math.round(value * 100) / 100;

export default function TrimEditor() {
  // Nothing is saved: the video and the clip live in memory until the tab is closed.
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [mode, setMode] = useState<TrimMode>("fast");
  const job = useVideoJob();
  const source = useVideoFile((loaded) => {
    job.clear();
    setStart(0);
    setEnd(round(loaded.info.duration));
  });
  const { player, time, seek } = usePlayhead();
  const video = source.video;
  const duration = video?.info.duration ?? 0;
  const valid = !!video && end - start >= 0.1;

  const run = () => {
    if (!video) return;
    job.run(async (control) => {
      const result = await trimVideo(video.file, video.info, { start, end, mode, ...control });
      const shift = start - result.actualStart;
      const note = result.reencoded
        ? mode === "fast"
          ? "Re-encoded: this file could not be copied as it is, so Krea re-encoded it with a frame-exact cut."
          : "Re-encoded with a frame-exact cut."
        : `Copied without re-encoding (no quality loss).${
            shift > 0.01
              ? result.container === "mp4" || result.container === "mov"
                ? ` It plays from your exact start; the ${shift.toFixed(2)} s from the key frame at ${formatDuration(result.actualStart)} are kept in the file but hidden.`
                : ` WebM and MKV cannot hide the ${shift.toFixed(2)} s from the key frame at ${formatDuration(result.actualStart)}, so some players show them. Use Exact for a clean start.`
              : ""
          }`;
      return { blob: result.blob, name: renameFile(video.file.name, CONTAINERS[result.container].ext, "-trimmed"), kind: "video", note };
    }, "Tapos na ang trim.");
  };

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy} />
      <Group title="Cut">
        {video ? (
          <Timeline
            duration={duration}
            start={start}
            end={end}
            playhead={time}
            onSeek={seek}
            onChange={(nextStart, nextEnd) => {
              setStart(nextStart);
              if (nextEnd !== undefined) setEnd(nextEnd);
            }}
          />
        ) : (
          <p className="text-sm text-muted">Open a video to see its timeline.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Start" unit="s" value={start} onChange={(value) => setStart(Math.max(0, Math.min(value, duration)))} step={0.1} />
          <NumberInput label="End" unit="s" value={end} onChange={(value) => setEnd(Math.max(0, Math.min(value, duration)))} step={0.1} />
        </div>
        {video && end - start < 0.1 && (
          <p role="alert" className="text-sm text-signal">
            The end must be at least 0.1 s after the start.
          </p>
        )}
        <Segmented
          label="Cut mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "fast", label: "Fast, no re-encode" },
            { value: "exact", label: "Exact frame" },
          ]}
        />
        <p className="text-xs leading-relaxed text-muted">
          {mode === "fast" ? "Copies the video as it is: same quality, done in seconds. Starts at the nearest key frame before your start." : "Re-encodes so the clip starts on the exact frame. Slower, and can lose a little quality."}
        </p>
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
        <VideoPlaceholder icon={<Scissors aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label="Trimming" />
      <JobError job={job} />
      <JobResult job={job} original={video?.file.size} />
    </div>
  );

  const actions = <JobActions job={job} ready={valid} runLabel="Trim" onRun={run} icon={<Scissors aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Video trimmer" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
