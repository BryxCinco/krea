"use client";

import { ImagePlus, Stamp } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { detectFileType, renameFile } from "@/lib/file-type";
import { CONTAINERS, watermarkVideo } from "@/lib/video";
import { drawWatermark, SPOT_LABEL, SPOTS, type WatermarkSettings } from "@/tools/image/video-watermark";
import { ColorInput, Group, Segmented, TextInput } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";

const PREVIEW = 960;
const MAX_LOGO_PIXELS = 16_000_000;

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm text-fg">
        {label}
        <span className="font-mono text-xs text-muted">
          {value}
          {unit}
        </span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-lime" />
    </div>
  );
}

export default function WatermarkVideoEditor() {
  // Nothing is saved: the video, logo and result live in memory until the tab is closed.
  const [settings, setSettings] = useState<WatermarkSettings>({ kind: "text", text: "@yourpage", color: "#ffffff", size: 6, opacity: 70, margin: 4, spot: "br", x: 0.5, y: 0.5, tile: false, shadow: true });
  const [logo, setLogo] = useState<ImageBitmap | null>(null);
  const [logoName, setLogoName] = useState("");
  const [logoError, setLogoError] = useState("");
  const [tick, setTick] = useState(0);
  const player = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const job = useVideoJob();
  const source = useVideoFile(() => job.clear());
  const video = source.video;
  const set = (patch: Partial<WatermarkSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const family = typeof window !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
  const full = { ...settings, family };
  const ready = !!video && (settings.kind === "text" ? !!settings.text.trim() : !!logo);

  useEffect(() => () => logo?.close(), [logo]);

  const openLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError("");
    const detected = await detectFileType(file, file.name);
    if (detected.kind !== "image") {
      setLogoError("Choose a PNG, JPG or WebP image for the logo.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > MAX_LOGO_PIXELS) {
        bitmap.close();
        setLogoError("Masyadong malaki ang logo. Use an image under 16 MP.");
        return;
      }
      setLogo(bitmap);
      setLogoName(file.name);
      set({ kind: "logo", size: 18 });
    } catch {
      setLogoError("Hindi mabuksan ang logo image.");
    }
  };

  useEffect(() => {
    const el = player.current;
    if (!el) return;
    const redraw = () => setTick((value) => value + 1);
    el.addEventListener("loadeddata", redraw);
    el.addEventListener("seeked", redraw);
    el.addEventListener("timeupdate", redraw);
    return () => {
      el.removeEventListener("loadeddata", redraw);
      el.removeEventListener("seeked", redraw);
      el.removeEventListener("timeupdate", redraw);
    };
  }, [video]);

  // Live preview: the current frame with the same overlay the export draws, scaled down.
  useEffect(() => {
    const el = canvas.current;
    const media = player.current;
    if (!el || !media || !video) return;
    const scale = Math.min(1, PREVIEW / Math.max(video.info.width, video.info.height));
    el.width = Math.round(video.info.width * scale);
    el.height = Math.round(video.info.height * scale);
    const ctx = el.getContext("2d")!;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, el.width, el.height);
    if (media.readyState >= 2) ctx.drawImage(media, 0, 0, el.width, el.height);
    drawWatermark(ctx, el.width, el.height, { ...settings, family }, logo);
  }, [tick, settings, logo, video, family]);

  const place = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    set({ spot: "custom", tile: false, x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const scale = event.shiftKey ? 5 : 1;
    setSettings((current) => {
      const base = current.spot === "custom" ? current : { ...current, x: 0.5, y: 0.5 };
      return { ...base, spot: "custom", x: Math.max(0, Math.min(1, base.x + move[0] * scale)), y: Math.max(0, Math.min(1, base.y + move[1] * scale)) };
    });
  };

  const run = () => {
    if (!video || !ready) return;
    const snapshot = { ...full };
    const mark = logo;
    job.run(async (control) => {
      const { blob, container } = await watermarkVideo(video.file, video.info, { draw: (ctx, w, h) => drawWatermark(ctx, w, h, snapshot, mark), ...control });
      return { blob, name: renameFile(video.file.name, CONTAINERS[container].ext, "-watermarked"), kind: "video", note: snapshot.tile ? "Watermark tiled across the video." : "Watermark added." };
    }, "Tapos na ang watermark.");
  };

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy} />
      <Group title="Watermark">
        <Segmented
          label="Type"
          value={settings.kind}
          onChange={(kind) => set({ kind, size: kind === "logo" ? 18 : 6 })}
          options={[
            { value: "text", label: "Text" },
            { value: "logo", label: "Logo image" },
          ]}
        />
        {settings.kind === "text" ? (
          <>
            <TextInput label="Watermark text" value={settings.text} onChange={(text) => set({ text: text.slice(0, 80) })} placeholder="@yourpage" />
            <ColorInput label="Colour" value={settings.color} onChange={(color) => set({ color })} />
            <label className="flex min-h-10 items-center gap-3 text-sm text-fg">
              <input type="checkbox" checked={settings.shadow} onChange={(event) => set({ shadow: event.target.checked })} className="size-5 accent-lime" />
              Soft shadow (easier to read on bright video)
            </label>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Button onClick={() => logoInput.current?.click()}>
              <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
              {logo ? "Choose another logo" : "Choose a logo"}
            </Button>
            {logoName && <p className="break-all font-mono text-xs text-muted">{logoName}</p>}
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              data-testid="logo-file"
              onChange={(event) => {
                openLogo(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {logoError && (
              <p role="alert" className="text-sm text-signal">
                {logoError}
              </p>
            )}
          </div>
        )}
        <Slider label="Size" value={settings.size} min={settings.kind === "logo" ? 4 : 2} max={settings.kind === "logo" ? 60 : 25} step={1} unit="%" onChange={(size) => set({ size })} />
        <Slider label="Opacity" value={settings.opacity} min={5} max={100} step={5} unit="%" onChange={(opacity) => set({ opacity })} />
        <Slider label="Margin" value={settings.margin} min={0} max={15} step={1} unit="%" onChange={(margin) => set({ margin })} />
        <fieldset>
          <legend className="mb-1.5 text-sm text-fg">Position</legend>
          <div role="radiogroup" aria-label="Position" className="grid w-36 grid-cols-3 gap-1 rounded-md border border-line bg-ink p-1">
            {SPOTS.map((spot) => (
              <button
                key={spot}
                type="button"
                role="radio"
                aria-checked={settings.spot === spot && !settings.tile}
                aria-label={SPOT_LABEL[spot]}
                onClick={() => set({ spot, tile: false })}
                className={`flex h-10 items-center justify-center rounded ${settings.spot === spot && !settings.tile ? "bg-raised" : "hover:bg-raised"}`}
              >
                <span className={`size-2.5 rounded-full ${settings.spot === spot && !settings.tile ? "bg-lime" : "bg-muted/60"}`} />
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{settings.spot === "custom" && !settings.tile ? "Custom spot (dragged on the preview)." : "Or drag on the preview to place it anywhere."}</p>
        </fieldset>
        <label className="flex min-h-10 items-center gap-3 text-sm text-fg">
          <input type="checkbox" checked={settings.tile} onChange={(event) => set({ tile: event.target.checked })} className="size-5 accent-lime" />
          Tile across the whole video
        </label>
        <p className="text-xs leading-relaxed text-muted">Use watermarks on your own videos. A visible mark shows where a video came from, but it can be cropped or covered: it is not protection.</p>
      </Group>
      <p className="text-xs leading-relaxed text-muted">{PHONE_NOTE}</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{video ? "Preview" : "Your video"}</h2>
      {video ? (
        <>
          <canvas
            ref={canvas}
            tabIndex={0}
            role="img"
            aria-label="Watermark preview on the current frame. Drag, or use the arrow keys, to move the watermark."
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              place(event);
            }}
            onPointerMove={(event) => dragging.current && place(event)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
            onKeyDown={onKeyDown}
            className="mx-auto block h-auto max-h-[55vh] w-auto max-w-full cursor-move touch-none"
          />
          <video ref={player} src={video.url} controls playsInline muted preload="auto" aria-label="Original video: play or scrub to preview another frame" className="max-h-40 w-full rounded-lg bg-ink" />
        </>
      ) : (
        <VideoPlaceholder icon={<Stamp aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label="Adding watermark" />
      <JobError job={job} />
      <JobResult job={job} original={video?.file.size} />
    </div>
  );

  const actions = <JobActions job={job} ready={ready} runLabel="Add watermark" onRun={run} icon={<Stamp aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Video watermark" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
