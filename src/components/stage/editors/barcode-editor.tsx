"use client";

import { Camera, CameraOff, Copy, Download, ExternalLink, Eye, EyeOff, FileCode2, FileImage, Info, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { cameraErrorMessage, ENGINE_LABEL, getScanner, type ScanEngine, type ScanHit } from "@/lib/code-scan";
import { useSession } from "@/lib/session";
import { onTabListKeyDown } from "@/lib/use-focus-trap";
import { BARCODE_FORMATS, checkBarcodeText, classifyScan, formatLabel, type BarcodeFormat } from "@/tools/text/barcode-logic";
import { contrastRatio } from "@/tools/text/qr";
import { ColorInput, Group, TextInput } from "./form";
import { EditorShell } from "./editor-shell";

type Tab = "make" | "scan";

interface Style {
  barWidth: number;
  height: number;
  margin: number;
  showText: boolean;
  fontSize: number;
  foreground: string;
  background: string;
  transparent: boolean;
  scale: number;
}

const DEFAULT_STYLE: Style = { barWidth: 2, height: 100, margin: 10, showText: true, fontSize: 18, foreground: "#000000", background: "#ffffff", transparent: false, scale: 2 };

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-fg">
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-lime" />
        {label}
      </label>
      {hint && <p className="ml-7 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Slider({ id, label, value, min, max, step = 1, unit = "", onChange }: { id: string; label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
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

/** Draw the barcode with JsBarcode into an SVG or canvas element. `scale` multiplies every size, for sharper PNGs. */
async function draw(target: SVGSVGElement | HTMLCanvasElement, format: BarcodeFormat, value: string, style: Style, scale: number) {
  const { default: JsBarcode } = await import("jsbarcode");
  JsBarcode(target, value, {
    format,
    width: style.barWidth * scale,
    height: style.height * scale,
    margin: style.margin * scale,
    displayValue: style.showText,
    fontSize: style.fontSize * scale,
    textMargin: 2 * scale,
    lineColor: style.foreground,
    background: style.transparent ? "" : style.background,
  });
}

async function makeSvg(format: BarcodeFormat, value: string, style: Style): Promise<string> {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  await draw(svg, format, value, style, 1);
  return new XMLSerializer().serializeToString(svg);
}

async function makePng(format: BarcodeFormat, value: string, style: Style): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await draw(canvas, format, value, style, style.scale);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG failed"))), "image/png"));
}

// ---------------------------------------------------------------- scanning

interface Found extends ScanHit {
  id: number;
}

function ResultCard({ hit }: { hit: Found }) {
  const { setNotice } = useSession();
  const info = classifyScan(hit.text);
  const [secret, setSecret] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied.");
    } catch {
      setNotice("Hindi ma-copy: the browser blocked clipboard access. Select the text and copy it by hand.");
    }
  };
  return (
    <li className="rounded-lg border border-line bg-ink p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-accent">{formatLabel(hit.format)}</span>
        {info.kind !== "text" && <span className="text-xs text-muted">{{ url: "Web link", wifi: "Wi-Fi network", email: "Email", phone: "Phone number", sms: "Text message", geo: "Location" }[info.kind]}</span>}
      </div>
      {info.wifi ? (
        <dl className="text-sm">
          <div className="flex gap-2">
            <dt className="text-muted">Network</dt>
            <dd className="break-all font-mono text-fg">{info.wifi.ssid}</dd>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <dt className="text-muted">Password</dt>
            <dd className="break-all font-mono text-fg">{info.wifi.password ? (secret ? info.wifi.password : "•".repeat(Math.min(info.wifi.password.length, 16))) : "(none)"}</dd>
            {info.wifi.password && (
              <button type="button" onClick={() => setSecret((value) => !value)} aria-label={secret ? "Hide Wi-Fi password" : "Show Wi-Fi password"} className="flex size-8 items-center justify-center rounded text-muted hover:text-fg">
                {secret ? <EyeOff aria-hidden className="size-4" strokeWidth={1.75} /> : <Eye aria-hidden className="size-4" strokeWidth={1.75} />}
              </button>
            )}
          </div>
          <div className="mt-1 flex gap-2">
            <dt className="text-muted">Security</dt>
            <dd className="font-mono text-fg">{info.wifi.security}</dd>
          </div>
        </dl>
      ) : (
        <p data-scan-text className="break-all font-mono text-sm text-fg">
          {hit.text}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => copy(info.wifi ? info.wifi.password || info.wifi.ssid : hit.text)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg hover:border-accent">
          <Copy aria-hidden className="size-4" strokeWidth={1.75} />
          {info.wifi ? "Copy password" : "Copy"}
        </button>
        {info.kind === "url" && (
          <a href={hit.text.trim()} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg hover:border-accent">
            <ExternalLink aria-hidden className="size-4" strokeWidth={1.75} />
            Open link
          </a>
        )}
      </div>
      {info.kind === "url" && <p className="mt-2 text-xs text-muted">Krea does not open links by itself. Check the address before you open it: QR codes can lead to fake sites.</p>}
    </li>
  );
}

function Scanner() {
  const [engine, setEngine] = useState<ScanEngine | null>(null);
  const [engineError, setEngineError] = useState("");
  const [hits, setHits] = useState<Found[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [dragging, setDragging] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraOn(false);
  }, []);

  // The camera must never stay on: stop it when leaving the tab, hiding the page or closing Krea.
  useEffect(() => {
    const onHide = () => document.hidden && stopCamera();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stopCamera);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", stopCamera);
      stopCamera();
    };
  }, [stopCamera]);

  const load = useCallback(async () => {
    try {
      const scanner = await getScanner();
      setEngine(scanner.engine);
      return scanner;
    } catch {
      setEngineError("Hindi ma-load ang scanner. Check your connection once so Krea can download it, then try again.");
      return null;
    }
  }, []);

  const show = (found: ScanHit[]) => {
    // The same code seen twice is shown once.
    const unique = found.filter((hit, index) => found.findIndex((other) => other.text === hit.text && other.format === hit.format) === index);
    setHits(unique.map((hit) => ({ ...hit, id: ++counter.current })));
  };

  const scanFile = async (file: File | undefined) => {
    if (!file) return;
    stopCamera();
    setHits([]);
    if (!file.type.startsWith("image/")) {
      setStatus("That is not an image. Choose a photo or screenshot of the code (JPG, PNG, WebP).");
      return;
    }
    setBusy(true);
    setStatus("Reading the image…");
    try {
      const scanner = await load();
      if (!scanner) return;
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        setStatus(`Hindi mabasa ang "${file.name}". The file may be damaged or in a format this browser cannot open.`);
        return;
      }
      // Very large photos are shrunk: it is faster and small barcodes stay readable at this size.
      const longest = Math.max(bitmap.width, bitmap.height);
      let source: ImageBitmap | HTMLCanvasElement = bitmap;
      if (longest > 3000) {
        const ratio = 3000 / longest;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * ratio);
        canvas.height = Math.round(bitmap.height * ratio);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        source = canvas;
      }
      const found = await scanner.detect(source);
      bitmap.close();
      show(found);
      setStatus(found.length ? `Found ${found.length} code${found.length === 1 ? "" : "s"}.` : "Walang nakitang QR code o barcode. Try a sharper, closer photo, with the whole code in view and good light.");
    } catch {
      setStatus("May problema sa pag-scan. Try another image.");
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setHits([]);
    setStatus("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(cameraErrorMessage(new DOMException("", "NotFoundError")));
      return;
    }
    setBusy(true);
    try {
      const scanner = await load();
      if (!scanner) return;
      // The permission prompt appears here, only because the person pressed the button.
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      stream.current = media;
      setCameraOn(true);
      setStatus("Point the camera at a QR code or barcode.");
      // The <video> is rendered once cameraOn is true.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const el = video.current;
      if (!el) {
        stopCamera();
        return;
      }
      el.srcObject = media;
      await el.play().catch(() => undefined);
      const tick = async () => {
        if (!stream.current) return;
        if (el.readyState >= 2 && el.videoWidth > 0) {
          try {
            const found = await scanner.detect(el);
            if (found.length) {
              show(found);
              setStatus(`Found ${found.length} code${found.length === 1 ? "" : "s"}. Camera off.`);
              stopCamera();
              return;
            }
          } catch {
            // A bad frame: try the next one.
          }
        }
        timer.current = setTimeout(tick, 200);
      };
      tick();
    } catch (error) {
      stopCamera();
      setStatus(cameraErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // Paste an image (a screenshot) straight onto the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((entry) => entry.type.startsWith("image/"));
      if (file) scanFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // scanFile only uses stable callbacks and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Scan</h2>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          scanFile(event.dataTransfer.files[0]);
        }}
        className={`rounded-lg border border-dashed p-4 text-center ${dragging ? "border-accent bg-raised" : "border-line"}`}
      >
        <p className="text-sm text-fg">I-drop o i-paste ang larawan ng QR code o barcode dito.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileImage aria-hidden className="size-4" strokeWidth={2} />
            Scan from image
          </Button>
          {cameraOn ? (
            <Button onClick={() => { stopCamera(); setStatus("Camera off."); }}>
              <CameraOff aria-hidden className="size-4" strokeWidth={1.75} />
              Stop camera
            </Button>
          ) : (
            <Button onClick={startCamera} disabled={busy}>
              <Camera aria-hidden className="size-4" strokeWidth={1.75} />
              Use camera
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            scanFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {cameraOn && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line bg-ink">
          <video ref={video} playsInline muted aria-label="Camera view" className="aspect-video w-full object-cover" />
        </div>
      )}

      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-fg">
        {status}
      </p>
      {engineError && (
        <p role="alert" className="mt-2 rounded-md border border-signal/60 p-3 text-sm text-signal">
          {engineError}
        </p>
      )}

      {hits.length > 0 && (
        <ul aria-label="Scan results" className="mt-3 flex flex-col gap-2">
          {hits.map((hit) => (
            <ResultCard key={hit.id} hit={hit} />
          ))}
        </ul>
      )}

      <p data-engine={engine ?? ""} className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        {engine ? `Scanner in use: ${ENGINE_LABEL[engine]}.` : "The scanner loads when you scan something. Your browser's built-in BarcodeDetector is used if it can read QR codes and barcodes; otherwise Krea's own scanner library (about 1 MB, running on this device) is loaded."}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">Nothing is uploaded. The camera starts only when you press Use camera, and switches off when a code is found, when you press Stop, or when you leave this tab.</p>
    </div>
  );
}

