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
import { docScan } from "./image/doc-scan";
import { idPhoto } from "./image/id-photo";
import { palette } from "./image/palette";
import { removeBackground } from "./image/remove-background";
import { redact } from "./image/redact";
import { resize } from "./image/resize";
import { signatureMaker } from "./image/signature-maker";
import { stripMetadataTool } from "./image/strip-metadata";
import { upscale } from "./image/upscale";
import { video } from "./image/video";
import { videoSpeed } from "./image/video-speed";
import { videoCrop } from "./image/video-crop";
import { videoAudio } from "./image/video-audio";
import { videoConvert } from "./image/video-convert";
import { videoFrames } from "./image/video-frames";
import { videoTrim } from "./image/video-trim";
import { videoWatermark } from "./image/video-watermark";
import { watermark } from "./image/watermark";
import { compressPdf } from "./pdf/compress-pdf";
import { cropPdf } from "./pdf/crop-pdf";
import { csvToPdf } from "./pdf/csv-to-pdf";
import { imageToPdf } from "./pdf/image-to-pdf";
import { merge } from "./pdf/merge";
import { ocr } from "./pdf/ocr";
import { organizePdf } from "./pdf/organize-pdf";
import { pageNumbers } from "./pdf/page-numbers";
import { pdfToImage } from "./pdf/pdf-to-image";
import { protectPdf } from "./pdf/protect-pdf";
import { signPdf } from "./pdf/sign-pdf";
import { split } from "./pdf/split";
import { txtToPdf } from "./pdf/txt-to-pdf";
import { watermarkPdf } from "./pdf/watermark-pdf";
import { barcode } from "./text/barcode";
import { invoice } from "./text/invoice";
import { markdown } from "./text/markdown";
import { password } from "./text/password";
import { payroll } from "./text/payroll";
import { phPay } from "./text/ph-pay";
import { qr } from "./text/qr";
import { resume } from "./text/resume";
import { textToolkit } from "./text/text-toolkit";
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
  // Text & Docs (21-25): editors with their own UI
  markdown,
  resume,
  invoice,
  qr,
  payroll,
  // Milestone 4 (26-35)
  stripMetadataTool,
  signatureMaker,
  pageNumbers,
  textToolkit,
  password,
  barcode,
  redact,
  phPay,
  docScan,
  video,
  // Milestone 5 (36-42): video tools
  videoTrim,
  videoSpeed,
  videoCrop,
  videoWatermark,
  videoAudio,
  videoConvert,
  videoFrames,
  // Milestone 6 (43-50): PDF Plus
  txtToPdf,
  csvToPdf,
  cropPdf,
];

export const categories: { id: ToolCategory; label: string }[] = [
  { id: "image", label: "Photo & Image" },
  { id: "pdf", label: "PDF" },
  { id: "text", label: "Text & Docs" },
  { id: "code", label: "QR & Barcode" },
  { id: "video", label: "Video" },
];

export function getTool(slug: string): Tool | undefined {
  return tools.find((tool) => tool.slug === slug);
}

/**
 * Related tools for a tool page: tools that accept the same kind of input or
 * share the category, excluding the tool itself. Stable order (registry order).
 */
export function relatedTools(tool: Tool, limit = 4): Tool[] {
  const sameInput = (other: Tool) => other.accepts.some((mime) => tool.accepts.includes(mime));
  const ranked = tools
    .filter((other) => other.slug !== tool.slug)
    .map((other) => ({ other, score: (other.category === tool.category ? 2 : 0) + (sameInput(other) ? 1 : 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map((entry) => entry.other);
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
