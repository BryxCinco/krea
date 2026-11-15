"use client";

import { Download, ImagePlus, Plus, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { detectFileType, extensionFor, renameFile } from "@/lib/file-type";
import { readMetadata } from "@/lib/image-metadata";
import { useSession } from "@/lib/session";
import { applyBoxes, type RedactBox, type RedactMode } from "@/tools/image/redact";
import { Group } from "./form";
import { EditorShell } from "./editor-shell";

const MODES: { value: RedactMode; label: string }[] = [
  { value: "black", label: "Black out" },
  { value: "pixelate", label: "Pixelate" },
  { value: "blur", label: "Blur" },
];
const MODE_LABEL: Record<RedactMode, string> = { black: "Black out", pixelate: "Pixelate", blur: "Blur" };
/** Decoded photos cost 4 bytes per pixel; past this a phone tab may crash. */
const MAX_PIXELS = 50_000_000;
/** The on-screen preview is drawn at most this wide; export always uses full resolution. */
const PREVIEW_MAX = 1600;

interface Photo {
  bitmap: ImageBitmap;
  name: string;
  /** Output type: the same as the input when the browser can encode it, otherwise PNG. */
  type: string;
  width: number;
  height: number;
}

type Drag =
  | { kind: "draw"; startX: number; startY: number; box: RedactBox }
  | { kind: "move"; id: number; offsetX: number; offsetY: number; before: RedactBox[] }
  | { kind: "resize"; id: number; before: RedactBox[] };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export default function RedactEditor() {
  // Nothing is saved: the photo and boxes live in memory until the tab is closed.
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [history, setHistory] = useState<RedactBox[][]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<RedactMode>("black");
  const [strength, setStrength] = useState(6);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<RedactBox | null>(null);
  const nextId = useRef(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const { setNotice } = useSession();

  const commit = (next: RedactBox[], before = boxes) => {
    setHistory((stack) => [...stack.slice(-49), before]);
    setBoxes(next);
  };
  const undo = () => {
    if (!history.length) return;
    setBoxes(history[history.length - 1]);
    setHistory((stack) => stack.slice(0, -1));
    setSelected(null);
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      let blob: Blob = file;
      let name = file.name;
      const detected = await detectFileType(file, file.name);
      if (detected.kind === "convertible") {
        const { convertToJpeg } = await import("@/lib/heic");
        const converted = await convertToJpeg(file, file.name, detected.mime);
        blob = converted.blob;
        name = converted.name;
      } else if (detected.kind !== "image") {
        setError(detected.unsupported ?? "That is not a photo. Choose a JPG, PNG, WebP or HEIC image.");
        return;
      }
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      if (bitmap.width * bitmap.height > MAX_PIXELS) {
        bitmap.close();
        setError(`Masyadong malaki ang photo (${Math.round((bitmap.width * bitmap.height) / 1e6)} MP). Resize it below ${MAX_PIXELS / 1e6} MP first.`);
        return;
      }
      photo?.bitmap.close();
      const type = detected.kind === "convertible" ? "image/jpeg" : ["image/jpeg", "image/png", "image/webp"].includes(detected.mime) ? detected.mime : "image/png";
      setPhoto({ bitmap, name, type, width: bitmap.width, height: bitmap.height });
      setBoxes([]);
      setHistory([]);
      setSelected(null);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Hindi mabuksan ang photo. It may be damaged.");
    } finally {
      setLoading(false);
    }
  };

  // Free the decoded photo when the editor closes.
  useEffect(() => () => photo?.bitmap.close(), [photo]);

  // Paste a screenshot straight onto the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((entry) => entry.type.startsWith("image/"));
      if (file) open(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // open only uses state setters and the latest photo for cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  const shown = useMemo(() => (live ? [...boxes, live] : boxes), [boxes, live]);

  // Draw the preview: the photo with every effect applied, then box outlines on top.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !photo) return;
    const scale = Math.min(1, PREVIEW_MAX / Math.max(photo.width, photo.height));
    el.width = Math.round(photo.width * scale);
    el.height = Math.round(photo.height * scale);
    const ctx = el.getContext("2d")!;
    ctx.drawImage(photo.bitmap, 0, 0, el.width, el.height);
    applyBoxes(ctx, shown, strength);
    const line = Math.max(2, Math.round(el.width / 400));
    for (const box of shown) {
      const x = box.x * el.width;
      const y = box.y * el.height;
      const w = box.w * el.width;
      const h = box.h * el.height;
      const active = box.id === selected;
      ctx.lineWidth = line * 2;
      ctx.strokeStyle = "#000000";
      ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = line;
      ctx.setLineDash(active ? [] : [line * 3, line * 2]);
      // Outline colours are drawn on the photo itself, so they are fixed for visibility on any image.
      ctx.strokeStyle = active ? "#c6ff3d" : "#ffffff";
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      if (active) {
        const size = line * 6;
        ctx.fillStyle = "#c6ff3d";
        ctx.fillRect(x + w - size / 2, y + h - size / 2, size, size);
        ctx.strokeStyle = "#000000";
        ctx.strokeRect(x + w - size / 2, y + h - size / 2, size, size);
      }
    }
  }, [photo, shown, strength, selected]);

  /** Pointer position on the photo, normalised 0..1. */
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height), rect };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!photo) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y, rect } = point(event);
    // Corner handle of the selected box: resize.
    const current = boxes.find((box) => box.id === selected);
    const grab = 18 / rect.width;
    if (current && Math.abs(x - (current.x + current.w)) < grab && Math.abs(y - (current.y + current.h)) < grab * (rect.width / rect.height)) {
      drag.current = { kind: "resize", id: current.id, before: boxes };
      return;
    }
    // Inside a box (top-most first): select and move.
    const hit = [...boxes].reverse().find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
    if (hit) {
      setSelected(hit.id);
      drag.current = { kind: "move", id: hit.id, offsetX: x - hit.x, offsetY: y - hit.y, before: boxes };
      return;
    }
    const box: RedactBox = { id: nextId.current++, x, y, w: 0, h: 0, mode };
    drag.current = { kind: "draw", startX: x, startY: y, box };
    setSelected(null);
    setLive(box);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current) return;
    const { x, y } = point(event);
    if (current.kind === "draw") {
      const box = { ...current.box, x: Math.min(x, current.startX), y: Math.min(y, current.startY), w: Math.abs(x - current.startX), h: Math.abs(y - current.startY) };
      current.box = box;
      setLive(box);
    } else if (current.kind === "move") {
      setBoxes((list) => list.map((box) => (box.id === current.id ? { ...box, x: clamp(x - current.offsetX, 0, 1 - box.w), y: clamp(y - current.offsetY, 0, 1 - box.h) } : box)));
    } else {
      setBoxes((list) => list.map((box) => (box.id === current.id ? { ...box, w: clamp(x - box.x, 0.005, 1 - box.x), h: clamp(y - box.y, 0.005, 1 - box.y) } : box)));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.kind === "draw") {
      setLive(null);
      const rect = event.currentTarget.getBoundingClientRect();
      // Ignore taps: a box needs some size.
      if (current.box.w * rect.width < 6 || current.box.h * rect.height < 6) return;
      commit([...boxes, current.box]);
      setSelected(current.box.id);
    } else {
      // The move or resize already changed the list; record the state before it for Undo.
      setHistory((stack) => [...stack.slice(-49), current.before]);
    }
  };

  const addBox = () => {
    const box: RedactBox = { id: nextId.current++, x: 0.35, y: 0.4, w: 0.3, h: 0.2, mode };
    commit([...boxes, box]);
    setSelected(box.id);
    canvas.current?.focus();
  };
  const update = (id: number, patch: Partial<RedactBox>) => commit(boxes.map((box) => (box.id === id ? { ...box, ...patch } : box)));
  const remove = (id: number) => {
    commit(boxes.filter((box) => box.id !== id));
    setSelected(null);
  };

  /** Keyboard: arrows move the selected box, Shift+arrows resize it, Delete removes it. */
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const box = boxes.find((entry) => entry.id === selected);
    if (!box) return;
    const step = event.altKey ? 0.002 : 0.01;
    const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(box.id);
    } else if (keys[event.key]) {
      event.preventDefault();
      const [dx, dy] = keys[event.key];
      update(box.id, event.shiftKey ? { w: clamp(box.w + dx, 0.005, 1 - box.x), h: clamp(box.h + dy, 0.005, 1 - box.y) } : { x: clamp(box.x + dx, 0, 1 - box.w), y: clamp(box.y + dy, 0, 1 - box.h) });
    } else if (event.key === "Escape") setSelected(null);
  };

  const save = useCallback(async () => {
    if (!photo) return;
    setSaving(true);
    try {
      // Full resolution: a fresh canvas holds only the edited pixels, so no metadata, hidden
      // preview or original pixels from the source file can end up in the saved file.
      const out = document.createElement("canvas");
      out.width = photo.width;
      out.height = photo.height;
      const ctx = out.getContext("2d")!;
      if (photo.type === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.drawImage(photo.bitmap, 0, 0);
      applyBoxes(ctx, boxes, strength);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, photo.type, 0.92));
      out.width = out.height = 0;
      if (!blob) throw new Error("encode");
      const report = readMetadata(new Uint8Array(await blob.arrayBuffer()));
      if (report.rows.length || report.hasGps || report.hasThumbnail) throw new Error("metadata");
      downloadBlob(blob, renameFile(photo.name, extensionFor(blob.type), "-redacted"));
      setNotice("Na-save. The boxes are burned into the pixels and the metadata is gone.");
    } catch {
      setNotice("Hindi ma-save ang photo. The device may be low on memory: try a smaller photo.");
    } finally {
      setSaving(false);
    }
  }, [photo, boxes, strength, setNotice]);

  const selectedBox = boxes.find((box) => box.id === selected);
  const soft = boxes.some((box) => box.mode !== "black");

  const form = (
    <>
      <Group title="Photo">
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
          <p className="text-sm text-fg">{photo ? photo.name : "I-drop, i-paste o pumili ng photo."}</p>
          {photo && (
            <p className="mt-1 font-mono text-xs text-muted">
              {photo.width} × {photo.height} px
            </p>
          )}
          <Button className="mt-3" variant={photo ? "outline" : "primary"} onClick={() => fileInput.current?.click()} disabled={loading}>
            <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
            {loading ? "Opening…" : photo ? "Open another photo" : "Choose a photo"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              open(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            {error}
          </p>
        )}
      </Group>

      <Group title="New boxes">
        <div role="radiogroup" aria-label="Effect for new boxes" className="grid grid-cols-3 gap-1 rounded-md border border-line bg-ink p-1">
          {MODES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="radio"
              aria-checked={mode === entry.value}
              onClick={() => {
                setMode(entry.value);
                if (selectedBox) update(selectedBox.id, { mode: entry.value });
              }}
              className={`min-h-10 rounded px-2 text-sm ${mode === entry.value ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="redact-strength" className="mb-1.5 flex items-baseline justify-between text-sm text-fg">
            Blur and pixelate strength
            <span className="font-mono text-xs text-muted">{strength}</span>
          </label>
          <input id="redact-strength" type="range" min={1} max={10} step={1} value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="w-full accent-lime" />
        </div>
        <p className="text-xs leading-relaxed text-muted">Drag on the photo to draw a box. Tap a box to select it, drag it to move, and drag its corner to resize. With a keyboard: Add box, then arrow keys move it, Shift+arrows resize, Delete removes.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={addBox} disabled={!photo}>
            <Plus aria-hidden className="size-4" strokeWidth={1.75} />
            Add box
          </Button>
          <Button onClick={undo} disabled={!history.length}>
            <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
            Undo
          </Button>
        </div>
      </Group>

      {soft && (
        <p role="note" className="flex gap-2 rounded-md border border-signal/60 p-3 text-sm leading-relaxed text-fg">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.75} />
          Blur and pixelate can sometimes be reversed or guessed, especially on short text like ID, card or plate numbers. Use Black out for anything sensitive.
        </p>
      )}

      {boxes.length > 0 && (
        <Group title={`Boxes (${boxes.length})`}>
          <ul aria-label="Redaction boxes" className="flex flex-col gap-1.5">
            {boxes.map((box, index) => (
              <li key={box.id} className={`flex flex-wrap items-center gap-2 rounded-md border p-1.5 ${box.id === selected ? "border-accent" : "border-line"}`}>
                <button type="button" onClick={() => setSelected(box.id)} aria-pressed={box.id === selected} className="min-h-10 flex-1 rounded px-2 text-left text-sm text-fg">
                  Box {index + 1}
                </button>
                <label className="sr-only" htmlFor={`box-mode-${box.id}`}>
                  Effect for box {index + 1}
                </label>
                <select
                  id={`box-mode-${box.id}`}
                  value={box.mode}
                  onChange={(event) => update(box.id, { mode: event.target.value as RedactMode })}
                  className="min-h-10 rounded-md border border-line bg-ink px-2 text-sm text-fg"
                >
                  {MODES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => remove(box.id)} aria-label={`Delete box ${index + 1}`} className="flex size-10 items-center justify-center rounded text-muted hover:text-signal">
                  <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Your photo</h2>
      {photo ? (
        <>
          <canvas
            ref={canvas}
            tabIndex={0}
            role="img"
            aria-label={`Photo with ${boxes.length} redaction ${boxes.length === 1 ? "box" : "boxes"}${selectedBox ? `. Box ${boxes.indexOf(selectedBox) + 1} selected (${MODE_LABEL[selectedBox.mode]}): arrow keys move it, Shift+arrows resize, Delete removes` : ". Drag to draw a box"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="mx-auto block h-auto max-h-[70vh] w-auto max-w-full cursor-crosshair touch-none rounded-lg"
          />
          <p className="mt-3 font-mono text-xs text-muted">
            {boxes.length} {boxes.length === 1 ? "box" : "boxes"} · saved at {photo.width} × {photo.height} px, {extensionFor(photo.type).toUpperCase()}, no metadata
          </p>
        </>
      ) : (
        <div className="checkerboard flex min-h-64 items-center justify-center rounded-lg border border-line p-6 text-center">
          <p className="text-sm text-muted">Open a photo to start. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={save} disabled={!photo || saving}>
        <Download aria-hidden className="size-4" strokeWidth={2} />
        {saving ? "Saving…" : "Download"}
      </Button>
      <Button onClick={undo} disabled={!history.length}>
        <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
        Undo
      </Button>
    </>
  );

  return <EditorShell label="Blur and redact" form={form} preview={preview} actions={actions} previewLabel="Photo" />;
}
