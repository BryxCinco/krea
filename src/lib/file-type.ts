/**
 * File-type detection. We sniff magic bytes instead of trusting the extension
 * or the browser-reported MIME type, which is often empty or wrong.
 */

/**
 * "convertible": a photo format Krea converts to JPEG when it arrives (HEIC, AVIF).
 * "archive": a ZIP file (ZIP to PDF reads the images and PDFs inside).
 */
export type FileKind = "image" | "pdf" | "text" | "archive" | "convertible" | "unknown";

export interface DetectedType {
  kind: FileKind;
  /** Normalized MIME type ("" when unknown). */
  mime: string;
  /** Set when we recognise the format but cannot process it, with the reason. */
  unsupported?: string;
}

/** Image formats every tool can decode in a worker. */
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const PDF_MIME = "application/pdf";
/** Text MIME types are normalized from the extension, because browsers report CSV as many things (Windows says application/vnd.ms-excel). */
export const TEXT_MIME = "text/plain";
export const CSV_MIME = "text/csv";
export const TSV_MIME = "text/tab-separated-values";
export const ZIP_MIME = "application/zip";

/** Hard ceiling so a stray multi-GB file fails fast with a clear message. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export async function detectFileType(file: Blob, fileName = ""): Promise<DetectedType> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mime: "image/png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (ascii(bytes, 0, 5) === "%PDF-") return { kind: "pdf", mime: PDF_MIME };

  // Recognised but not processable: say why instead of a vague "unsupported".
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return { kind: "convertible", mime: "image/avif" };
    // iPhone photos. "mif1"/"msf1" are generic HEIF brands; the converter tries HEIC first, then the browser's own decoder.
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return { kind: "convertible", mime: "image/heic" };
  }
  if (ascii(bytes, 0, 3) === "GIF") {
    return { kind: "unknown", mime: "image/gif", unsupported: "GIF is not supported. Use JPG, PNG or WebP." };
  }
  if (ascii(bytes, 0, 2) === "BM") {
    return { kind: "unknown", mime: "image/bmp", unsupported: "BMP is not supported. Use JPG, PNG or WebP." };
  }

  const name = fileName.toLowerCase();
  // ZIP. Word, Excel and PowerPoint files are ZIPs too, so only real .zip files (or nameless pastes) count.
  if (ascii(bytes, 0, 2) === "PK" && (startsWith(bytes, [0x03, 0x04], 2) || startsWith(bytes, [0x05, 0x06], 2))) {
    if (/\.(docx|xlsx|pptx|odt|ods|odp|epub|jar|apk)$/.test(name)) {
      return { kind: "unknown", mime: file.type || "", unsupported: "Office and other packaged files are not supported. Save it as PDF first." };
    }
    return { kind: "archive", mime: ZIP_MIME };
  }
  if (/\.csv$/.test(name) || file.type === CSV_MIME) return { kind: "text", mime: CSV_MIME };
  if (/\.(tsv|tab)$/.test(name) || file.type === TSV_MIME) return { kind: "text", mime: TSV_MIME };
  if (file.type.startsWith("text/") || /\.(txt|md|markdown|log)$/.test(name)) return { kind: "text", mime: TEXT_MIME };
  return { kind: "unknown", mime: file.type || "", unsupported: "Hindi namin kilala ang file type na ito." };
}

/** "1.4 MB" style size for status readouts. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Swap a filename's extension, optionally adding a suffix before it. */
export function renameFile(name: string, ext: string, suffix = ""): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}${suffix}.${ext}`;
}

export function extensionFor(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case PDF_MIME:
      return "pdf";
    case TEXT_MIME:
      return "txt";
    case CSV_MIME:
      return "csv";
    case TSV_MIME:
      return "tsv";
    case ZIP_MIME:
      return "zip";
    default:
      return "bin";
  }
}
