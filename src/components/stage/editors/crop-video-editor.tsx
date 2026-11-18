"use client";

import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { renameFile } from "@/lib/file-type";
import { CONTAINERS, cropVideo } from "@/lib/video";
import { ASPECTS, clampBox, evenRect, fitAspect, rotatedSize, transformFor, type AspectId, type Rect, type Rotation } from "@/tools/image/video-crop";
import { Group } from "./form";
import { EditorShell } from "./editor-shell";
import { JobActions, JobError, JobProgress, JobResult, PHONE_NOTE, useVideoFile, useVideoJob, VideoPicker, VideoPlaceholder } from "./video-shared";

/** Preview canvas long side (pixels); the crop itself uses full resolution. */
const PREVIEW = 960;

type Drag = { kind: "move"; dx: number; dy: number } | { kind: "resize"; ax: number; ay: number };

export default function CropVideoEditor() {
  // Nothing is saved: the video and the result live in memory until the tab is closed.
  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspect, setAspect] = useState<AspectId>("free");
  const [box, setBox] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);
  const player = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const job = useVideoJob();
  const source = useVideoFile(() => {
    job.clear();
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setBox(null);
  });
  const video = source.video;
  const frame = video ? rotatedSize(video.info.width, video.info.height, rotation) : null;
  const ratio = ASPECTS.find((entry) => entry.id === aspect)?.ratio ?? 0;
  const current = frame ? (box ?? fitAspect(frame.width, frame.height, ratio)) : null;
  const final = frame && current ? evenRect(current, frame.width, frame.height) : null;
  const whole = !!(frame && final && final.w >= frame.width - 1 && final.h >= frame.height - 1);

  const reset = (nextAspect: AspectId, nextRotation: Rotation) => {
    if (!video) return;
    const size = rotatedSize(video.info.width, video.info.height, nextRotation);
    setBox(fitAspect(size.width, size.height, ASPECTS.find((entry) => entry.id === nextAspect)?.ratio ?? 0));
  };

  // Redraw the preview frame when the video moves or the settings change.
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

  useEffect(() => {
    const el = canvas.current;
    const media = player.current;
    if (!el || !media || !frame || !current || !video) return;
    const scale = Math.min(1, PREVIEW / Math.max(frame.width, frame.height));
    el.width = Math.round(frame.width * scale);
    el.height = Math.round(frame.height * scale);
    const ctx = el.getContext("2d")!;
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.translate(el.width / 2, el.height / 2);
    // Same order as the export: rotate, then flip.
    const { rotate, flip } = transformFor(rotation, flipH, flipV);
    if (flip) ctx.scale(-1, 1);
    ctx.rotate((rotate * Math.PI) / 180);
    const w = video.info.width * scale;
    const h = video.info.height * scale;
    if (media.readyState >= 2) ctx.drawImage(media, -w / 2, -h / 2, w, h);
    ctx.restore();
    // Dim outside the crop, then outline it. Fixed colours: drawn on the video picture itself.
    const r = { x: current.x * scale, y: current.y * scale, w: current.w * scale, h: current.h * scale };
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, el.width, el.height);
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill("evenodd");
    const ratioPx = el.width / Math.max(1, el.getBoundingClientRect().width);
    ctx.lineWidth = 3 * ratioPx;
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 1.5 * ratioPx;
    ctx.strokeStyle = "#c6ff3d";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const size = 12 * ratioPx;
    ctx.fillStyle = "#c6ff3d";
    for (const [cx, cy] of [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ])
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  }, [tick, frame, current, rotation, flipH, flipV, video]);

  /** Pointer position in full-resolution picture pixels, and how many of those make one CSS pixel. */
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const per = (frame?.width ?? 1) / rect.width;
    return { x: (event.clientX - rect.left) * per, y: (event.clientY - rect.top) * per, per };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!current || !frame) return;
    const { x, y, per } = point(event);
    const reach = 28 * per;
    const corners = [
      [current.x, current.y, current.x + current.w, current.y + current.h],
      [current.x + current.w, current.y, current.x, current.y + current.h],
      [current.x, current.y + current.h, current.x + current.w, current.y],
      [current.x + current.w, current.y + current.h, current.x, current.y],
    ];
    const hit = corners.find(([cx, cy]) => Math.hypot(cx - x, cy - y) <= reach);
    if (hit) drag.current = { kind: "resize", ax: hit[2], ay: hit[3] };
    else if (x >= current.x && x <= current.x + current.w && y >= current.y && y <= current.y + current.h) drag.current = { kind: "move", dx: x - current.x, dy: y - current.y };
    else return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !current || !frame) return;
    const { x, y } = point(event);
    const d = drag.current;
    if (d.kind === "move") {
      setBox(clampBox({ ...current, x: x - d.dx, y: y - d.dy }, frame.width, frame.height, 0, 1));
      return;
    }
    const px = Math.max(0, Math.min(frame.width, x));
    const py = Math.max(0, Math.min(frame.height, y));
    let w = Math.abs(px - d.ax);
    let h = Math.abs(py - d.ay);
    if (ratio) {
      if (w / Math.max(h, 1) > ratio) h = w / ratio;
      else w = h * ratio;
    }
    // Keep the anchor corner fixed and the box inside the picture.
    const maxW = px >= d.ax ? frame.width - d.ax : d.ax;
    const maxH = py >= d.ay ? frame.height - d.ay : d.ay;
    if (w > maxW) {
      w = maxW;
      if (ratio) h = w / ratio;
    }
    if (h > maxH) {
      h = maxH;
      if (ratio) w = h * ratio;
    }
    w = Math.max(32, w);
    h = Math.max(32, h);
    setBox({ x: px >= d.ax ? d.ax : d.ax - w, y: py >= d.ay ? d.ay : d.ay - h, w, h });
  };

  /** Arrows move the box by 1% (Shift+arrows resize it). */
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!current || !frame) return;
    const step = Math.max(2, Math.round(Math.max(frame.width, frame.height) * 0.01));
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    if (event.shiftKey) {
      const w = current.w + move[0] + (ratio ? move[1] * ratio : 0);
      const h = ratio ? w / ratio : current.h + move[1];
      setBox(clampBox({ ...current, w, h }, frame.width, frame.height, ratio));
    } else setBox(clampBox({ ...current, x: current.x + move[0], y: current.y + move[1] }, frame.width, frame.height, 0, 1));
  };

  const turn = (delta: number) => {
    const next = (((rotation + delta) % 360) + 360) % 360 as Rotation;
    setRotation(next);
    reset(aspect, next);
  };

  const run = () => {
    if (!video || !final) return;
    const { rotate, flip } = transformFor(rotation, flipH, flipV);
    job.run(async (control) => {
      const { blob, container } = await cropVideo(video.file, video.info, { rotate, flip, crop: whole ? null : { left: final.x, top: final.y, width: final.w, height: final.h }, ...control });
      return { blob, name: renameFile(video.file.name, CONTAINERS[container].ext, "-cropped"), kind: "video", note: `${final.w} × ${final.h}${rotation ? `, rotated ${rotation}°` : ""}${flipH ? ", flipped horizontally" : ""}${flipV ? ", flipped vertically" : ""}.` };
    }, "Tapos na ang crop.");
  };

  const changed = !!video && (!whole || rotation !== 0 || flipH || flipV);

  const form = (
    <>
      <VideoPicker state={source} busy={job.busy} />
      <Group title="Shape">
        <div role="radiogroup" aria-label="Crop shape" className="grid grid-cols-5 gap-1 rounded-md border border-line bg-ink p-1">
          {ASPECTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={aspect === entry.id}
              onClick={() => {
                setAspect(entry.id);
                reset(entry.id, rotation);
              }}
              className={`min-h-10 rounded px-1 font-mono text-sm ${aspect === entry.id ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => turn(-90)} disabled={!video}>
            <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
            Rotate left
          </Button>
          <Button onClick={() => turn(90)} disabled={!video}>
            <RotateCw aria-hidden className="size-4" strokeWidth={1.75} />
            Rotate right
          </Button>
          <Button onClick={() => setFlipH((value) => !value)} disabled={!video} aria-pressed={flipH}>
            <FlipHorizontal2 aria-hidden className="size-4" strokeWidth={1.75} />
            Flip horizontal
          </Button>
          <Button onClick={() => setFlipV((value) => !value)} disabled={!video} aria-pressed={flipV}>
            <FlipVertical2 aria-hidden className="size-4" strokeWidth={1.75} />
            Flip vertical
          </Button>
        </div>
        {final && (
          <p className="font-mono text-xs text-muted" data-crop={`${final.x},${final.y},${final.w},${final.h}`}>
            Output {final.w} × {final.h}
            {current && (Math.round(current.w) !== final.w || Math.round(current.h) !== final.h) ? " (rounded to even numbers for the encoder)" : ""}
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted">Drag inside the box to move it and its corners to resize it. With a keyboard: focus the picture, arrows move the box, Shift+arrows resize it.</p>
      </Group>
      <p className="text-xs leading-relaxed text-muted">{PHONE_NOTE}</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{video ? "Crop" : "Your video"}</h2>
      {video ? (
        <>
          <canvas
            ref={canvas}
            tabIndex={0}
            role="img"
            aria-label={`Crop preview: ${final ? `${final.w} by ${final.h} pixels` : ""}. Arrow keys move the box, Shift+arrows resize it.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={onKeyDown}
            className="mx-auto block h-auto max-h-[55vh] w-auto max-w-full touch-none"
          />
          <video ref={player} src={video.url} controls playsInline muted preload="auto" aria-label="Original video: play or scrub to choose the frame shown above" className="max-h-40 w-full rounded-lg bg-ink" />
        </>
      ) : (
        <VideoPlaceholder icon={<Crop aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} />
      )}
      <JobProgress job={job} label="Cropping" />
      <JobError job={job} />
      <JobResult job={job} original={video?.file.size} />
    </div>
  );

  const actions = <JobActions job={job} ready={changed} runLabel="Crop" onRun={run} icon={<Crop aria-hidden className="size-4" strokeWidth={2} />} />;
  return <EditorShell label="Video crop and rotate" form={form} preview={preview} actions={actions} previewLabel="Video" />;
}
