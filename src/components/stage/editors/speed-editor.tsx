"use client";

import { Gauge } from "lucide-react";
import { useState } from "react";
import { formatBytes, renameFile } from "@/lib/file-type";
import { MAX_SPEED, MIN_SPEED, SPEEDS } from "@/lib/time-stretch";
import { CONTAINERS, speedVideo } from "@/lib/video";
import { formatDuration } from "@/tools/image/video";
import { speedEstimate } from "@/tools/image/video-speed";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";

export default function SpeedEditor() {
  // Nothing is saved: the video and the result live in memory until the tab is closed.
  const [speed, setSpeed] = useState(2);
  const [audio, setAudio] = useState<"keep" | "mute">("keep");
  const job = useVideoJob();
  const source = useVideoFile(() => job.clear());
  const video = source.video;
  const valid = speed >= MIN_SPEED && speed <= MAX_SPEED && speed !== 1;
  const estimate = video ? speedEstimate(video.info.duration, video.file.size, speed, video.info.hasAudio, audio === "mute") : null;

  const run = () => {
    if (!video || !valid) return;
    job.run(async (control) => {
      const { blob, container } = await speedVideo(video.file, video.info, { speed, audio, ...control });
      const label = String(speed).replace(".", "_");
      return {
        blob,
        name: renameFile(video.file.name, CONTAINERS[container].ext, `-${label}x`),
        kind: "video",
        note: `${speed}x, ${audio === "keep" && video.info.hasAudio ? "audio kept at normal pitch" : "no audio"}.`,
      };
    }, "Tapos na.");
  };

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy} />
      <Group title="Speed">
        <div role="radiogroup" aria-label="Speed presets" className="grid grid-cols-4 gap-1 rounded-md border border-line bg-ink p-1">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={speed === value}
              onClick={() => setSpeed(value)}
              className={`min-h-10 rounded px-1 font-mono text-sm ${speed === value ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
            >
              {value}x
            </button>
          ))}
        </div>
        <NumberInput label="Custom speed" unit="x" value={speed} onChange={(value) => setSpeed(Math.round(value * 100) / 100)} step={0.05} min={MIN_SPEED} hint={`From ${MIN_SPEED}x (slower) to ${MAX_SPEED}x (faster).`} />
        {!valid && (
          <p role="alert" className="text-sm text-signal">
            Pick a speed from {MIN_SPEED}x to {MAX_SPEED}x, other than 1x.
          </p>
        )}
        <Segmented
          label="Audio"
          value={audio}
          onChange={setAudio}
          options={[
            { value: "keep", label: "Keep, normal pitch" },
            { value: "mute", label: "Mute" },
          ]}
        />
        {estimate && video && valid && (
          <p className="font-mono text-xs leading-relaxed text-muted" data-estimate>
            New length {formatDuration(estimate.duration)} (was {formatDuration(video.info.duration)}) · about {formatBytes(estimate.bytes)} (rough estimate)
          </p>
        )}
        {speed < 0.5 && valid && <p className="text-xs leading-relaxed text-muted">Slow motion shows each frame longer; it does not invent new frames, so it can look steppy.</p>}
      </Group>
      <p className="text-xs leading-relaxed text-muted">{PHONE_NOTE} Speed changes always re-encode the video.</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{video ? "Original" : "Your video"}</h2>
      {video ? (
        <video src={video.url} controls playsInline preload="metadata" aria-label={`Original video, ${video.file.name}`} className="max-h-[50vh] w-full rounded-lg bg-ink" />
      ) : (
        <VideoPlaceholder icon={<Gauge aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label="Changing speed" />
      <JobError job={job} />
      <JobResult job={job} original={video?.file.size} />
    </div>
  );

  const actions = <JobActions job={job} ready={!!video && valid} runLabel="Change speed" onRun={run} icon={<Gauge aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Video speed" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
