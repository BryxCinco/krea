"use client";

import { ArrowUpRight, Download, Highlighter, ImagePlus, ListOrdered, PenLine, RectangleHorizontal, Trash2, Type, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { detectFileType, renameFile } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { drawMarks, MARK_COLORS, type ImageMark, type ImageMarkKind } from "@/tools/image/annotate-image";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

const TOOLS: { value: ImageMarkKind; label: string; icon: typeof Type }[] = [
  { value: "arrow", label: "Arrow", icon: ArrowUpRight },
  { value: "box", label: "Box", icon: RectangleHorizontal },
  { value: "highlight", label: "Highlight", icon: Highlighter },
  { value: "step", label: "Step", icon: ListOrdered },
  { value: "text", label: "Text", icon: Type },
  { value: "pen", label: "Pen", icon: PenLine },
];
const KIND_LABEL: Record<ImageMarkKind, string> = { arrow: "Arrow", box: "Box", highlight: "Highlight", step: "Step", text: "Text", pen: "Drawing" };
/** Decoded photos cost 4 bytes per pixel; past this a phone tab may crash. */
const MAX_PIXELS = 50_000_000;
/** The on-screen preview is drawn at most this wide; export always uses full resolution. */
const PREVIEW_MAX = 1600;

interface Picture {
  bitmap: ImageBitmap;
  name: string;
  width: number;
  height: number;
}
type Draft = { kind: "drag"; x0: number; y0: number; x: number; y: number } | { kind: "pen"; points: [number, number][] };

export default function AnnotateImageEditor() {
  // Nothing is saved: the image and marks live in memory until the tab is closed.
  const [picture, setPicture] = useState<Picture | null>(null);
  const [marks, setMarks] = useState<ImageMark[]>([]);
  const [history, setHistory] = useState<ImageMark[][]>([]);
  const [tool, setTool] = useState<ImageMarkKind>("arrow");
  const [color, setColor] = useState(MARK_COLORS[0]);
  const [size, setSize] = useState(3);
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"image/png" | "image/jpeg">("image/png");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const { setNotice } = useSession();

  const commit = (next: ImageMark[]) => {
    setHistory((stack) => [...stack.slice(-49), marks]);
    setMarks(next);
  };
  const undo = () => {
    if (!history.length) return;
    setMarks(history[history.length - 1]);
    setHistory((stack) => stack.slice(0, -1));
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      let blob: Blob = file;
      let name = file.name || "screenshot.png";
      const detected = await detectFileType(file, name);
      if (detected.kind === "convertible") {
        const { convertToJpeg } = await import("@/lib/heic");
        const converted = await convertToJpeg(file, name, detected.mime);
        blob = converted.blob;
        name = converted.name;
      } else if (detected.kind !== "image") {
        setError(detected.unsupported ?? "That is not an image. Choose a JPG, PNG, WebP or HEIC file.");
        return;
      }
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      if (bitmap.width * bitmap.height > MAX_PIXELS) {
        bitmap.close();
        setError(`Masyadong malaki ang image (${Math.round((bitmap.width * bitmap.height) / 1e6)} MP). Resize it below ${MAX_PIXELS / 1e6} MP first.`);
        return;
      }
      setPicture((previous) => {
        previous?.bitmap.close();
        return { bitmap, name, width: bitmap.width, height: bitmap.height };
      });
      // Photos save smaller as JPG; screenshots and graphics stay sharp as PNG.
      setFormat(detected.mime === "image/jpeg" || detected.kind === "convertible" ? "image/jpeg" : "image/png");
      setMarks([]);
      setHistory([]);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Hindi mabuksan ang image. It may be damaged.");
    } finally {
      setLoading(false);
    }
  };

  // Free the decoded image when the editor closes.
  useEffect(() => () => picture?.bitmap.close(), [picture]);

  // Paste a screenshot straight onto the page.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((entry) => entry.type.startsWith("image/"));
      if (file) openRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const draftMark = (): ImageMark | null => {
    if (!draft) return null;
    const base = { id: 0, color, size };
    if (draft.kind === "pen") return { ...base, kind: "pen", points: draft.points };
    if (tool === "arrow") return { ...base, kind: "arrow", x1: draft.x0, y1: draft.y0, x2: draft.x, y2: draft.y };
    const kind = tool === "highlight" ? "highlight" : "box";
    return { ...base, kind, x: Math.min(draft.x, draft.x0), y: Math.min(draft.y, draft.y0), w: Math.abs(draft.x - draft.x0), h: Math.abs(draft.y - draft.y0) };
  };

  // Draw the preview: the image with every mark (and the one being drawn) on top.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !picture) return;
    const scale = Math.min(1, PREVIEW_MAX / Math.max(picture.width, picture.height));
    el.width = Math.round(picture.width * scale);
    el.height = Math.round(picture.height * scale);
    const ctx = el.getContext("2d")!;
    ctx.drawImage(picture.bitmap, 0, 0, el.width, el.height);
    const pending = draftMark();
    drawMarks(ctx, pending ? [...marks, pending] : marks, picture.width, picture.height, scale);
    // draftMark reads draft, tool, color and size, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture, marks, draft, tool, color, size]);

  // Pointer position in pixels of the original image.
  const pointAt = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return [clamp((event.clientX - rect.left) / rect.width) * (picture?.width ?? 0), clamp((event.clientY - rect.top) / rect.height) * (picture?.height ?? 0)];
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!picture || event.button > 0) return;
    const [x, y] = pointAt(event);
    if (tool === "step") {
      commit([...marks, { id: nextId.current++, kind: "step", x, y, color, size }]);
      return;
    }
    if (tool === "text") {
      if (!text.trim()) {
        setNotice("I-type muna ang text sa kaliwa, then tap where it goes.");
        return;
      }
      commit([...marks, { id: nextId.current++, kind: "text", x, y, text, color, size }]);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft(tool === "pen" ? { kind: "pen", points: [[x, y]] } : { kind: "drag", x0: x, y0: y, x, y });
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const [x, y] = pointAt(event);
    setDraft(draft.kind === "pen" ? { kind: "pen", points: [...draft.points, [x, y]] } : { ...draft, x, y });
  };
  const onPointerUp = () => {
    const mark = draftMark();
    setDraft(null);
    if (!mark || !picture) return;
    // A tap is not a box or an arrow.
    const tiny = Math.max(picture.width, picture.height) / 200;
    if ((mark.kind === "box" || mark.kind === "highlight") && (mark.w < tiny || mark.h < tiny)) return;
    if (mark.kind === "arrow" && Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1) < tiny * 2) return;
    commit([...marks, { ...mark, id: nextId.current++ }]);
  };

  const save = async () => {
    if (!picture) return;
    setSaving(true);
    try {
      const out = document.createElement("canvas");
      out.width = picture.width;
      out.height = picture.height;
      const ctx = out.getContext("2d")!;
      if (format === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.drawImage(picture.bitmap, 0, 0);
      drawMarks(ctx, marks, picture.width, picture.height);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, format, 0.92));
      out.width = out.height = 0;
      if (!blob) throw new Error("encode");
      downloadBlob(blob, renameFile(picture.name, format === "image/png" ? "png" : "jpg", "-annotated"));
      setNotice("Na-save ang annotated image.");
    } catch {
      setNotice("Hindi ma-save ang image. The device may be low on memory: try a smaller image.");
    } finally {
      setSaving(false);
    }
  };

  let stepNumber = 0;
  const listed = marks.map((mark) => ({ mark, label: mark.kind === "step" ? `Step ${++stepNumber}` : mark.kind === "text" ? `Text: ${mark.text}` : KIND_LABEL[mark.kind] }));

  const form = (
    <>
      <Group title="Image">
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
          <p className="text-sm text-fg">{picture ? picture.name : "I-drop, i-paste (Ctrl+V) o pumili ng image."}</p>
          {picture && (
            <p className="mt-1 font-mono text-xs text-muted">
              {picture.width} × {picture.height} px
            </p>
          )}
          <Button className="mt-3" variant={picture ? "outline" : "primary"} onClick={() => fileInput.current?.click()} disabled={loading}>
            <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
            {loading ? "Opening…" : picture ? "Open another image" : "Choose an image"}
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

      <Group title="Tool">
        <div role="radiogroup" aria-label="Mark" className="grid grid-cols-3 gap-1 rounded-md border border-line bg-ink p-1">
          {TOOLS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={tool === value}
              onClick={() => setTool(value)}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded px-2 text-sm ${tool === value ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
            >
              <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
        {tool === "text" && (
          <div>
            <label htmlFor="markup-text" className="mb-1.5 block text-sm text-fg">
              Text to place
            </label>
            <textarea
              id="markup-text"
              rows={2}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type, then tap the image where it goes"
              className="min-h-10 w-full resize-y rounded-md border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-muted/70 hover:border-muted"
            />
          </div>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm text-fg">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {MARK_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Colour ${swatch}`}
                aria-pressed={color === swatch}
                onClick={() => setColor(swatch)}
                className={`size-10 rounded-full border-2 ${color === swatch ? "border-accent" : "border-line"}`}
                // The swatch shows ink that goes into the image, not a theme colour.
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="markup-size" className="mb-1.5 flex justify-between text-sm text-fg">
            Size <span className="font-mono text-xs text-muted">{size}</span>
          </label>
          <input id="markup-size" type="range" min={1} max={10} step={1} value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-full accent-lime" />
        </div>
        <p className="text-xs leading-relaxed text-muted">{tool === "step" ? "Tap to place the next number." : tool === "text" ? "Tap the image to place the text." : "Drag on the image."}</p>
      </Group>

      {picture && (
        <Group
          title={`Marks (${marks.length})`}
          actions={
            <Button onClick={undo} disabled={!history.length} className="min-h-9">
              <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
              Undo
            </Button>
          }
        >
          {listed.length ? (
            <ul className="flex flex-col gap-1">
              {listed.map(({ mark, label }) => (
                <li key={mark.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-fg">
                    <span aria-hidden className="size-3 shrink-0 rounded-full border border-line" style={{ backgroundColor: mark.color }} />
                    <span className="truncate">{label}</span>
                  </span>
                  <Button icon aria-label={`Remove ${label.toLowerCase()}`} onClick={() => commit(marks.filter((entry) => entry.id !== mark.id))}>
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Wala pang marka.</p>
          )}
        </Group>
      )}

      <Segmented
        label="Save as"
        value={format}
        onChange={setFormat}
        options={[
          { value: "image/png", label: "PNG (sharp text)" },
          { value: "image/jpeg", label: "JPG (smaller photo)" },
        ]}
      />
      <p className="text-xs leading-relaxed text-muted">Saved at full resolution. Walang ina-upload. To hide private details, use Blur & Redact instead.</p>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Your image</h2>
      {picture ? (
        <>
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Image with ${marks.length} ${marks.length === 1 ? "mark" : "marks"}. ${tool === "step" || tool === "text" ? "Tap to place" : "Drag to draw"} a ${KIND_LABEL[tool].toLowerCase()}.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDraft(null)}
            className={`mx-auto block h-auto max-h-[70vh] w-auto max-w-full touch-none rounded-lg ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
          />
          <p className="mt-3 font-mono text-xs text-muted">
            {marks.length} {marks.length === 1 ? "mark" : "marks"} · saved at {picture.width} × {picture.height} px, {format === "image/png" ? "PNG" : "JPG"}
          </p>
        </>
      ) : (
        <div className="checkerboard flex min-h-64 items-center justify-center rounded-lg border border-line p-6 text-center">
          <p className="text-sm text-muted">Open or paste an image to mark it up. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={save} disabled={!picture || saving}>
        <Download aria-hidden className="size-4" strokeWidth={2} />
        {saving ? "Saving…" : "Download"}
      </Button>
      <Button onClick={undo} disabled={!history.length}>
        <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
        Undo
      </Button>
    </>
  );

  return <EditorShell label="Image annotator" form={form} preview={preview} actions={actions} previewLabel="Image" />;
}
