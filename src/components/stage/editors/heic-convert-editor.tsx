"use client";

import { Download, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob, downloadZip } from "@/lib/download";
import { detectFileType, formatBytes } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { MAX_HEIC_BYTES, MAX_HEIC_FILES } from "@/tools/image/heic-convert";
import type { WorkFile } from "@/tools/types";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

type Target = "image/jpeg" | "image/png";

interface Item {
  id: number;
  file: File;
  mime: string;
  status: "waiting" | "done" | "failed";
  message?: string;
  output?: WorkFile;
}

export default function HeicConvertEditor({ preset }: { preset?: Record<string, string> }) {
  // Photos stay in memory only, until the tab is closed.
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<Target>(preset?.format === "image/png" ? "image/png" : "image/jpeg");
  const [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const { setNotice } = useSession();

  const add = async (list: FileList | null | undefined) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const added: Item[] = [];
    const problems: string[] = [];
    for (const file of files.slice(0, Math.max(0, MAX_HEIC_FILES - items.length))) {
      if (file.size > MAX_HEIC_BYTES) {
        problems.push(`"${file.name}" is over 80 MB.`);
        continue;
      }
      const detected = await detectFileType(file, file.name);
      if (detected.kind !== "convertible") {
        problems.push(detected.kind === "image" ? `"${file.name}" is already ${detected.mime === "image/png" ? "PNG" : detected.mime === "image/webp" ? "WebP" : "JPG"}: use the Format Converter.` : `"${file.name}" is not a HEIC or AVIF photo.`);
        continue;
      }
      added.push({ id: nextId.current++, file, mime: detected.mime, status: "waiting" });
    }
    if (files.length > MAX_HEIC_FILES - items.length) problems.push(`Up to ${MAX_HEIC_FILES} photos at a time.`);
    setItems((current) => [...current, ...added]);
    if (problems.length) setNotice(problems.join(" "));
  };

  const convert = async () => {
    if (!items.length) return;
    setBusy(true);
    const { convertHeic } = await import("@/lib/heic");
    const results: Item[] = [];
    for (const [index, item] of items.entries()) {
      setProgress(`${index + 1} of ${items.length}`);
      try {
        const out = await convertHeic(item.file, item.file.name, item.mime, target, quality / 100);
        results.push({ ...item, status: "done", message: undefined, output: { name: out.name, type: target, blob: out.blob } });
      } catch (error) {
        results.push({ ...item, status: "failed", message: error instanceof Error ? error.message : "Hindi na-convert.", output: undefined });
      }
      setItems([...results, ...items.slice(index + 1)]);
    }
    const outputs = results.flatMap((item) => (item.output ? [item.output] : []));
    try {
      if (outputs.length === 1) downloadBlob(outputs[0].blob, outputs[0].name);
      else if (outputs.length > 1) await downloadZip(outputs, `heic-to-${target === "image/png" ? "png" : "jpg"}.zip`);
      const failed = results.length - outputs.length;
      setNotice(outputs.length ? `Na-convert ang ${outputs.length} ${outputs.length === 1 ? "photo" : "photos"}.${failed ? ` ${failed} failed: see the list.` : ""}` : "Walang na-convert. See the list for why.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  const form = (
    <>
      <Group title="Photos">
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
          <p className="text-sm text-fg">I-drop dito ang HEIC photos, o pumili.</p>
          <Button className="mt-3" variant={items.length ? "outline" : "primary"} onClick={() => input.current?.click()} disabled={busy}>
            <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
            {items.length ? "Add more" : "Choose HEIC photos"}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".heic,.heif,.avif,image/heic,image/heif,image/avif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </Group>

      <Group title="Convert to">
        <Segmented
          label="Format"
          value={target}
          onChange={setTarget}
          options={[
            { value: "image/jpeg", label: "JPG (smaller)" },
            { value: "image/png", label: "PNG (full quality)" },
          ]}
        />
        {target === "image/jpeg" && (
          <div>
            <label htmlFor="heic-quality" className="mb-1.5 flex justify-between text-sm text-fg">
              Quality <span className="font-mono text-xs text-muted">{quality}%</span>
            </label>
            <input id="heic-quality" type="range" min={50} max={100} step={1} value={quality} onChange={(event) => setQuality(Number(event.target.value))} className="w-full accent-lime" />
          </div>
        )}
      </Group>
      <p className="text-xs leading-relaxed text-muted">Walang ina-upload. The converted photos have no location or camera details.</p>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
        {items.length ? `${items.length} ${items.length === 1 ? "photo" : "photos"} · ${formatBytes(totalBytes)}` : "Photos"}
      </h2>
      {items.length ? (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-fg">{item.file.name}</span>
                <span className={`font-mono text-xs ${item.status === "failed" ? "text-signal" : "text-muted"}`}>
                  {item.status === "done" && item.output
                    ? `${formatBytes(item.file.size)} -> ${formatBytes(item.output.blob.size)} ${item.output.name.split(".").pop()?.toUpperCase()}`
                    : item.status === "failed"
                      ? item.message
                      : formatBytes(item.file.size)}
                </span>
              </span>
              <Button icon aria-label={`Remove ${item.file.name}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} disabled={busy}>
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="checkerboard flex min-h-64 items-center justify-center rounded-lg border border-line p-6 text-center">
          <p className="text-sm text-muted">Open your iPhone photos to convert them. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  );

  const actions = (
    <Button variant="primary" onClick={convert} disabled={!items.length || busy} aria-busy={busy}>
      <Download aria-hidden className="size-4" strokeWidth={2} />
      {busy ? `Converting ${progress}…` : items.length > 1 ? `Convert ${items.length} photos (ZIP)` : "Convert and download"}
    </Button>
  );

  return <EditorShell label="HEIC converter" form={form} preview={preview} actions={actions} previewLabel="Photos" />;
}
