"use client";

import { FileVideo } from "lucide-react";
import { useId, useState } from "react";
import { renameFile } from "@/lib/file-type";
import { CONTAINERS, convertVideo, type Container } from "@/lib/video";
import { PRESETS, RESOLUTIONS, targetSize, type Preset } from "@/tools/image/video";
import { CODEC_NOTE, TARGETS } from "@/tools/image/video-convert";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";

const CODEC_NAME: Record<string, string> = { avc: "H.264", hevc: "HEVC (H.265)", vp9: "VP9", vp8: "VP8", av1: "AV1", aac: "AAC", opus: "Opus", vorbis: "Vorbis", mp3: "MP3" };
const name = (codec: string | null) => (codec ? (CODEC_NAME[codec] ?? codec) : "none");

export default function ConvertVideoEditor() {
  // Nothing is saved: the video and the result live in memory until the tab is closed.
  const [target, setTarget] = useState<Container>("mp4");
  const [quality, setQuality] = useState<"copy" | Preset>("copy");
  const [resolution, setResolution] = useState(0);
  const job = useVideoJob();
  const source = useVideoFile(() => job.clear());
  const resolutionId = useId();
  const video = source.video;
  const info = video?.info;
  const outSize = info ? targetSize(info.width, info.height, quality === "copy" ? 0 : resolution) : null;

  const run = () => {
    if (!video) return;
    job.run(async (control) => {
      const result = await convertVideo(video.file, video.info, { target, quality, resolution, ...control });
      const codecs = `${name(result.videoCodec)}${result.audioCodec ? ` + ${name(result.audioCodec)}` : ""}`;
      const dropped = result.dropped.length ? ` Dropped: ${result.dropped.join("; ")}.` : "";
      return {
        blob: result.blob,
        name: renameFile(video.file.name, CONTAINERS[target].ext, video.file.name.toLowerCase().endsWith(`.${CONTAINERS[target].ext}`) ? "-converted" : ""),
        kind: "video",
        note: result.copied ? `Copied without re-encoding (${codecs}), so the quality is unchanged.` : `Re-encoded to ${codecs}.${quality === "copy" ? " The original codecs do not fit this format, so it could not be copied." : ""}${dropped}`,
      };
    }, "Tapos na ang convert.");
  };

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy} />
      <Group title="Convert to">
        <Segmented label="Format" value={target} onChange={setTarget} options={TARGETS.map((value) => ({ value, label: CONTAINERS[value].label }))} />
        <p className="text-xs leading-relaxed text-muted" data-codec-note>
          {CODEC_NOTE[target as (typeof TARGETS)[number]]}
        </p>
        <Segmented
          label="Quality"
          value={quality}
          onChange={setQuality}
          options={[{ value: "copy" as const, label: "Original" }, ...PRESETS.map((entry) => ({ value: entry.id, label: entry.label }))]}
        />
        {quality === "copy" ? (
          <p className="text-xs leading-relaxed text-muted">Copies the video and sound as they are when the new format allows it (no quality loss, very fast); otherwise re-encodes at high quality.</p>
        ) : (
          <div>
            <label htmlFor={resolutionId} className="mb-1.5 block text-sm text-fg">
              Resolution
            </label>
            <select id={resolutionId} value={resolution} onChange={(event) => setResolution(Number(event.target.value))} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
              {RESOLUTIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            {outSize && <p className="mt-1.5 font-mono text-xs text-muted">Output {outSize.width} × {outSize.height}</p>}
          </div>
        )}
        {info && (
          <p className="font-mono text-xs text-muted">
            Input: {name(info.videoCodec)}
            {info.hasAudio ? ` + ${name(info.audioCodec)}` : ", no sound"}
          </p>
        )}
      </Group>
      <p className="text-xs leading-relaxed text-muted">{PHONE_NOTE} Videos your browser cannot decode (often HEVC outside Safari and Edge, ProRes, or AC-3/DTS sound) are refused with a message.</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{video ? "Original" : "Your video"}</h2>
      {video ? (
        <video src={video.url} controls playsInline preload="metadata" aria-label={`Original video, ${video.file.name}`} className="max-h-[50vh] w-full rounded-lg bg-ink" />
      ) : (
        <VideoPlaceholder icon={<FileVideo aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label="Converting" />
      <JobError job={job} />
      <JobResult job={job} original={video?.file.size} />
    </div>
  );

  const actions = <JobActions job={job} ready={!!video} runLabel="Convert" onRun={run} icon={<FileVideo aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Video format converter" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
