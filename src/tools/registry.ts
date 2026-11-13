/**
 * Central tool registry.
 *
 * Adding a tool = one new file under image/, pdf/ or text/ + one line here.
 * Everything else (Moves on the Stage, the Command Palette, the All Tools page,
 * the /tools/[slug] route and the workers) reads from this list.
 */
import { compress } from "./image/compress";
import { convert } from "./image/convert";
import { cropRotate } from "./image/crop-rotate";
import { idPhoto } from "./image/id-photo";
import { removeBackground } from "./image/remove-background";
import { resize } from "./image/resize";
import { imageToPdf } from "./pdf/image-to-pdf";
import { merge } from "./pdf/merge";
import { pdfToImage } from "./pdf/pdf-to-image";
import { split } from "./pdf/split";
import type { Move, Tool, ToolCategory } from "./types";

export const tools: Tool[] = [
  // Image
  compress,
  resize,
  cropRotate,
  convert,
  removeBackground,
  idPhoto,
  // PDF
  merge,
  split,
  pdfToImage,
  imageToPdf,
];

export const categories: { id: ToolCategory; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "pdf", label: "PDF" },
  { id: "text", label: "Text & Documents" },
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
    // Combining tools (merge, image to PDF) are the natural first choice for a pile of files.
    moves.sort((a, b) => Number(b.tool.input === "all") - Number(a.tool.input === "all"));
  }
  return moves;
}