// ---------------------------------------------------------------- editor

export default function BarcodeEditor() {
  // Nothing is saved.
  const [tab, setTab] = useState<Tab>("make");
  const [format, setFormat] = useState<BarcodeFormat>("CODE128");
  const [text, setText] = useState("KREA-2026-0001");
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState("");
  const { setNotice } = useSession();
  const panelId = useId();
  const set = (patch: Partial<Style>) => setStyle((current) => ({ ...current, ...patch }));

  const info = BARCODE_FORMATS.find((entry) => entry.value === format)!;
  const check = useMemo(() => checkBarcodeText(format, text.trim()), [format, text]);

  useEffect(() => {
    if (!check.ok) return;
    let cancelled = false;
    makeSvg(format, check.value, style)
      .then((markup) => {
        if (cancelled) return;
        setSvg(markup);
        setRenderError("");
      })
      .catch(() => {
        if (!cancelled) setRenderError("This text cannot be drawn as a barcode. Check the characters.");
      });
    return () => {
      cancelled = true;
    };
  }, [check, format, style]);

  const lowContrast = !style.transparent && contrastRatio(style.foreground, style.background) < 4;
  const inverted = !style.transparent && contrastRatio(style.foreground, "#000000") > contrastRatio(style.background, "#000000");
  const showPreview = check.ok && !renderError && svg;
  const fileName = `barcode-${format.toLowerCase()}-${check.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "code"}`;

  const downloadPng = async () => {
    try {
      downloadBlob(await makePng(format, check.value, style), `${fileName}.png`);
    } catch {
      setNotice("Hindi ma-gawa ang PNG. Try a smaller size.");
    }
  };

  const switchTab = (next: Tab) => setTab(next);

  const form = (
    <>
      <div role="tablist" aria-label="Barcode tools" onKeyDown={onTabListKeyDown} className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1">
        {(
          [
            ["make", "Make barcode"],
            ["scan", "Scan"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${panelId}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${panelId}-panel`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => switchTab(id)}
            className={`min-h-10 rounded px-2 text-sm transition-colors ${tab === id ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-tab-${tab}`} className="flex flex-col gap-5">
        {tab === "make" ? (
          <>
            <Group title="Barcode">
              <div>
                <label htmlFor="barcode-format" className="mb-1.5 block text-sm text-fg">
                  Type
                </label>
                <select
                  id="barcode-format"
                  value={format}
                  onChange={(event) => {
                    const next = event.target.value as BarcodeFormat;
                    setFormat(next);
                    // Offer a valid sample for the new type when the old text cannot be used with it.
                    if (!checkBarcodeText(next, text.trim()).ok) setText(BARCODE_FORMATS.find((entry) => entry.value === next)!.example);
                  }}
                  className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted"
                >
                  {BARCODE_FORMATS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{info.hint}</p>
              </div>
              <TextInput label="Text or number" value={text} onChange={setText} placeholder={info.example} />
              {text.trim() && !check.ok && (
                <p role="alert" className="flex gap-2 rounded-md border border-signal/60 p-3 text-sm text-signal">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  {check.error}
                </p>
              )}
              {check.ok && check.note && (
                <p aria-live="polite" className="flex gap-2 text-xs text-accent">
                  <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                  {check.note}
                </p>
              )}
              {format !== "CODE128" && format !== "CODE39" && (
                <p className="text-xs leading-relaxed text-muted">Retail EAN and UPC numbers are issued by GS1. A made-up number draws a valid barcode, but may clash with a real product.</p>
              )}
            </Group>

            <Group title="Size and colour">
              <Slider id="bc-width" label="Bar width" value={style.barWidth} min={1} max={6} unit=" px" onChange={(barWidth) => set({ barWidth })} />
              <Slider id="bc-height" label="Bar height" value={style.height} min={30} max={240} step={5} unit=" px" onChange={(height) => set({ height })} />
              <Slider id="bc-margin" label="White margin" value={style.margin} min={0} max={40} unit=" px" onChange={(margin) => set({ margin })} />
              <Toggle label="Show the number under the bars" checked={style.showText} onChange={(showText) => set({ showText })} />
              {style.showText && <Slider id="bc-font" label="Text size" value={style.fontSize} min={10} max={36} unit=" px" onChange={(fontSize) => set({ fontSize })} />}
              <ColorInput label="Bar colour" value={style.foreground} onChange={(foreground) => set({ foreground })} />
              <ColorInput label="Background colour" value={style.background} onChange={(background) => set({ background })} />
              <Toggle label="Transparent background" checked={style.transparent} onChange={(transparent) => set({ transparent })} hint="For PNG and SVG. Scanners need dark bars on a light surface." />
              <div>
                <label htmlFor="bc-scale" className="mb-1.5 block text-sm text-fg">
                  PNG size
                </label>
                <select id="bc-scale" value={style.scale} onChange={(event) => set({ scale: Number(event.target.value) })} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}x {value === 2 ? "(default)" : value === 1 ? "(smallest)" : "(sharper for print)"}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted">The SVG is a vector and stays sharp at any size.</p>
              </div>
              {(lowContrast || inverted) && (
                <p role="alert" className="flex gap-2 rounded-md border border-signal/60 p-3 text-sm text-signal">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  {inverted ? "Light bars on a dark background are not read by many scanners. Use dark bars on a light background." : "Low contrast between the bars and the background: scanners may not read this."}
                </p>
              )}
            </Group>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted">I-scan ang QR code o barcode mula sa larawan, o gamitin ang camera. Ang resulta ay lalabas sa Result panel. Walang naa-upload.</p>
        )}
      </div>
    </>
  );

  const preview =
    tab === "make" ? (
      <div className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Your barcode</h2>
        <div className="checkerboard flex min-h-48 items-center justify-center overflow-x-auto rounded-lg border border-line p-4">
          {showPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`${info.label} barcode for ${check.value}`} className="max-w-full" />
          ) : (
            <p className="text-sm text-muted">{renderError || "Type a valid text or number to see the barcode."}</p>
          )}
        </div>
        {showPreview && (
          <p className="mt-3 font-mono text-xs text-muted">
            {info.label} · {check.value}
          </p>
        )}
      </div>
    ) : (
      <Scanner />
    );

  const actions =
    tab === "make" ? (
      <>
        <Button variant="primary" onClick={downloadPng} disabled={!showPreview}>
          <Download aria-hidden className="size-4" strokeWidth={2} />
          PNG
        </Button>
        <Button onClick={() => downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${fileName}.svg`)} disabled={!showPreview}>
          <FileCode2 aria-hidden className="size-4" strokeWidth={1.75} />
          SVG
        </Button>
      </>
    ) : (
      undefined
    );

  return <EditorShell label="Barcode generator and scanner" form={form} preview={preview} actions={actions} previewLabel={tab === "make" ? "Barcode" : "Scan"} />;
}
