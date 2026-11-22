"use client";

import { Download, FileImage, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob, downloadZip } from "@/lib/download";
import { formatBytes, renameFile } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { isSvgText, outputSize, SVG_MIME, svgSize, type SvgSize } from "@/tools/image/svg-convert";
import type { WorkFile } from "@/tools/types";
import { ColorInput, Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

type Format = "image/png" | "image/jpeg" | "image/webp";
const EXT: Record<Format, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
/** SVG text is read into memory; huge files are almost always embedded photos. */
const MAX_SVG_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 50;

interface Item {
  id: number;
  name: string;
  text: string;
  bytes: number;
  size: SvgSize;
  /** Object URL of the original file, for the preview. */
  url: string;
}

/**
 * Render one SVG at width × height. The SVG is drawn as an <img>: scripts never run
 * and external files are never fetched in that mode, so untrusted SVGs are safe.
 */
async function rasterize(item: Item, width: number, height: number, format: Format, background: string | null): Promise<Blob> {
  const doc = new DOMParser().parseFromString(item.text, SVG_MIME);
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length || root.localName !== "svg") {
    throw new Error(`Hindi mabasa ang "${item.name}": it is not a valid SVG file.`);
  }
  // Without a viewBox, a resized SVG would be cropped instead of scaled.
  if (!root.getAttribute("viewBox")) root.setAttribute("viewBox", `0 0 ${item.size.width} ${item.size.height}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("preserveAspectRatio", root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: SVG_MIME }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(`Hindi ma-render ang "${item.name}". The SVG may be damaged or use features the browser cannot draw.`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Hindi makagawa ng image: the browser is out of memory. Try a smaller size.");
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, 0.92));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("Hindi makagawa ng image: the browser is out of memory. Try a smaller size.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SvgConvertEditor() {
  // Files live in memory only, until the tab is closed.
  const [items, setItems] = useState<Item[]>([]);
  const [format, setFormat] = useState<Format>("image/png");
  const [mode, setMode] = useState<"scale" | "width">("scale");
  const [scale, setScale] = useState("2");
  const [width, setWidth] = useState(1024);
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const urls = useRef<string[]>([]);
  const { setNotice } = useSession();

  // Release preview URLs when the editor closes.
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const add = async (list: FileList | File[] | null | undefined) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const added: Item[] = [];
    const problems: string[] = [];
    for (const file of files.slice(0, Math.max(0, MAX_FILES - items.length))) {
      if (file.size > MAX_SVG_BYTES) {
        problems.push(`"${file.name}" is over 20 MB, masyadong malaki for an SVG.`);
        continue;
      }
      const text = await file.text();
      if (!isSvgText(text)) {
        problems.push(`"${file.name}" is not an SVG. For JPG, PNG and WebP use the Format Converter.`);
        continue;
      }
      const url = URL.createObjectURL(new Blob([text], { type: SVG_MIME }));
      urls.current.push(url);
      added.push({ id: nextId.current++, name: file.name || "image.svg", text, bytes: file.size, size: svgSize(text), url });
    }
    if (files.length > MAX_FILES - items.length) problems.push(`Up to ${MAX_FILES} SVG files at a time.`);
    setItems((current) => [...current, ...added]);
    if (problems.length) setNotice(problems.join(" "));
  };

  const remove = (id: number) => {
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const opaque = format === "image/jpeg" || !transparent;
  const value = mode === "scale" ? Number(scale) : width;
  const sizes = items.map((item) => outputSize(item.size, mode, value));
  const firstProblem = sizes.find((size) => "problem" in size) as { problem: string } | undefined;

  const convert = async () => {
    if (!items.length || firstProblem) return;
    setBusy(true);
    const outputs: WorkFile[] = [];
    const failures: string[] = [];
    for (const [index, item] of items.entries()) {
      const size = sizes[index] as { width: number; height: number };
      try {
        const blob = await rasterize(item, size.width, size.height, format, opaque ? background : null);
        outputs.push({ name: renameFile(item.name, EXT[format]), type: format, blob });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `Hindi na-convert ang "${item.name}".`);
      }
    }
    try {
      if (outputs.length === 1) downloadBlob(outputs[0].blob, outputs[0].name);
      else if (outputs.length > 1) await downloadZip(outputs, `svg-to-${EXT[format]}.zip`);
      const done = outputs.length ? `Na-convert ang ${outputs.length} ${outputs.length === 1 ? "file" : "files"}.` : "";
      setNotice([done, ...failures].filter(Boolean).join(" "));
    } finally {
      setBusy(false);
    }
  };

  const first = items[0];
  const firstSize = sizes[0];

  const form = (
    <>
      <Group title="SVG files">
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
          className={`rounded-lg border border-dashed p-4 text-center ${dragging ? "border-accent bg-raised" : "border-line"}`}
        >
          <p className="text-sm text-fg">I-drop dito o pumili ng SVG files.</p>
          <Button className="mt-3" variant={items.length ? "outline" : "primary"} onClick={() => input.current?.click()}>
            <FileImage aria-hidden className="size-4" strokeWidth={1.75} />
            {items.length ? "Add more" : "Choose SVG files"}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".svg,image/svg+xml"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        {items.length > 0 && (
          <ul className="flex flex-col gap-1">
            {items.map((item, index) => {
              const size = sizes[index];
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-fg">{item.name}</span>
                    <span className="font-mono text-xs text-muted">
                      {formatBytes(item.bytes)} · {"problem" in size ? "too large" : `${size.width} × ${size.height} px`}
                    </span>
                  </span>
                  <Button icon aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)}>
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Group>

      <Group title="Output">
        <Segmented
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: "image/png", label: "PNG" },
            { value: "image/jpeg", label: "JPG" },
            { value: "image/webp", label: "WebP" },
          ]}
        />
        <Segmented
          label="Size"
          value={mode}
          onChange={setMode}
          options={[
            { value: "scale", label: "Scale" },
            { value: "width", label: "Exact width" },
          ]}
        />
        {mode === "scale" ? (
          <Segmented
            label="Scale"
            value={scale}
            onChange={setScale}
            options={[
              { value: "1", label: "1x" },
              { value: "2", label: "2x" },
              { value: "4", label: "4x" },
            ]}
          />
        ) : (
          <NumberInput label="Width" unit="px" value={width} onChange={setWidth} step={16} hint="Height follows the SVG's proportions." />
        )}
        {format !== "image/jpeg" && (
          <label className="flex min-h-10 items-center gap-3 text-sm text-fg">
            <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} className="size-5 accent-lime" />
            Keep transparent background
          </label>
        )}
        {opaque && <ColorInput label="Background" value={background} onChange={setBackground} />}
        {firstProblem && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            {firstProblem.problem}
          </p>
        )}
      </Group>
      <p className="text-xs leading-relaxed text-muted">
        Walang ina-upload. SVGs are drawn like pictures, so scripts inside them never run and linked files are not loaded.
      </p>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Preview</h2>
      {first ? (
        <>
          <div className="checkerboard flex min-h-64 items-center justify-center rounded-lg border border-line p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL; <img> keeps SVG scripts from running */}
            <img src={first.url} alt={`Preview of ${first.name}`} className="max-h-[60vh] max-w-full object-contain" />
          </div>
          <p className="mt-3 font-mono text-xs text-muted">
            {first.name} · {"problem" in firstSize ? "too large" : `${firstSize.width} × ${firstSize.height} px ${EXT[format].toUpperCase()}`}
            {items.length > 1 && ` · +${items.length - 1} more`}
          </p>
        </>
      ) : (
        <div className="checkerboard flex min-h-64 items-center justify-center rounded-lg border border-line p-6 text-center">
          <p className="text-sm text-muted">Open an SVG to see it here.</p>
        </div>
      )}
    </div>
  );

  const actions = (
    <Button variant="primary" onClick={convert} disabled={!items.length || busy || Boolean(firstProblem)}>
      <Download aria-hidden className="size-4" strokeWidth={2} />
      {busy ? "Converting…" : items.length > 1 ? `Convert ${items.length} files (ZIP)` : "Convert and download"}
    </Button>
  );

  return <EditorShell label="SVG converter" form={form} preview={preview} actions={actions} previewLabel="Preview" />;
}
