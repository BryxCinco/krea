"use client";

import { Eraser, Upload } from "lucide-react";
import { Caveat } from "next/font/google";
import { useEffect, useRef, useState } from "react";

// Handwriting font for typed signatures. Self-hosted at build time; only fetched when this panel is used.
const script = Caveat({ subsets: ["latin"], weight: "600", preload: false, display: "swap" });

type Mode = "draw" | "type" | "upload";

/** Pen colours are document content (like ink), not theme colours. */
const INKS = [
  { value: "#111111", label: "Black" },
  { value: "#1a3fa8", label: "Blue" },
];

const PAD_WIDTH = 900;
const PAD_HEIGHT = 320;

/** Crop a canvas to the pixels that were actually drawn on and return a PNG data URL ("" if empty). */
function trimmedDataUrl(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return "";
  const pad = 8;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")!.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/** Signature field: draw with a finger, stylus or mouse; type a name; or upload a photo of a signature. */
export function SignaturePad({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const [mode, setMode] = useState<Mode>("draw");
  const [ink, setInk] = useState(INKS[0].value);
  const [typed, setTyped] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setTyped("");
    onChange("");
  };

  /** Pointer position in canvas pixels. */
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * PAD_WIDTH, y: ((event.clientY - box.top) / box.height) * PAD_HEIGHT };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
    // A tap without movement still leaves a dot.
    const ctx = event.currentTarget.getContext("2d")!;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = event.currentTarget.getContext("2d")!;
    const next = point(event);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (canvasRef.current) onChange(trimmedDataUrl(canvasRef.current));
  };

  // Typed signature: render the name in the handwriting font.
  useEffect(() => {
    if (mode !== "type") return;
    let stale = false;
    const text = typed.trim();
    if (!text) return;
    const font = `600 160px ${script.style.fontFamily}`;
    document.fonts.load(font, text).then(() => {
      if (stale) return;
      const canvas = document.createElement("canvas");
      const measure = canvas.getContext("2d")!;
      measure.font = font;
      canvas.width = Math.ceil(measure.measureText(text).width) + 80;
      canvas.height = 280;
      const ctx = canvas.getContext("2d")!;
      ctx.font = font;
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      ctx.fillText(text, 40, canvas.height / 2);
      onChange(trimmedDataUrl(canvas));
    });
    return () => {
      stale = true;
    };
    // onChange is stable enough here; re-rendering on every parent render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed, ink]);

  /** Uploaded photo of a signature: make the paper transparent so only the ink remains. */
  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = image;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Light pixels (paper) fade out; dark pixels (ink) stay.
        data[i + 3] = Math.min(data[i + 3], Math.max(0, Math.min(255, (200 - luminance) * 4)));
      }
      ctx.putImageData(image, 0, 0);
      onChange(trimmedDataUrl(canvas));
    } catch {
      onChange("");
    }
  };

  const tabs: { id: Mode; label: string }[] = [
    { id: "draw", label: "Draw" },
    { id: "type", label: "Type" },
    { id: "upload", label: "Upload" },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Signature method" className="grid grid-cols-3 gap-1 rounded-md border border-line bg-ink p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => {
              setMode(tab.id);
              clear();
            }}
            className={`min-h-9 rounded text-sm transition-colors ${mode === tab.id ? "bg-raised text-accent" : "text-muted hover:text-fg"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {mode === "draw" && (
          <canvas
            ref={canvasRef}
            width={PAD_WIDTH}
            height={PAD_HEIGHT}
            aria-label="Signature drawing area. Draw with your finger, stylus or mouse."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="block w-full cursor-crosshair touch-none rounded-md border border-line bg-paper"
            style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}` }}
          />
        )}
        {mode === "type" && (
          <input
            type="text"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              if (!event.target.value.trim()) onChange("");
            }}
            placeholder="Type your name"
            aria-label="Type your name"
            className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg placeholder:text-muted/70 hover:border-muted"
          />
        )}
        {mode === "upload" && (
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm text-fg hover:border-accent">
            <Upload aria-hidden className="size-4" strokeWidth={1.75} />
            Choose a photo of your signature
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => onUpload(event.target.files?.[0])} />
          </label>
        )}
      </div>

      {/* Preview of what will be placed on the page. */}
      {value && mode !== "draw" && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL
        <img src={value} alt="Your signature" className="mt-2 max-h-24 w-full rounded-md border border-line bg-paper object-contain p-2" />
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        {mode !== "upload" ? (
          <div role="radiogroup" aria-label="Ink colour" className="flex gap-1">
            {INKS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={ink === option.value}
                onClick={() => setInk(option.value)}
                className={`min-h-9 rounded-md border px-3 text-sm ${ink === option.value ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button type="button" onClick={clear} className="flex min-h-9 items-center gap-1.5 rounded px-2 text-sm text-muted hover:text-signal">
          <Eraser aria-hidden className="size-4" strokeWidth={1.75} />
          Clear
        </button>
      </div>
    </div>
  );
}
