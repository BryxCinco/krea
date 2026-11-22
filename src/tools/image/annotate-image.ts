/**
 * Tool 59: Image Annotator. Marks up screenshots and photos with arrows, boxes,
 * highlights, numbered steps, text and freehand drawing, then saves the image at
 * full resolution. `drawMarks` paints both the on-screen preview and the export,
 * so what you see is what you save. UI: components/stage/editors/annotate-image-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const annotateImage = editorTool(
  {
    id: 59,
    slug: "image-annotator",
    name: "Image Annotator",
    verb: "Annotate image",
    description: "Mark up screenshots and photos with arrows, boxes, highlights, numbered steps and text.",
    seoTitle: "Image Annotator: add arrows, boxes and text to screenshots, offline",
    seoDescription:
      "Annotate screenshots and photos in your browser: arrows, boxes, highlights, numbered steps, text and freehand drawing. Paste a screenshot, mark it up and save it as PNG or JPG at full resolution. No upload.",
    howTo: [
      "Open an image, or paste a screenshot with Ctrl+V.",
      "Pick Arrow, Box, Highlight, Step, Text or Pen, a colour and a size, then drag or tap on the image.",
      "Undo or remove marks from the list, then download the annotated image.",
    ],
    faqs: [
      { q: "Can I paste a screenshot directly?", a: "Yes. Take a screenshot (Windows + Shift + S, or Cmd + Shift + 4 on a Mac) and press Ctrl+V or Cmd+V on this page. It opens right away." },
      { q: "Does it lower the quality of my image?", a: "No. Marks are drawn onto the image at its original resolution. Save as PNG for screenshots with text; JPG makes smaller files for photos." },
      { q: "How do numbered steps work?", a: "Each tap with Step places the next number (1, 2, 3…) in a circle, the usual way to show the order of clicks in a how-to guide. Removing a step renumbers the rest." },
      { q: "Can I hide private details?", a: "Use Blur & Redact for that: it blacks out, pixelates or blurs areas so they cannot be recovered. A highlight here is see-through on purpose." },
      { q: "Is my image uploaded?", a: "No. Everything happens in your browser, and the image and marks are kept only until you close the tab." },
    ],
    icon: "markup",
  },
  "image",
);

export type ImageMarkKind = "arrow" | "box" | "highlight" | "step" | "text" | "pen";

/** All coordinates are in pixels of the original image. `size` is the 1-10 size setting. */
interface Base {
  id: number;
  color: string;
  size: number;
}
export type ImageMark =
  | (Base & { kind: "arrow"; x1: number; y1: number; x2: number; y2: number })
  | (Base & { kind: "box" | "highlight"; x: number; y: number; w: number; h: number })
  | (Base & { kind: "step"; x: number; y: number })
  | (Base & { kind: "text"; x: number; y: number; text: string })
  | (Base & { kind: "pen"; points: [number, number][] });

export const MARK_COLORS = ["#e11d48", "#f59e0b", "#facc15", "#16a34a", "#2563eb", "#111111", "#ffffff"];

/** Pixel sizes for a mark, scaled to the image so a size looks the same on a phone photo and a small screenshot. */
export function markMetrics(width: number, height: number, size: number) {
  const unit = Math.max(width, height) / 100;
  const line = Math.max(1.5, size * unit * 0.18);
  return { line, font: Math.max(10, size * unit * 1.1), head: line * 4.5, radius: Math.max(9, size * unit * 0.75) };
}

/** Black or white, whichever reads better on `hex`. */
export function contrastInk(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}

export const TEXT_LINE_HEIGHT = 1.2;

/**
 * Paint marks onto a 2D context whose drawing space is `scale` × the image's
 * pixels (1 for the export, less for a smaller preview). Steps are numbered in
 * the order they were placed.
 */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: ImageMark[], width: number, height: number, scale = 1): void {
  let step = 0;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const mark of marks) {
    const m = markMetrics(width, height, mark.size);
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    ctx.lineWidth = m.line;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    switch (mark.kind) {
      case "arrow": {
        const angle = Math.atan2(mark.y2 - mark.y1, mark.x2 - mark.x1);
        const length = Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1);
        const head = Math.min(m.head, length * 0.6);
        // Stop the shaft inside the head so its round cap does not poke through the tip.
        const shaftEnd = Math.max(0, length - head * 0.7);
        ctx.beginPath();
        ctx.moveTo(mark.x1, mark.y1);
        ctx.lineTo(mark.x1 + Math.cos(angle) * shaftEnd, mark.y1 + Math.sin(angle) * shaftEnd);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mark.x2, mark.y2);
        ctx.lineTo(mark.x2 - head * Math.cos(angle - Math.PI / 7), mark.y2 - head * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(mark.x2 - head * Math.cos(angle + Math.PI / 7), mark.y2 - head * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "box":
        ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
        break;
      case "highlight":
        ctx.globalAlpha = 0.38;
        ctx.globalCompositeOperation = "multiply";
        ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
        break;
      case "step": {
        step++;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, m.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, m.radius * 0.14);
        ctx.strokeStyle = contrastInk(mark.color);
        ctx.stroke();
        ctx.fillStyle = contrastInk(mark.color);
        ctx.font = `700 ${m.radius * 1.15}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(step), mark.x, mark.y + m.radius * 0.05);
        break;
      }
      case "text": {
        ctx.font = `700 ${m.font}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        // A halo in the contrasting colour keeps text readable on busy screenshots.
        ctx.lineWidth = m.font * 0.16;
        ctx.strokeStyle = contrastInk(mark.color);
        mark.text.split("\n").forEach((line, i) => {
          const y = mark.y + i * m.font * TEXT_LINE_HEIGHT;
          ctx.strokeText(line, mark.x, y);
          ctx.fillText(line, mark.x, y);
        });
        break;
      }
      case "pen": {
        ctx.beginPath();
        mark.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (mark.points.length === 1) ctx.lineTo(mark.points[0][0] + 0.01, mark.points[0][1]);
        ctx.stroke();
        break;
      }
    }
  }
  ctx.restore();
}
