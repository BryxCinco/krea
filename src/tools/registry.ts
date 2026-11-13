/**
 * Central tool registry.
 *
 * Adding a tool = one new file under image/, pdf/ or text/ + one line here.
 * Everything else (Moves on the Stage, the card grid, the Command Palette, the
 * /tools/[slug] route, Render Chains and the workers) reads from this list.
 */
import { collage } from "./image/collage";
import { compress } from "./image/compress";
import { convert } from "./image/convert";
import { cropRotate } from "./image/crop-rotate";
import { idPhoto } from "./image/id-photo";
import { palette } from "./image/palette";
import { removeBackground } from "./image/remove-background";
import { resize } from "./image/resize";
import { upscale } from "./image/upscale";
import { watermark } from "./image/watermark";
import { compressPdf } from "./pdf/compress-pdf";
import { imageToPdf } from "./pdf/image-to-pdf";
import { merge } from "./pdf/merge";
import { ocr } from "./pdf/ocr";
import { organizePdf } from "./pdf/organize-pdf";
import { pdfToImage } from "./pdf/pdf-to-image";
import { protectPdf } from "./pdf/protect-pdf";
import { signPdf } from "./pdf/sign-pdf";
import { split } from "./pdf/split";
import { watermarkPdf } from "./pdf/watermark-pdf";
import type { Move, Tool, ToolCategory } from "./types";

export const tools: Tool[] = [
  // Image (1-10)
  compress,
  resize,
  cropRotate,
  convert,
  removeBackground,
  idPhoto,
  watermark,
  upscale,
  palette,
  collage,
  // PDF (11-20)
  merge,
  split,
  compressPdf,
  pdfToImage,
  imageToPdf,
  watermarkPdf,
  signPdf,
  protectPdf,
  organizePdf,
  ocr,
];

export const categories: { id: ToolCategory; label: string }[] = [
  { id: "image", label: "Photo & Image" },
  { id: "pdf", label: "PDF" },
  { id: "text", label: "Text & Docs" },
];

export function getTool(slug: string): Tool | undefined {
  return tools.find((tool) => tool.slug === slug);
}

/**
 * Moves for the files currently on the Stage: every tool that accepts all of
 * them. With several files, batch-capable tools come first.
 */
export function movesFor(mimes: string[]): Move[] {
  if (mimes.length === 0) return [];
  const moves = tools
    .filter((tool) => mimes.every((mime) => tool.accepts.includes(mime)) && mimes.length >= (tool.minFiles ?? 1))
    .map((tool) => ({ tool, batch: mimes.length > 1 }));
  if (mimes.length > 1) {
    // Combining tools (merge, collage, image to PDF) are the natural first choice for a pile of files.
    moves.sort((a, b) => Number(b.tool.input === "all") - Number(a.tool.input === "all"));
  }
  return moves;
}
