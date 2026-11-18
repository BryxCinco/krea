"use client";

import { AudioLines, FileMusic, Scissors } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes, MAX_FILE_BYTES, renameFile } from "@/lib/file-type";
import { AUDIO_OUTPUTS, convertAudio, probeAudio, videoSupported, type AudioInfo, type AudioOutput } from "@/lib/video";
import { AUDIO_ACCEPT, MP3_BITRATES } from "@/tools/image/audio-trim";
import { formatDuration } from "@/tools/image/video";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, Timeline, usePlayhead, useVideoJob, VideoPlaceholder } from "./video-shared";

const round = (value: number) => Math.round(value * 100) / 100;
const CODEC_NAME: Record<string, string> = { mp3: "MP3", aac: "AAC", opus: "Opus", vorbis: "Vorbis", flac: "FLAC", "pcm-s16": "PCM", "pcm-s24": "PCM 24-bit", "pcm-f32": "PCM float", alaw: "A-law", ulaw: "µ-law" };

interface Loaded {
  file: File;
  url: string;
  info: AudioInfo;
}

export default function AudioTrimEditor() {
  // Nothing is saved: the recording and the result live in memory until the tab is closed.
  const [audio, setAudio] = useState<Loaded | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [supported] = useState(videoSupported);
  const [format, setFormat] = useState<AudioOutput>("mp3");
  const [bitrate, setBitrate] = useState(192_000);
  const [mono, setMono] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [dragging, setDragging] = useState(false);
  const job = useVideoJob();
  const { player, time, seek } = usePlayhead<HTMLAudioElement>();
  const input = useRef<HTMLInputElement>(null);
  const bitrateId = useId();

  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio.url);
    },
    [audio],
  );

  const open = async (file: File | undefined) => {
    if (!file) return;
    setOpenError("");
    if (file.size > MAX_FILE_BYTES) {
      setOpenError(`Masyadong malaki ang file (${formatBytes(file.size)}). Krea opens up to ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setOpening(true);
    try {
      const info = await probeAudio(file);
      if (!info.canDecode) {
        setOpenError(`This browser cannot decode ${CODEC_NAME[info.codec ?? ""] ?? info.codec ?? "this"} audio. Try Chrome or Edge, or convert the file to MP3 or WAV with another app first.`);
        return;
      }
      job.clear();
      setAudio({ file, url: URL.createObjectURL(file), info });
      setStart(0);
      setEnd(round(info.duration));
      setBitrate(info.codec === "mp3" ? 0 : 192_000);
    } catch (failure) {
      setOpenError(failure instanceof Error && failure.message ? failure.message : "Hindi mabuksan ang audio.");
    } finally {
      setOpening(false);
    }
  };

  const info = audio?.info;
  const canCopy = info?.codec === "mp3" && format === "mp3" && !mono;
  const effectiveBitrate = bitrate === 0 && !canCopy ? 192_000 : bitrate;
  const seconds = Math.max(0, end - start);
  const channels = mono ? 1 : Math.min(2, info?.channels ?? 2);
  const estimate = format === "wav" ? seconds * (info?.sampleRate ?? 44_100) * channels * 2 : (seconds * (effectiveBitrate || 192_000)) / 8;

  const run = () => {
    if (!audio) return;
    job.run(async (control) => {
      const { blob, copied } = await convertAudio(audio.file, audio.info, { format, bitrate: effectiveBitrate, start, end, mono, ...control });
      const sameExt = audio.file.name.toLowerCase().endsWith(`.${AUDIO_OUTPUTS[format].ext}`);
      return {
        blob,
        name: renameFile(audio.file.name, AUDIO_OUTPUTS[format].ext, sameExt ? "-trimmed" : ""),
        kind: "audio",
        note: copied ? "Copied without re-encoding, so the quality is unchanged. Cut at the nearest MP3 frame." : format === "wav" ? `Uncompressed 16-bit WAV${mono ? ", mono" : ""}.` : `MP3 at ${Math.round(effectiveBitrate / 1000)} kbps${mono ? ", mono" : ""}.`,
      };
    }, "Tapos na ang audio.");
  };

  const form = (
    <>
      <Group title="Audio">
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
          <p className="break-all text-sm text-fg">{audio ? audio.file.name : "I-drop o pumili ng audio file."}</p>
          {info && audio && (
            <p className="mt-1 font-mono text-xs text-muted" data-audio-info>
              {formatDuration(info.duration)} · {CODEC_NAME[info.codec ?? ""] ?? info.codec ?? "?"} · {Math.round(info.sampleRate / 100) / 10} kHz · {info.channels === 1 ? "mono" : `${info.channels} ch`} · {formatBytes(audio.file.size)}
            </p>
          )}
          <Button className="mt-3" variant={audio ? "outline" : "primary"} onClick={() => input.current?.click()} disabled={opening || job.busy || !supported}>
            <FileMusic aria-hidden className="size-4" strokeWidth={1.75} />
            {opening ? "Opening…" : audio ? "Open another file" : "Choose an audio file"}
          </Button>
          <input
            ref={input}
            type="file"
            accept={AUDIO_ACCEPT}
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
            This browser has no audio decoder (WebCodecs). Use a recent Chrome, Edge, Samsung Internet, Safari 16.4+ or desktop Firefox 130+.
          </p>
        )}
        {openError && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            {openError}
          </p>
        )}
        {audio && info && (
          <Timeline
            duration={info.duration}
            start={start}
            end={end}
            playhead={time}
            onSeek={seek}
            label="Part to keep"
            onChange={(nextStart, nextEnd) => {
              setStart(nextStart);
              if (nextEnd !== undefined) setEnd(nextEnd);
            }}
          />
        )}
      </Group>
      <Group title="Save as">
        <Segmented label="Format" value={format} onChange={setFormat} options={(Object.keys(AUDIO_OUTPUTS) as AudioOutput[]).map((value) => ({ value, label: AUDIO_OUTPUTS[value].label }))} />
        {format === "mp3" && (
          <div>
            <label htmlFor={bitrateId} className="mb-1.5 block text-sm text-fg">
              Quality
            </label>
            <select id={bitrateId} value={effectiveBitrate} onChange={(event) => setBitrate(Number(event.target.value))} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
              {canCopy && <option value={0}>Same as original (no re-encode)</option>}
              {MP3_BITRATES.map((value) => (
                <option key={value} value={value}>
                  {value / 1000} kbps{value === 192_000 ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-fg">
          <input type="checkbox" checked={mono} onChange={(event) => setMono(event.target.checked)} className="size-5 accent-lime" />
          Mono (half the size, for voice)
        </label>
        {audio && (
          <p className="font-mono text-xs text-muted" data-estimate>
            {formatDuration(seconds)} · about {formatBytes(estimate)}
            {canCopy && bitrate === 0 ? " (same as the original)" : ""}
          </p>
        )}
      </Group>
      <p className="text-xs leading-relaxed text-muted">Uses your browser&apos;s own audio decoder; MP3 is encoded by LAME, included in Krea, and works offline. Hindi ina-upload ang file.</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{audio ? "Original" : "Your audio"}</h2>
      {audio ? (
        <audio ref={player} src={audio.url} controls preload="metadata" aria-label={`Original audio, ${audio.file.name}`} className="w-full" />
      ) : (
        <VideoPlaceholder icon={<AudioLines aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} text="Open an audio file to start. Nothing is uploaded." />
      )}
      <JobProgress job={job} label="Saving audio" />
      <JobError job={job} />
      <JobResult job={job} original={audio?.file.size} />
    </div>
  );

  const actions = <JobActions job={job} ready={!!audio && end - start >= 0.1} runLabel="Trim and save" onRun={run} icon={<Scissors aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Audio trimmer and converter" form={form} preview={preview} actions={actions} previewLabel="Audio" />;
}
