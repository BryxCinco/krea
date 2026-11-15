"use client";

import { Download, Save, Trash2, Undo2 } from "lucide-react";
import { Caveat, Dancing_Script, Great_Vibes, Homemade_Apple, Mrs_Saint_Delafield } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { deleteAllSignatures, deleteSignature, MAX_SAVED, saveSignature, useSavedSignatures } from "@/lib/saved-signatures";
import { useSession } from "@/lib/session";
import { trimmedCanvas } from "@/lib/signature-canvas";
import { ColorInput, ConfirmButton, Group, Segmented, TextInput } from "./form";
import { EditorShell } from "./editor-shell";

// Handwriting fonts. next/font downloads them at build time and serves them from this site:
// no request to Google at runtime. preload is off so they load only when this tool opens.
const caveat = Caveat({ subsets: ["latin"], weight: "600", preload: false, display: "swap" });
const dancing = Dancing_Script({ subsets: ["latin"], weight: "600", preload: false, display: "swap" });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400", preload: false, display: "swap" });
const homemade = Homemade_Apple({ subsets: ["latin"], weight: "400", preload: false, display: "swap" });
const saintDelafield = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", preload: false, display: "swap" });

const FONTS = [
  { id: "caveat", label: "Caveat", family: caveat.style.fontFamily, weight: 600 },
  { id: "dancing", label: "Dancing Script", family: dancing.style.fontFamily, weight: 600 },
  { id: "vibes", label: "Great Vibes", family: greatVibes.style.fontFamily, weight: 400 },
  { id: "apple", label: "Homemade Apple", family: homemade.style.fontFamily, weight: 400 },
  { id: "saint", label: "Mrs Saint Delafield", family: saintDelafield.style.fontFamily, weight: 400 },
];

/** Pen colours are document content (like ink), not theme colours. */
const INKS = [
  { value: "#111111", label: "Black" },
  { value: "#1a3fa8", label: "Blue" },
  { value: "#0b3d2e", label: "Green" },
  { value: "#8a1c1c", label: "Red" },
];

const PAD_W = 1000;
const PAD_H = 360;
/** Exported at twice the pad size so the PNG stays sharp when it is scaled onto a page. */
const EXPORT_SCALE = 2;

interface Point {
  x: number;
  y: number;
  /** Pen pressure 0..1 (0.5 for mouse and touch, which report none). */
  p: number;
}
interface Stroke {
  pts: Point[];
  /** Only pens vary the line width with pressure. */
  pen: boolean;
}
interface Output {
  url: string;
  width: number;
  height: number;
}

const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Paint strokes as smooth curves through the midpoints of the sampled points. */
function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number, ink: string, thickness: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  for (const stroke of strokes) {
    const width = (p: number) => thickness * scale * (stroke.pen ? 0.35 + p * 1.3 : 1);
    const { pts } = stroke;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x * scale, pts[0].y * scale, width(pts[0].p) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      const from = i === 1 ? pts[0] : mid(pts[i - 1], pts[i]);
      const to = i === pts.length - 1 ? pts[i] : mid(pts[i], pts[i + 1]);
      ctx.lineWidth = width(pts[i].p);
      ctx.beginPath();
      ctx.moveTo(from.x * scale, from.y * scale);
      ctx.quadraticCurveTo(pts[i].x * scale, pts[i].y * scale, to.x * scale, to.y * scale);
      ctx.stroke();
    }
  }
}

function exportStrokes(strokes: Stroke[], ink: string, thickness: number): Output | null {
  if (!strokes.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = PAD_W * EXPORT_SCALE;
  canvas.height = PAD_H * EXPORT_SCALE;
  paint(canvas.getContext("2d")!, strokes, EXPORT_SCALE, ink, thickness);
  const trimmed = trimmedCanvas(canvas, 12);
  return trimmed && { url: trimmed.toDataURL("image/png"), width: trimmed.width, height: trimmed.height };
}

async function exportText(text: string, font: (typeof FONTS)[number], ink: string): Promise<Output | null> {
  const value = text.trim();
  if (!value) return null;
  const spec = `${font.weight} 240px ${font.family}`;
  await document.fonts.load(spec, value);
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d")!;
  measure.font = spec;
  canvas.width = Math.min(8000, Math.ceil(measure.measureText(value).width) + 240);
  canvas.height = 700;
  const ctx = canvas.getContext("2d")!;
  ctx.font = spec;
  ctx.fillStyle = ink;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, 120, 400);
  const trimmed = trimmedCanvas(canvas, 12);
  return trimmed && { url: trimmed.toDataURL("image/png"), width: trimmed.width, height: trimmed.height };
}

