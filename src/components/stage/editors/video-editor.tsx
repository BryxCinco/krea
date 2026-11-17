"use client";

import { Clapperboard, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { onTabListKeyDown } from "@/lib/use-focus-trap";
import { renameFile } from "@/lib/file-type";
import { compressVideo, videoToGif } from "@/lib/video";
import { GIF_FPS, GIF_MAX_SECONDS, GIF_WIDTHS, gifSize, PRESETS, RESOLUTIONS, targetSize, type Preset } from "@/tools/image/video";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, usePlayhead, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";
import { Button } from "@/components/ui/button";

type Mode = "compress" | "gif";
const selectClass = "min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted";

export default function VideoEditor() {
  // Nothing is saved: the video and the result live in memory until the tab is closed.
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
  const job = useVideoJob();
  const source = useVideoFile((loaded) => {
    job.clear();
    setStart(0);
    setEnd(Math.round(loaded.info.duration * 10) / 10);
    setGifStart(0);
    setGifLength(Math.min(3, Math.floor(loaded.info.duration * 10) / 10 || 1));
  });
  const { player } = usePlayhead();
  const tabsId = useId();
  const resolutionId = useId();
  const video = source.video;
  const info = video?.info;
  const outSize = info ? targetSize(info.width, info.height, resolution) : null;
  const gifDims = info ? gifSize(info.width, info.height, gifWidth) : null;
  const setFromPlayer = (setter: (value: number) => void) => () => setter(Math.round((player.current?.currentTime ?? 0) * 10) / 10);

  const run = () => {
    if (!video) return;
    if (mode === "compress")
      job.run(async (control) => {
        const blob = await compressVideo(video.file, video.info, { preset, resolution, removeAudio, start, end, ...control });
        const ratio = blob.size / video.file.size;
        return { blob, name: renameFile(video.file.name, "mp4", "-compressed"), kind: "video", note: ratio < 1 ? `${Math.round((1 - ratio) * 100)}% smaller than the original.` : "Not smaller than the original." };
      }, "Tapos na ang compress.");
    else
      job.run(async (control) => ({
        blob: await videoToGif(video.file, video.info, { start: gifStart, length: gifLength, fps: gifFps, width: gifWidth, ...control }),
        name: renameFile(video.file.name, "gif"),
        kind: "image",
      }), "Tapos na ang GIF.");
  };

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy} />
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
            disabled={job.busy}
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
        <p className="text-xs leading-relaxed text-muted">{PHONE_NOTE}</p>
      </div>
    </>
  );

  const ratio = job.result && video && job.result.kind === "video" ? job.result.blob.size / video.file.size : null;
  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{video ? "Original" : "Your video"}</h2>
      {video ? (
        <video ref={player} src={video.url} controls playsInline preload="metadata" aria-label={`Original video, ${video.file.name}`} className="max-h-[50vh] w-full rounded-lg bg-ink" />
      ) : (
        <VideoPlaceholder icon={<Clapperboard aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label={mode === "compress" ? "Compressing" : "Making GIF"} />
      <JobError job={job} />
      <JobResult job={job} original={video?.file.size} />
      {ratio !== null && ratio >= 1 && (
        <p role="note" className="flex gap-2 rounded-md border border-signal/60 p-3 text-sm text-fg">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.75} />
          Hindi lumiit: this video is already well compressed. Try Smallest or a lower resolution, or keep the original.
        </p>
      )}
    </div>
  );

  const actions = <JobActions job={job} ready={!!video} runLabel={mode === "compress" ? "Compress" : "Make GIF"} onRun={run} icon={<Clapperboard aria-hidden className="size-4" strokeWidth={2} />} />;

  return <EditorShell label="Video compressor and GIF maker" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
