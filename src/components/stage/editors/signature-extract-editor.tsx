"use client";

import { BookmarkPlus, Crop as CropIcon, Download, ImagePlus, Signature } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { detectFileType, formatBytes, MAX_FILE_BYTES, renameFile } from "@/lib/file-type";
import { saveSignature } from "@/lib/saved-signatures";
import { useSession } from "@/lib/session";
import { extractSignature, type Crop, type ExtractResult, type InkMode } from "@/tools/image/signature-extract";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { normalizedPoint } from "./pdf-shared";

/** Photos are scaled to this long side: plenty for a signature, and fast to process on a phone. */
const WORK_SIDE = 2000;
/** Saved signatures are capped in size (localStorage), so they are scaled to this width. */
const SAVE_WIDTH = 900;
const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };

interface Photo {
  name: string;
  url: string;
  pixels: ImageData;
}

function toCanvas(result: ExtractResult, maxWidth = Infinity): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  const image = new ImageData(new Uint8ClampedArray(result.data), result.width, result.height);
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  if (result.width <= maxWidth) return canvas;
  const scaled = document.createElement("canvas");
  scaled.width = maxWidth;
  scaled.height = Math.max(1, Math.round((result.height * maxWidth) / result.width));
  const ctx = scaled.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}

export default function SignatureExtractEditor() {
  // Nothing is saved unless you press Save for Sign PDF: the photo stays in this tab.
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [crop, setCrop] = useState<Crop>(FULL);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [sensitivity, setSensitivity] = useState(50);
  const [ink, setInk] = useState<InkMode>("black");
  const [evenLight, setEvenLight] = useState(true);
  const [clean, setClean] = useState(true);
  const [result, setResult] = useState<{ url: string; blob: Blob; data: ExtractResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { setNotice } = useSession();

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_FILE_BYTES) {
      setError(`Masyadong malaki ang photo (${formatBytes(file.size)}).`);
      return;
    }
    setLoading(true);
    try {
      let blob: Blob = file;
      const detected = await detectFileType(file, file.name);
      if (detected.kind === "convertible") {
        const { convertToJpeg } = await import("@/lib/heic");
        blob = (await convertToJpeg(file, file.name, detected.mime)).blob;
      } else if (detected.kind !== "image") {
        setError(detected.unsupported ?? "Hindi larawan ang file na ito. Choose a JPG, PNG, WebP or HEIC photo.");
        return;
      }
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const scale = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const url = URL.createObjectURL(await new Promise<Blob>((resolve, reject) => canvas.toBlob((out) => (out ? resolve(out) : reject(new Error())), "image/jpeg", 0.9)));
      setPhoto({ name: file.name, url, pixels });
      setCrop(FULL);
    } catch {
      setError("Hindi mabuksan ang photo. It may be damaged or in a format this browser cannot read.");
    } finally {
      setLoading(false);
    }
  };

  // Re-extract when the photo or a setting changes. Runs after paint so sliders stay responsive.
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const data = extractSignature(photo.pixels, crop, { sensitivity, ink, evenLight, despeckle: clean });
      if (cancelled) return;
      if (!data.inkPixels) {
        setResult(null);
        return;
      }
      toCanvas(data).toBlob((blob) => {
        if (!blob || cancelled) return;
        setResult({ url: URL.createObjectURL(blob), blob, data });
      }, "image/png");
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [photo, crop, sensitivity, ink, evenLight, clean]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!photo || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = normalizedPoint(event, event.currentTarget);
    setDraft({ x0: x, y0: y, x, y });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draft) setDraft({ ...draft, ...normalizedPoint(event, event.currentTarget) });
  };
  const onPointerUp = () => {
    if (!draft) return;
    const w = Math.abs(draft.x - draft.x0);
    const h = Math.abs(draft.y - draft.y0);
    if (w > 0.02 && h > 0.02) setCrop({ x: Math.min(draft.x, draft.x0), y: Math.min(draft.y, draft.y0), w, h });
    setDraft(null);
  };

  const download = () => result && photo && downloadBlob(result.blob, renameFile(photo.name, "png", "-signature"));
  const save = () => {
    if (!result) return;
    const outcome = saveSignature(toCanvas(result.data, SAVE_WIDTH).toDataURL("image/png"));
    setNotice(
      outcome === "saved"
        ? "Na-save sa browser na ito. Makikita mo ito sa Sign PDF at Signature Maker."
        : outcome === "full"
          ? "Puno na ang saved signatures (6). Delete one in Signature Maker first."
          : outcome === "too-big"
            ? "Masyadong malaki ang pirma para i-save. Crop closer to the signature."
            : "Hindi ma-save: this browser blocks storage.",
    );
  };

  const box = draft ? { x: Math.min(draft.x, draft.x0), y: Math.min(draft.y, draft.y0), w: Math.abs(draft.x - draft.x0), h: Math.abs(draft.y - draft.y0) } : crop;
  const cropped = crop !== FULL;

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
          <p className="break-all text-sm text-fg">{photo ? photo.name : "I-drop o pumili ng litrato ng pirma mo."}</p>
          <Button className="mt-3" variant={photo ? "outline" : "primary"} onClick={() => fileInput.current?.click()} disabled={loading}>
            <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
            {loading ? "Opening…" : photo ? "Open another photo" : "Choose a photo"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
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
        <p className="text-xs leading-relaxed text-muted">Best: dark pen on white paper, good light, phone flat above the page.</p>
      </Group>
      <Group title="Clean up">
        <div>
          <label htmlFor="sig-sensitivity" className="mb-1.5 flex justify-between text-sm text-fg">
            Sensitivity <span className="font-mono text-xs text-muted">{sensitivity}</span>
          </label>
          <input id="sig-sensitivity" type="range" min={0} max={100} step={1} value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} className="w-full accent-lime" aria-describedby="sig-sensitivity-hint" />
          <p id="sig-sensitivity-hint" className="mt-1.5 text-xs leading-relaxed text-muted">
            Higher keeps thin, light strokes; lower removes more paper and shadow.
          </p>
        </div>
        <Segmented
          label="Ink colour"
          value={ink}
          onChange={setInk}
          options={[
            { value: "black", label: "Black" },
            { value: "blue", label: "Blue" },
            { value: "original", label: "Keep original" },
          ]}
        />
        <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm text-fg">
          <input type="checkbox" checked={evenLight} onChange={(event) => setEvenLight(event.target.checked)} className="mt-0.5 size-5 accent-lime" />
          <span>
            Even out light and shadows
            <span className="block text-xs text-muted">Turn off only for scans with perfectly even white paper.</span>
          </span>
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-fg">
          <input type="checkbox" checked={clean} onChange={(event) => setClean(event.target.checked)} className="size-5 accent-lime" />
          Remove specks and dust
        </label>
      </Group>
      <p className="text-xs leading-relaxed text-muted">Use only your own signature, or one you have permission to use. Walang ina-upload.</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      {photo ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs uppercase tracking-widest text-muted">Photo: drag around the signature</h2>
            <Button onClick={() => setCrop(FULL)} disabled={!cropped} className="min-h-9">
              <CropIcon aria-hidden className="size-4" strokeWidth={1.75} />
              Reset crop
            </Button>
          </div>
          <div className="flex justify-center">
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL */}
              <img src={photo.url} alt="Your signature photo" draggable={false} className="block h-auto max-h-[45vh] w-auto max-w-full select-none rounded-md" />
              <div className="absolute inset-0 cursor-crosshair touch-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDraft(null)}>
                {(cropped || draft) && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute border-2 border-accent"
                    // Dim everything outside the crop with the theme's background colour.
                    style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, boxShadow: "0 0 0 9999px color-mix(in srgb, var(--ink) 60%, transparent)" }}
                  />
                )}
              </div>
            </div>
          </div>
          <h2 className="text-xs uppercase tracking-widest text-muted">Transparent PNG</h2>
          {result ? (
            <>
              <div className="checkerboard flex justify-center rounded-md border border-line p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL */}
                <img src={result.url} alt="Extracted signature" className="block h-auto max-h-48 w-auto max-w-full" />
              </div>
              <p className="font-mono text-xs text-muted">
                {result.data.width} × {result.data.height} px · {formatBytes(result.blob.size)} · transparent PNG, cropped to the ink
              </p>
            </>
          ) : (
            <p role="status" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
              Walang pirmang nakita. Raise Sensitivity, or crop closer to the signature.
            </p>
          )}
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-line p-6 text-center">
          <Signature aria-hidden className="size-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Open a photo of your signature. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={download} disabled={!result}>
        <Download aria-hidden className="size-4" strokeWidth={2} />
        Download PNG
      </Button>
      <Button onClick={save} disabled={!result}>
        <BookmarkPlus aria-hidden className="size-4" strokeWidth={1.75} />
        Save for Sign PDF
      </Button>
    </>
  );
  return <EditorShell label="Signature extractor" form={form} preview={preview} actions={actions} previewLabel="Result" />;
}