export default function SignatureEditor() {
  // Nothing about the drawing or typed name is saved unless the user presses Save.
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [ink, setInk] = useState(INKS[0].value);
  const [thickness, setThickness] = useState(4);
  const [name, setName] = useState("");
  const [fontId, setFontId] = useState(FONTS[0].id);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [typed, setTyped] = useState<Output | null>(null);
  const saved = useSavedSignatures();
  const { setNotice } = useSession();

  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const font = FONTS.find((entry) => entry.id === fontId) ?? FONTS[0];

  const redraw = (extra?: Stroke | null) => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    paint(ctx, extra ? [...strokes, extra] : strokes, 1, ink, thickness);
  };
  useEffect(() => {
    redraw();
    // redraw reads the latest strokes, ink and thickness; it is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, ink, thickness, mode]);

  // Load every handwriting font once so they are cached for offline use and ready in the picker.
  useEffect(() => {
    FONTS.forEach((entry) => document.fonts.load(`${entry.weight} 40px ${entry.family}`, "Aa").catch(() => undefined));
  }, []);

  const drawn = useMemo(() => (mode === "draw" ? exportStrokes(strokes, ink, thickness) : null), [mode, strokes, ink, thickness]);
  useEffect(() => {
    if (mode !== "type") return;
    let stale = false;
    exportText(name, font, ink).then((output) => {
      if (!stale) setTyped(output);
    });
    return () => {
      stale = true;
    };
  }, [mode, name, font, ink]);
  const output = mode === "draw" ? drawn : name.trim() ? typed : null;

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * PAD_W,
      y: ((event.clientY - box.top) / box.height) * PAD_H,
      p: event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5,
    };
  };
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    live.current = { pts: [point(event)], pen: event.pointerType === "pen" };
    redraw(live.current);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!live.current) return;
    // Coalesced events keep fast strokes smooth.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const sources = events.length ? events : [event.nativeEvent];
    const box = event.currentTarget.getBoundingClientRect();
    for (const source of sources) {
      live.current.pts.push({
        x: ((source.clientX - box.left) / box.width) * PAD_W,
        y: ((source.clientY - box.top) / box.height) * PAD_H,
        p: event.pointerType === "pen" && source.pressure > 0 ? source.pressure : 0.5,
      });
    }
    redraw(live.current);
  };
  const onPointerUp = () => {
    const stroke = live.current;
    live.current = null;
    if (stroke) setStrokes((current) => [...current, stroke]);
  };

  const clear = () => {
    setStrokes([]);
    setName("");
    setTyped(null);
  };

  const toBlob = async () => (await fetch(output!.url)).blob();
  const download = async () => {
    if (output) downloadBlob(await toBlob(), "signature.png");
  };
  const save = () => {
    if (!output) return;
    const outcome = saveSignature(output.url);
    setNotice(
      outcome === "saved"
        ? "Na-save sa browser na ito lang. You can use it in Sign PDF."
        : outcome === "full"
          ? `Puno na: you can keep up to ${MAX_SAVED} signatures. Delete one first.`
          : outcome === "too-big"
            ? "Masyadong malaki ang signature to save. Draw it with fewer strokes."
            : "Hindi ma-save: the browser is blocking storage. You can still download the PNG.",
    );
  };

  const form = (
    <>
      <Group title="Signature">
        <Segmented
          label="Method"
          value={mode}
          onChange={setMode}
          options={[
            { value: "draw", label: "Draw" },
            { value: "type", label: "Type" },
          ]}
        />

        {mode === "draw" ? (
          <div>
            <div className="relative">
              <canvas
                ref={canvas}
                width={PAD_W}
                height={PAD_H}
                aria-label="Signature drawing area. Draw with your finger, stylus or mouse. To use the keyboard, switch to Type."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="block w-full cursor-crosshair touch-none rounded-md border border-line bg-paper"
                style={{ aspectRatio: `${PAD_W} / ${PAD_H}` }}
              />
              {!strokes.length && (
                <p aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-black/50">
                  Pirmahan dito. Draw with your finger or mouse.
                </p>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setStrokes((current) => current.slice(0, -1))}
                disabled={!strokes.length}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg hover:border-accent disabled:opacity-40"
              >
                <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
                Undo stroke
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={!strokes.length}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg hover:border-signal hover:text-signal disabled:opacity-40"
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                Clear
              </button>
            </div>
          </div>
        ) : (
          <>
            <TextInput label="Your name" value={name} onChange={setName} placeholder="Juan Dela Cruz" hint="Latin letters work best in these fonts." />
            <fieldset>
              <legend className="mb-1.5 text-sm text-fg">Handwriting style</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {FONTS.map((entry) => (
                  <label
                    key={entry.id}
                    className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                      fontId === entry.id ? "border-accent bg-raised" : "border-line hover:border-muted"
                    }`}
                  >
                    <input type="radio" name="signature-font" value={entry.id} checked={fontId === entry.id} onChange={() => setFontId(entry.id)} className="sr-only" />
                    <span className="truncate text-2xl text-fg" style={{ fontFamily: entry.family, fontWeight: entry.weight }}>
                      {name.trim() || "Signature"}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{entry.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
      </Group>

      <Group title="Ink">
        <div role="radiogroup" aria-label="Ink colour" className="flex flex-wrap gap-1.5">
          {INKS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={ink === option.value}
              onClick={() => setInk(option.value)}
              className={`flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${ink === option.value ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`}
            >
              <span aria-hidden className="size-3.5 rounded-full border border-line" style={{ backgroundColor: option.value }} />
              {option.label}
            </button>
          ))}
        </div>
        <ColorInput label="Custom colour" value={ink} onChange={setInk} />
        {mode === "draw" && (
          <div>
            <label htmlFor="signature-thickness" className="mb-1.5 flex items-baseline justify-between text-sm text-fg">
              Thickness
              <span className="font-mono text-xs text-muted">{thickness}</span>
            </label>
            <input id="signature-thickness" type="range" min={1} max={12} step={1} value={thickness} onChange={(event) => setThickness(Number(event.target.value))} className="w-full accent-lime" />
          </div>
        )}
      </Group>

      <Group
        title="Saved on this device"
        actions={saved.length ? <ConfirmButton label="Delete all" confirmLabel="Delete all saved?" onConfirm={deleteAllSignatures} /> : undefined}
      >
        <p className="text-xs leading-relaxed text-muted">
          Saved only in this browser, never uploaded. Anyone using this browser profile can see them, so delete when you are done on a shared computer.
        </p>
        {saved.length === 0 ? (
          <p className="text-sm text-muted">Wala pang naka-save. Press Save to keep a signature here for Sign PDF.</p>
        ) : (
          <ul aria-label="Saved signatures" className="grid grid-cols-2 gap-2">
            {saved.map((entry, index) => (
              <li key={entry.id} className="rounded-md border border-line p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
                <img src={entry.dataUrl} alt={`Saved signature ${index + 1}`} className="checkerboard h-16 w-full rounded object-contain p-1" />
                <div className="mt-1.5 flex gap-1">
                  <button
                    type="button"
                    onClick={async () => downloadBlob(await (await fetch(entry.dataUrl)).blob(), `signature-${index + 1}.png`)}
                    aria-label={`Download saved signature ${index + 1}`}
                    className="flex min-h-10 flex-1 items-center justify-center rounded text-muted hover:text-accent"
                  >
                    <Download aria-hidden className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSignature(entry.id)}
                    aria-label={`Delete saved signature ${index + 1}`}
                    className="flex min-h-10 flex-1 items-center justify-center rounded text-muted hover:text-signal"
                  >
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Your PNG</h2>
      <div className="checkerboard flex min-h-48 items-center justify-center rounded-lg border border-line p-4">
        {output ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL
          <img src={output.url} alt="Your signature as it will be exported" className="max-h-56 max-w-full object-contain" />
        ) : (
          <p className="text-sm text-muted">{mode === "draw" ? "Draw your signature to see it here." : "Type your name to see it here."}</p>
        )}
      </div>
      <p className="mt-3 font-mono text-xs text-muted">
        {output ? `${output.width} × ${output.height} px · transparent PNG, cropped to the ink` : "Transparent PNG, cropped to the ink"}
      </p>
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={download} disabled={!output}>
        <Download aria-hidden className="size-4" strokeWidth={2} />
        Download PNG
      </Button>
      <Button onClick={save} disabled={!output}>
        <Save aria-hidden className="size-4" strokeWidth={1.75} />
        Save in this browser
      </Button>
    </>
  );

  return <EditorShell label="Signature maker" form={form} preview={preview} actions={actions} previewLabel="PNG" />;
}
