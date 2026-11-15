"use client";

import { ArrowDown, ArrowUp, Camera, Download, ImagePlus, RotateCcw, RotateCw, Scan, Trash2, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { detectFileType } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { FULL_QUAD, PAGE_SIZES, placeOnPage, processPage, validQuad, type PageSize, type Pixels, type Quad, type Rotation, type ScanFilter } from "@/tools/image/doc-scan";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

const MAX_PAGES = 50;
/** Photos bigger than this are refused: decoding one costs 4 bytes per pixel. */
const MAX_PIXELS = 50_000_000;
/** Editing copy of the selected page (long side, pixels). */
const EDIT_SIDE = 1400;
/** Live result preview (long side). */
const PREVIEW_SIDE = 900;
/** Saved pages (long side): about 300 dpi on A4 at 3500. */
const EXPORT_SIDE = 3500;

const FILTERS: { value: ScanFilter; label: string }[] = [
  { value: "color", label: "Original" },
  { value: "enhance", label: "Enhance" },
  { value: "gray", label: "Gray" },
  { value: "bw", label: "B&W" },
];
const FILTER_LABEL: Record<ScanFilter, string> = { color: "Original", enhance: "Enhance", gray: "Grayscale", bw: "Black & white" };
const CORNERS = ["Top left", "Top right", "Bottom right", "Bottom left"] as const;
const SIZE_LABEL: Record<PageSize, string> = { fit: "Same as scan", a4: "A4", letter: "Letter (short)", legal: "Legal (long)" };

interface Page {
  id: number;
  /** The photo as opened (HEIC already converted to JPEG). Decoded only when needed, so 50 pages do not fill the phone's memory. */
  blob: Blob;
  name: string;
  width: number;
  height: number;
  quad: Quad;
  filter: ScanFilter;
  rotation: Rotation;
}

interface Editing {
  id: number;
  bitmap: ImageBitmap;
  pixels: Pixels;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** Margin around the photo inside the corner editor, so handles on the photo's edge stay whole and easy to grab. */
const marginFor = (bitmap: { width: number; height: number }) => Math.round(Math.max(bitmap.width, bitmap.height) * 0.035);

/** Decode a photo, upright, scaled so its long side is at most `maxSide`. */
async function decode(blob: Blob, maxSide: number, withBitmap = true): Promise<{ bitmap: ImageBitmap | null; pixels: Pixels }> {
  const full = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(full.width, full.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(full.width * scale));
  canvas.height = Math.max(1, Math.round(full.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  full.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bitmap = withBitmap ? await createImageBitmap(canvas) : null;
  canvas.width = canvas.height = 0;
  return { bitmap, pixels: { data: image.data, width: image.width, height: image.height } };
}

function toCanvas(px: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = px.width;
  canvas.height = px.height;
  canvas.getContext("2d")!.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0);
  return canvas;
}

const encode = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.88));
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

export default function DocScanEditor() {
  // Nothing is saved: the pages live in memory until the tab is closed.
  const [pages, setPages] = useState<Page[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [corner, setCorner] = useState(0);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [format, setFormat] = useState<"pdf" | "jpg">("pdf");
  const [size, setSize] = useState<PageSize>("a4");
  const [progress, setProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const cancel = useRef<AbortController | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const resultCanvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ corner: number; before: Quad } | null>(null);
  const nextId = useRef(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState(0);
  const sizeId = useId();
  const { setNotice } = useSession();

  const page = pages.find((entry) => entry.id === selected) ?? null;
  const setPage = (id: number, patch: Partial<Page>) => setPages((list) => list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  const add = async (files: FileList | File[] | null | undefined) => {
    const list = [...(files ?? [])];
    if (!list.length) return;
    setError("");
    const room = MAX_PAGES - pages.length;
    if (room <= 0) {
      setError(`Hanggang ${MAX_PAGES} pages lang. Save this document first, then start a new one.`);
      return;
    }
    const added: Page[] = [];
    const problems: string[] = [];
    for (const [index, file] of list.slice(0, room).entries()) {
      setLoading(`Opening ${index + 1} of ${Math.min(list.length, room)}…`);
      try {
        let blob: Blob = file;
        let name = file.name || "photo.jpg";
        const detected = await detectFileType(file, file.name);
        if (detected.kind === "convertible") {
          const { convertToJpeg } = await import("@/lib/heic");
          const converted = await convertToJpeg(file, name, detected.mime);
          blob = converted.blob;
          name = converted.name;
        } else if (detected.kind !== "image") {
          problems.push(`${name}: not a photo`);
          continue;
        }
        const probe = await createImageBitmap(blob, { imageOrientation: "from-image" });
        const { width, height } = probe;
        probe.close();
        if (width * height > MAX_PIXELS) {
          problems.push(`${name}: masyadong malaki (${Math.round((width * height) / 1e6)} MP)`);
          continue;
        }
        added.push({ id: nextId.current++, blob, name, width, height, quad: FULL_QUAD, filter: "enhance", rotation: 0 });
      } catch {
        problems.push(`${file.name}: hindi mabuksan`);
      }
    }
    setLoading("");
    if (list.length > room) problems.push(`only ${room} more ${room === 1 ? "page fits" : "pages fit"} (max ${MAX_PAGES})`);
    if (problems.length) setError(`Skipped: ${problems.join("; ")}. Use JPG, PNG, WebP or HEIC photos.`);
    if (added.length) {
      setPages((current) => [...current, ...added]);
      setSelected(added[0].id);
    }
  };

  // Decode the selected page for editing; only one page is decoded at a time.
  useEffect(() => {
    // With no page selected the old copy is simply not shown (see `ready`).
    if (!page || editing?.id === page.id) return;
    let stale = false;
    decode(page.blob, EDIT_SIDE)
      .then((result) => {
        if (stale || !result.bitmap) result.bitmap?.close();
        else setEditing({ id: page.id, bitmap: result.bitmap, pixels: result.pixels });
      })
      .catch(() => !stale && setError("Hindi mabuksan ang page. The device may be low on memory."));
    return () => {
      stale = true;
    };
    // Re-decode only when a different page is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id]);
  useEffect(() => () => editing?.bitmap.close(), [editing]);

  // Paste a photo straight onto the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((entry) => entry.type.startsWith("image/"));
      if (files.length) add(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // Redraw when the canvas is resized (handles are sized in screen pixels).
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setView((value) => value + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [editing]);

  const ready = editing && page && editing.id === page.id ? editing : null;

  // Corner editor: the photo, the area outside the page dimmed, the outline and four handles.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !ready || !page) return;
    const { bitmap } = ready;
const pad = marginFor(bitmap);
    el.width = bitmap.width + 2 * pad;
    el.height = bitmap.height + 2 * pad;
    const ctx = el.getContext("2d")!;
    ctx.drawImage(bitmap, pad, pad);
    const ratio = el.width / Math.max(1, el.getBoundingClientRect().width);
    const pts = page.quad.map((p) => [pad + p.x * bitmap.width, pad + p.y * bitmap.height] as const);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, bitmap.width, bitmap.height);
    ctx.moveTo(...pts[0]);
    for (const p of pts.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
    // Overlay colours are drawn on the photo itself, so they are fixed for visibility on any image.
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill("evenodd");
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for (const p of pts.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
    ctx.lineWidth = 4 * ratio;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
    ctx.lineWidth = 2 * ratio;
    ctx.strokeStyle = "#c6ff3d";
    ctx.stroke();
    pts.forEach(([x, y], index) => {
      ctx.beginPath();
      ctx.arc(x, y, (index === corner ? 13 : 10) * ratio, 0, Math.PI * 2);
      ctx.fillStyle = index === corner ? "#c6ff3d" : "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.lineWidth = 2 * ratio;
      ctx.strokeStyle = "#000000";
      ctx.stroke();
    });
    ctx.restore();
  }, [ready, page, corner, view]);

  // Live result, from the editing copy. Deferred so dragging stays smooth.
  const settings = useDeferredValue(page ? { quad: page.quad, rotation: page.rotation, filter: page.filter } : null);
  const result = useMemo(() => {
    if (!ready || !settings || !validQuad(settings.quad)) return null;
    const copy = { ...ready.pixels, data: new Uint8ClampedArray(ready.pixels.data) };
    return processPage(copy, settings.quad, settings.rotation, settings.filter, PREVIEW_SIDE);
  }, [ready, settings]);
  useEffect(() => {
    const el = resultCanvas.current;
    if (!el || !result) return;
    el.width = result.width;
    el.height = result.height;
    el.getContext("2d")!.putImageData(new ImageData(result.data as Uint8ClampedArray<ArrayBuffer>, result.width, result.height), 0, 0);
  }, [result]);

  /** Pointer position on the photo, normalised 0..1, and the screen size of one photo unit. */
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const w = ready?.bitmap.width ?? 1;
    const h = ready?.bitmap.height ?? 1;
    const pad = ready ? marginFor(ready.bitmap) : 0;
    const scale = rect.width / Math.max(1, el.width);
    const x = ((event.clientX - rect.left) / scale - pad) / w;
    const y = ((event.clientY - rect.top) / scale - pad) / h;
    return { x: clamp(x), y: clamp(y), screenW: w * scale, screenH: h * scale, rawX: x, rawY: y };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!page) return;
    const { rawX, rawY, screenW, screenH } = point(event);
    // Nearest corner, if the press is within reach of one (44 CSS px for fingers).
    let best = -1;
    let bestDistance = Infinity;
    page.quad.forEach((p, index) => {
      const distance = Math.hypot((p.x - rawX) * screenW, (p.y - rawY) * screenH);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best < 0 || bestDistance > 44) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCorner(best);
    drag.current = { corner: best, before: page.quad };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !page) return;
    const { x, y } = point(event);
    const index = drag.current.corner;
    setPage(page.id, { quad: page.quad.map((p, i) => (i === index ? { x, y } : p)) as Quad });
  };
  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current || !page) return;
    if (!validQuad(page.quad)) {
      setPage(page.id, { quad: current.before });
      setNotice("Nagkrus ang corners. Keep them in order: top left, top right, bottom right, bottom left.");
    }
  };

  /** Arrows move the selected corner (Shift: faster), 1-4 pick a corner. */
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!page) return;
    if (/^[1-4]$/.test(event.key)) {
      setCorner(Number(event.key) - 1);
      return;
    }
    const step = event.shiftKey ? 0.02 : 0.004;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const quad = page.quad.map((p, i) => (i === corner ? { x: clamp(p.x + move[0]), y: clamp(p.y + move[1]) } : p)) as Quad;
    if (validQuad(quad)) setPage(page.id, { quad });
  };

  const movePage = (index: number, delta: number) =>
    setPages((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const removePage = (id: number) => {
    const index = pages.findIndex((entry) => entry.id === id);
    const rest = pages.filter((entry) => entry.id !== id);
    setPages(rest);
    if (selected === id) setSelected(rest[Math.min(index, rest.length - 1)]?.id ?? null);
  };

  const save = async () => {
    if (!pages.length) return;
    const controller = new AbortController();
    cancel.current = controller;
    const outputs: { blob: Blob; width: number; height: number }[] = [];
    try {
      for (const [index, entry] of pages.entries()) {
        if (controller.signal.aborted) return;
        setProgress(`Page ${index + 1} of ${pages.length}…`);
        await pause();
        const { pixels } = await decode(entry.blob, EXPORT_SIDE, false);
        const done = processPage(pixels, entry.quad, entry.rotation, entry.filter, EXPORT_SIDE);
        const canvasOut = toCanvas(done);
        // A fresh canvas holds only the processed pixels, so no metadata from the photo can reach the file.
        const blob = await encode(canvasOut, entry.filter === "bw" ? "image/png" : "image/jpeg");
        canvasOut.width = canvasOut.height = 0;
        if (!blob) throw new Error("encode");
        outputs.push({ blob, width: done.width, height: done.height });
      }
      if (controller.signal.aborted) return;
      setProgress("Saving…");
      if (format === "pdf") {
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.create();
        pdf.setTitle("Scanned document");
        pdf.setProducer("Krea");
        pdf.setCreator("Krea");
        for (const out of outputs) {
          if (controller.signal.aborted) return;
          const bytes = new Uint8Array(await out.blob.arrayBuffer());
          const image = out.blob.type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          const place = placeOnPage(out.width, out.height, size);
          const pdfPage = pdf.addPage([place.pageWidth, place.pageHeight]);
          pdfPage.drawImage(image, { x: place.x, y: place.y, width: place.width, height: place.height });
        }
        const bytes = await pdf.save();
        if (controller.signal.aborted) return;
        downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), "scan.pdf");
      } else if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, `scan.${outputs[0].blob.type === "image/png" ? "png" : "jpg"}`);
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        outputs.forEach((out, index) => zip.file(`scan-${String(index + 1).padStart(2, "0")}.${out.blob.type === "image/png" ? "png" : "jpg"}`, out.blob));
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        if (controller.signal.aborted) return;
        downloadBlob(blob, "scan.zip");
      }
      setNotice(`Na-save ang ${pages.length} ${pages.length === 1 ? "page" : "pages"}. No photo metadata was kept.`);
    } catch {
      setNotice("Hindi ma-save ang scan. The device may be low on memory: try fewer pages at a time.");
    } finally {
      cancel.current = null;
      setProgress("");
    }
  };
  const stop = () => {
    cancel.current?.abort();
    setNotice("Cancelled. Walang na-save.");
  };

  const form = (
    <>
      <Group title={`Pages (${pages.length})`}>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            add(event.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-3 rounded-lg border border-dashed p-4 text-center ${dragging ? "border-accent bg-raised" : "border-line"}`}
        >
          <p className="text-sm text-fg">{pages.length ? "Add more pages, or drop photos here." : "Kunan ng photo ang papel, o pumili ng photos."}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => cameraInput.current?.click()} disabled={!!loading || !!progress}>
              <Camera aria-hidden className="size-4" strokeWidth={1.75} />
              Take a photo
            </Button>
            <Button onClick={() => fileInput.current?.click()} disabled={!!loading || !!progress}>
              <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
              Choose photos
            </Button>
          </div>
          {loading && <p className="font-mono text-xs text-muted">{loading}</p>}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="scan-files"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        <p className="text-xs leading-relaxed text-muted">On a computer, Take a photo opens the file picker. Lay the paper flat on a darker surface, in even light.</p>
        {error && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            {error}
          </p>
        )}
        {pages.length > 0 && (
          <ul aria-label="Scanned pages" className="flex flex-col gap-1.5">
            {pages.map((entry, index) => (
              <li key={entry.id} className={`flex items-center gap-1 rounded-md border p-1.5 ${entry.id === selected ? "border-accent" : "border-line"}`}>
                <button type="button" onClick={() => setSelected(entry.id)} aria-pressed={entry.id === selected} className="min-h-10 min-w-0 flex-1 rounded px-2 text-left text-sm text-fg">
                  Page {index + 1}
                  <span className="block truncate font-mono text-xs text-muted">
                    {FILTER_LABEL[entry.filter]}
                    {entry.rotation ? ` · ${entry.rotation}°` : ""}
                  </span>
                </button>
                <button type="button" onClick={() => movePage(index, -1)} disabled={index === 0} aria-label={`Move page ${index + 1} up`} className="flex size-10 items-center justify-center rounded text-muted hover:text-fg disabled:opacity-40">
                  <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button type="button" onClick={() => movePage(index, 1)} disabled={index === pages.length - 1} aria-label={`Move page ${index + 1} down`} className="flex size-10 items-center justify-center rounded text-muted hover:text-fg disabled:opacity-40">
                  <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button type="button" onClick={() => removePage(entry.id)} aria-label={`Delete page ${index + 1}`} className="flex size-10 items-center justify-center rounded text-muted hover:text-signal">
                  <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pages.length > 0 && <p className="text-xs text-muted lg:hidden">Open the Page tab above to drag the corners.</p>}
      </Group>

      <Group title="Save as">
        <Segmented
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: "pdf", label: "One PDF" },
            { value: "jpg", label: "JPG images" },
          ]}
        />
        {format === "pdf" && (
          <div>
            <label htmlFor={sizeId} className="mb-1.5 block text-sm text-fg">
              Paper size
            </label>
            <select id={sizeId} value={size} onChange={(event) => setSize(event.target.value as PageSize)} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
              {(Object.keys(PAGE_SIZES) as PageSize[]).map((key) => (
                <option key={key} value={key}>
                  {SIZE_LABEL[key]}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted">Black & white pages are saved as PNG for crisp text; the others as JPG. Hindi sine-save ang pages: they stay in this tab only.</p>
      </Group>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs uppercase tracking-widest text-muted">{page ? `Page ${pages.indexOf(page) + 1}: corners` : "Your page"}</h2>
      {page ? (
        <>
          {ready ? (
            <canvas
              ref={canvas}
              data-margin={marginFor(ready.bitmap)}
              tabIndex={0}
              role="img"
              aria-label={`Photo for page ${pages.indexOf(page) + 1}. ${CORNERS[corner]} corner selected: arrow keys move it, Shift+arrows move faster, keys 1 to 4 pick a corner.`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              className="mx-auto block h-auto max-h-[60vh] w-auto max-w-full touch-none rounded-lg"
            />
          ) : (
            <div className="skeleton h-64 rounded-lg" aria-busy="true" aria-label="Opening page" />
          )}
          <div role="radiogroup" aria-label="Corner to move with the keyboard" className="grid grid-cols-2 gap-1 rounded-md border border-line bg-ink p-1 sm:grid-cols-4">
            {CORNERS.map((label, index) => (
              <button key={label} type="button" role="radio" aria-checked={corner === index} onClick={() => setCorner(index)} className={`min-h-10 rounded px-2 text-sm ${corner === index ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted">Drag each corner onto a corner of the paper. With a keyboard: focus the photo, pick a corner, move it with the arrow keys.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPage(page.id, { rotation: (((page.rotation + 270) % 360) as Rotation) })}>
              <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
              Rotate left
            </Button>
            <Button onClick={() => setPage(page.id, { rotation: (((page.rotation + 90) % 360) as Rotation) })}>
              <RotateCw aria-hidden className="size-4" strokeWidth={1.75} />
              Rotate right
            </Button>
            <Button onClick={() => setPage(page.id, { quad: FULL_QUAD })}>
              <Scan aria-hidden className="size-4" strokeWidth={1.75} />
              Whole photo
            </Button>
          </div>
          <Segmented label="Look" value={page.filter} onChange={(filter) => setPage(page.id, { filter })} options={FILTERS} />
          <div>
            <h3 className="mb-2 text-xs uppercase tracking-widest text-muted">Result</h3>
            {result ? (
              <canvas ref={resultCanvas} role="img" aria-label={`Straightened page ${pages.indexOf(page) + 1}, ${FILTER_LABEL[page.filter]}`} className="mx-auto block h-auto max-h-[50vh] w-auto max-w-full rounded border border-line bg-paper" />
            ) : (
              <div className="skeleton h-40 rounded-lg" aria-busy="true" aria-label="Preparing preview" />
            )}
          </div>
        </>
      ) : (
        <div className="checkerboard flex min-h-64 items-center justify-center rounded-lg border border-line p-6 text-center">
          <p className="text-sm text-muted">Add a photo of a document to start. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  );

  const actions = progress ? (
    <>
      <span aria-live="polite" className="inline-flex min-h-10 items-center font-mono text-xs text-muted">
        {progress}
      </span>
      <Button onClick={stop}>
        <X aria-hidden className="size-4" strokeWidth={1.75} />
        Cancel
      </Button>
    </>
  ) : (
    <Button variant="primary" onClick={save} disabled={!pages.length || !!loading}>
      <Download aria-hidden className="size-4" strokeWidth={2} />
      {format === "pdf" ? "Download PDF" : pages.length > 1 ? "Download ZIP" : "Download JPG"}
    </Button>
  );

  return <EditorShell label="Document scanner" form={form} preview={preview} actions={actions} previewLabel="Page" />;
}
