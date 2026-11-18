"use client";

import { Music } from "lucide-react";
import { useId, useState } from "react";
import { formatBytes, renameFile } from "@/lib/file-type";
import { AUDIO_FORMATS, extractAudio, type AudioFormat } from "@/lib/video";
import { BITRATES } from "@/tools/image/video-audio";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, Timeline, usePlayhead, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";

const round = (value: number) => Math.round(value * 100) / 100;

export default function AudioEditor() {
  // Nothing is saved: the video and the audio live in memory until the tab is closed.
  const [format, setFormat] = useState<AudioFormat>("mp3");
  const [bitrate, setBitrate] = useState(192_000);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const job = useVideoJob();
  const source = useVideoFile((loaded) => {
    job.clear();
    setStart(0);
    setEnd(round(loaded.info.duration));
  });
  const { player, time, seek } = usePlayhead();
  const bitrateId = useId();
  const video = source.video;
  const noAudio = !!video && !video.info.hasAudio;
  const canCopy = video?.info.audioCodec === "aac";
  const effectiveBitrate = format === "m4a" && bitrate === 0 && !canCopy ? 192_000 : bitrate;
  const seconds = Math.max(0, end - start);
  const estimate = format === "wav" ? seconds * 48_000 * 2 * 2 : (seconds * (effectiveBitrate || 160_000)) / 8;

  const run = () => {
    if (!video || noAudio) return;
    job.run(async (control) => {
      const { blob, copied } = await extractAudio(video.file, video.info, { format, bitrate: format === "mp3" && bitrate === 0 ? 192_000 : effectiveBitrate, start, end, ...control });
      return {
        blob,
        name: renameFile(video.file.name, AUDIO_FORMATS[format].ext),
        kind: "audio",
        note: copied ? "Copied the original AAC sound without re-encoding." : format === "wav" ? "Uncompressed 16-bit WAV." : `${AUDIO_FORMATS[format].label} at ${Math.round((format === "mp3" && bitrate === 0 ? 192_000 : effectiveBitrate) / 1000)} kbps.`,
      };
    }, "Tapos na ang audio.");
  };

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy}>
        {noAudio && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            Walang audio ang video na ito. There is no sound track to extract: try another video.
          </p>
        )}
      </VideoPicker>
      <Group title="Audio">
        <Segmented
          label="Format"
          value={format}
          onChange={(next) => {
            setFormat(next);
            if (next === "mp3" && bitrate === 0) setBitrate(192_000);
          }}
          options={(Object.keys(AUDIO_FORMATS) as AudioFormat[]).map((value) => ({ value, label: AUDIO_FORMATS[value].label }))}
        />
        {format !== "wav" && (
          <div>
            <label htmlFor={bitrateId} className="mb-1.5 block text-sm text-fg">
              Quality
            </label>
            <select id={bitrateId} value={bitrate} onChange={(event) => setBitrate(Number(event.target.value))} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
              {format === "m4a" && canCopy && <option value={0}>Same as original (no re-encode)</option>}
              {BITRATES.map((value) => (
                <option key={value} value={value}>
                  {value / 1000} kbps{value === 192_000 ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {video && !noAudio && (
          <Timeline
            duration={video.info.duration}
            start={start}
            end={end}
            playhead={time}
            onSeek={seek}
            onChange={(nextStart, nextEnd) => {
              setStart(nextStart);
              if (nextEnd !== undefined) setEnd(nextEnd);
            }}
          />
        )}
        {video && !noAudio && (
          <p className="font-mono text-xs text-muted" data-estimate>
            About {formatBytes(estimate)}
            {format === "m4a" && bitrate === 0 ? " (same as the original sound)" : ""}
          </p>
        )}
        {format === "mp3" && <p className="text-xs leading-relaxed text-muted">Browsers cannot make MP3 files on their own, so Krea includes the LAME MP3 encoder. It works offline.</p>}
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
        <VideoPlaceholder icon={<Music aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label="Extracting audio" />
      <JobError job={job} />
      <JobResult job={job} />
    </div>
  );

  const actions = <JobActions job={job} ready={!!video && !noAudio && end - start >= 0.1} runLabel="Extract audio" onRun={run} icon={<Music aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Video to MP3" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
