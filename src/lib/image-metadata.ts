/**
 * Reads and removes image metadata (EXIF, GPS, XMP, IPTC, comments, text chunks)
 * directly from the file bytes, without decoding or re-compressing the pixels.
 * Worker-safe: no DOM, no dependencies.
 *
 * Supported: JPEG (segment removal), PNG (chunk removal), WebP (chunk removal).
 * Output is built from slices of the original bytes, so pixel data is untouched.
 */

export interface MetadataReport {
  /** Human-readable findings, e.g. ["Camera", "Apple iPhone 13"]. */
  rows: [string, string][];
  /** EXIF orientation (1 = upright). Anything else means viewers rotate the photo from the tag. */
  orientation: number;
  hasGps: boolean;
  /** An embedded preview image, which can still show the un-cropped original. */
  hasThumbnail: boolean;
  /** Other metadata containers found, with their size, e.g. "XMP 3.1 KB". */
  containers: string[];
}

export interface StripOptions {
  /** Keep the embedded colour profile (affects how colours look, holds no personal data). */
  keepProfile: boolean;
}

export interface StripResult {
  blob: Blob;
  /** What was taken out, for the note shown to the user. */
  removed: string[];
}

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

const ascii = (bytes: Uint8Array, start: number, end: number) => {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
};

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

// ---------------------------------------------------------------- EXIF (TIFF) parsing

interface ParsedExif {
  rows: [string, string][];
  orientation: number;
  hasGps: boolean;
  hasThumbnail: boolean;
}

/** Parse a TIFF block (the payload of EXIF). Never throws: damaged data yields what was readable. */
function parseTiff(bytes: Uint8Array, start: number, end: number): ParsedExif {
  const result: ParsedExif = { rows: [], orientation: 1, hasGps: false, hasThumbnail: false };
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start);
    const mark = view.getUint16(0);
    if (mark !== 0x4949 && mark !== 0x4d4d) return result;
    const little = mark === 0x4949;
    if (view.getUint16(2, little) !== 42) return result;

    const entriesOf = (ifd: number) => {
      const count = view.getUint16(ifd, little);
      return Array.from({ length: Math.min(count, 256) }, (_, i) => ifd + 2 + i * 12);
    };
    /** Where an entry's value lives: inline when it fits in 4 bytes, otherwise at an offset. */
    const valueAt = (entry: number) => {
      const type = view.getUint16(entry + 2, little);
      const count = view.getUint32(entry + 4, little);
      const size = (TYPE_SIZE[type] ?? 1) * count;
      return { type, count, at: size <= 4 ? entry + 8 : view.getUint32(entry + 8, little), size };
    };
    const text = (entry: number) => {
      const { at, size } = valueAt(entry);
      let out = "";
      for (let i = 0; i < size && at + i < view.byteLength; i++) {
        const code = view.getUint8(at + i);
        if (code === 0) break;
        out += String.fromCharCode(code);
      }
      return out.trim();
    };
    const rationals = (entry: number) => {
      const { at, count } = valueAt(entry);
      return Array.from({ length: Math.min(count, 3) }, (_, i) => {
        const den = view.getUint32(at + i * 8 + 4, little);
        return den ? view.getUint32(at + i * 8, little) / den : 0;
      });
    };

    const ifd0 = view.getUint32(4, little);
    let exifIfd = 0;
    let gpsIfd = 0;
    const named: Record<number, string> = {
      0x010f: "Camera make",
      0x0110: "Camera model",
      0x0131: "Software",
      0x0132: "Date edited",
      0x013b: "Author",
      0x8298: "Copyright",
      0x010e: "Description",
    };
    for (const entry of entriesOf(ifd0)) {
      const tag = view.getUint16(entry, little);
      if (tag === 0x8769) exifIfd = view.getUint32(entry + 8, little);
      else if (tag === 0x8825) gpsIfd = view.getUint32(entry + 8, little);
      else if (tag === 0x0112) result.orientation = view.getUint16(entry + 8, little);
      else if (named[tag]) {
        const value = text(entry);
        if (value) result.rows.push([named[tag], value]);
      }
    }
    // IFD1 holds the embedded preview image.
    const next = view.getUint32(ifd0 + 2 + entriesOf(ifd0).length * 12, little);
    if (next && next < view.byteLength) {
      result.hasThumbnail = entriesOf(next).some((entry) => [0x0201, 0x0111].includes(view.getUint16(entry, little)));
    }

    if (exifIfd && exifIfd < view.byteLength) {
      const exifNames: Record<number, string> = {
        0x9003: "Date taken",
        0xa434: "Lens",
        0xa431: "Camera serial number",
        0xa435: "Lens serial number",
        0xa430: "Owner name",
      };
      for (const entry of entriesOf(exifIfd)) {
        const tag = view.getUint16(entry, little);
        if (exifNames[tag]) {
          const value = text(entry);
          if (value) result.rows.push([exifNames[tag], value]);
        }
      }
    }

    if (gpsIfd && gpsIfd < view.byteLength) {
      const gps: Record<number, string | number[]> = {};
      for (const entry of entriesOf(gpsIfd)) {
        const tag = view.getUint16(entry, little);
        if (tag === 1 || tag === 3) gps[tag] = text(entry);
        else if (tag === 2 || tag === 4) gps[tag] = rationals(entry);
      }
      const coordinate = (ref: unknown, parts: unknown) => {
        if (!Array.isArray(parts) || parts.length < 3) return null;
        const degrees = parts[0] + parts[1] / 60 + parts[2] / 3600;
        return (ref === "S" || ref === "W" ? -1 : 1) * degrees;
      };
      const lat = coordinate(gps[1], gps[2]);
      const lon = coordinate(gps[3], gps[4]);
      result.hasGps = true;
      result.rows.push(["GPS location", lat !== null && lon !== null ? `${lat.toFixed(4)}, ${lon.toFixed(4)} (where the photo was taken)` : "present"]);
    }
  } catch {
    // Damaged EXIF: report what we found so far.
  }
  return result;
}

function emptyReport(): MetadataReport {
  return { rows: [], orientation: 1, hasGps: false, hasThumbnail: false, containers: [] };
}

function withExif(report: MetadataReport, exif: ParsedExif) {
  report.rows.push(...exif.rows);
  report.orientation = exif.orientation;
  report.hasGps ||= exif.hasGps;
  report.hasThumbnail ||= exif.hasThumbnail;
}

// ---------------------------------------------------------------- JPEG

interface JpegSegment {
  marker: number;
  start: number;
  end: number;
}

/** Walk a JPEG into segments. Entropy-coded scan data is folded into its SOS segment. */
function jpegSegments(bytes: Uint8Array): { segments: JpegSegment[]; endOfImage: number } {
  const segments: JpegSegment[] = [];
  let pos = 2;
  while (pos < bytes.length) {
    while (bytes[pos] === 0xff && bytes[pos + 1] === 0xff) pos++;
    if (bytes[pos] !== 0xff) break;
    const marker = bytes[pos + 1];
    if (marker === 0xd9) return { segments, endOfImage: pos + 2 };
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ marker, start: pos, end: pos + 2 });
      pos += 2;
      continue;
    }
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    let end = pos + 2 + length;
    if (marker === 0xda) {
      // Scan data runs until the next real marker (not a stuffed 00 byte or a restart marker).
      let scan = end;
      while (scan < bytes.length - 1) {
        if (bytes[scan] === 0xff && bytes[scan + 1] !== 0x00 && !(bytes[scan + 1] >= 0xd0 && bytes[scan + 1] <= 0xd7) && bytes[scan + 1] !== 0xff) break;
        scan++;
      }
      end = scan;
    }
    segments.push({ marker, start: pos, end: Math.min(end, bytes.length) });
    pos = end;
  }
  return { segments, endOfImage: bytes.length };
}

export function isJpegBytes(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function readJpeg(bytes: Uint8Array): MetadataReport {
  const report = emptyReport();
  const { segments, endOfImage } = jpegSegments(bytes);
  for (const seg of segments) {
    const size = seg.end - seg.start;
    const body = seg.start + 4;
    if (seg.marker === 0xe1 && ascii(bytes, body, body + 6) === "Exif\0\0") {
      withExif(report, parseTiff(bytes, body + 6, seg.end));
    } else if (seg.marker === 0xe1 && ascii(bytes, body, body + 28).startsWith("http://ns.adobe.com/xap/1.0/")) {
      report.containers.push(`XMP data (${kb(size)})`);
    } else if (seg.marker === 0xe1) {
      report.containers.push(`Extra APP1 data (${kb(size)})`);
    } else if (seg.marker === 0xed) {
      report.containers.push(`Photoshop / IPTC data (${kb(size)})`);
    } else if (seg.marker === 0xfe) {
      report.containers.push(`Comment: "${ascii(bytes, body, Math.min(seg.end, body + 60)).replace(/\s+/g, " ").trim()}"`);
    } else if (seg.marker === 0xe2 && ascii(bytes, body, body + 4) === "MPF\0") {
      report.containers.push(`Multi-picture data (${kb(size)})`);
    } else if (seg.marker === 0xe0 && ascii(bytes, body, body + 5) === "JFXX\0") {
      report.containers.push(`Thumbnail (${kb(size)})`);
    }
  }
  if (bytes.length - endOfImage > 16) report.containers.push(`Extra data after the image (${kb(bytes.length - endOfImage)})`);
  return report;
}

/** Remove every metadata segment from a JPEG. Pixel data is copied byte for byte. */
function stripJpeg(bytes: Uint8Array, options: StripOptions): StripResult {
  const { segments } = jpegSegments(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  const removed = new Set<string>();
  for (const seg of segments) {
    const body = seg.start + 4;
    let drop = false;
    if (seg.marker === 0xe1) {
      drop = true;
      removed.add(ascii(bytes, body, body + 6) === "Exif\0\0" ? "EXIF (camera, date, GPS)" : "XMP");
    } else if (seg.marker === 0xe2) {
      // Colour profiles (ICC_PROFILE) are kept unless asked; other APP2 blocks (FlashPix, multi-picture) go.
      if (ascii(bytes, body, body + 12) !== "ICC_PROFILE\0" || !options.keepProfile) {
        drop = true;
        removed.add(ascii(bytes, body, body + 12) === "ICC_PROFILE\0" ? "colour profile" : "extra picture data");
      }
    } else if (seg.marker === 0xe0 && ascii(bytes, body, body + 5) === "JFXX\0") {
      drop = true;
      removed.add("thumbnail");
    } else if ((seg.marker >= 0xe3 && seg.marker <= 0xed) || seg.marker === 0xef || seg.marker === 0xfe) {
      // APP14 (Adobe) is kept: it tells decoders how to read CMYK and YCCK colour.
      drop = true;
      removed.add(seg.marker === 0xfe ? "comments" : seg.marker === 0xed ? "IPTC / Photoshop data" : "application data");
    }
    if (!drop) parts.push(bytes.subarray(seg.start, seg.end));
  }
  parts.push(new Uint8Array([0xff, 0xd9]));
  return { blob: new Blob(parts as BlobPart[], { type: "image/jpeg" }), removed: [...removed] };
}

// ---------------------------------------------------------------- PNG

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "pHYs", "acTL", "fcTL", "fdAT", "cICP", "mDCV", "cLLI"]);

function pngChunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { type: string; start: number; end: number }[] = [];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = ascii(bytes, pos + 4, pos + 8);
    const end = Math.min(pos + 12 + length, bytes.length);
    chunks.push({ type, start: pos, end });
    pos = end;
    if (type === "IEND") break;
  }
  return chunks;
}

export function isPngBytes(bytes: Uint8Array) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function readPng(bytes: Uint8Array): MetadataReport {
  const report = emptyReport();
  for (const chunk of pngChunks(bytes)) {
    const size = chunk.end - chunk.start;
    const data = chunk.start + 8;
    if (chunk.type === "eXIf") withExif(report, parseTiff(bytes, data, chunk.end - 4));
    else if (chunk.type === "tEXt" || chunk.type === "iTXt" || chunk.type === "zTXt") {
      const keyword = ascii(bytes, data, Math.min(chunk.end - 4, data + 80)).split("\0")[0];
      if (keyword.startsWith("XML:com.adobe.xmp")) report.containers.push(`XMP data (${kb(size)})`);
      else if (chunk.type === "tEXt") {
        const value = ascii(bytes, data + keyword.length + 1, Math.min(chunk.end - 4, data + keyword.length + 80)).trim();
        report.rows.push([`Text: ${keyword}`, value]);
      } else report.containers.push(`Text note "${keyword}" (${kb(size)})`);
    } else if (chunk.type === "tIME") report.rows.push(["Last modified", "saved inside the file"]);
    else if (!PNG_KEEP.has(chunk.type) && chunk.type !== "iCCP" && chunk.type[0] === chunk.type[0].toLowerCase()) {
      report.containers.push(`Extra chunk ${chunk.type} (${kb(size)})`);
    }
  }
  return report;
}

function stripPng(bytes: Uint8Array, options: StripOptions): StripResult {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const removed = new Set<string>();
  for (const chunk of pngChunks(bytes)) {
    const keep = PNG_KEEP.has(chunk.type) || (chunk.type === "iCCP" && options.keepProfile);
    if (keep) parts.push(bytes.subarray(chunk.start, chunk.end));
    else removed.add(chunk.type === "eXIf" ? "EXIF" : chunk.type === "tIME" ? "timestamp" : chunk.type === "iCCP" ? "colour profile" : "text and application chunks");
  }
  return { blob: new Blob(parts as BlobPart[], { type: "image/png" }), removed: [...removed] };
}

// ---------------------------------------------------------------- WebP

function webpChunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { type: string; start: number; end: number }[] = [];
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const size = view.getUint32(pos + 4, true);
    const end = Math.min(pos + 8 + size + (size % 2), bytes.length);
    chunks.push({ type: ascii(bytes, pos, pos + 4), start: pos, end });
    pos = end;
  }
  return chunks;
}

export function isWebpBytes(bytes: Uint8Array) {
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
}

function readWebp(bytes: Uint8Array): MetadataReport {
  const report = emptyReport();
  for (const chunk of webpChunks(bytes)) {
    const size = chunk.end - chunk.start;
    if (chunk.type === "EXIF") {
      // The payload may start with an "Exif\0\0" prefix before the TIFF header.
      const start = chunk.start + 8 + (ascii(bytes, chunk.start + 8, chunk.start + 14) === "Exif\0\0" ? 6 : 0);
      withExif(report, parseTiff(bytes, start, chunk.end));
    } else if (chunk.type === "XMP ") report.containers.push(`XMP data (${kb(size)})`);
  }
  return report;
}

function stripWebp(bytes: Uint8Array, options: StripOptions): StripResult {
  const parts: Uint8Array[] = [];
  const removed = new Set<string>();
  let total = 4; // the "WEBP" tag
  for (const chunk of webpChunks(bytes)) {
    if (chunk.type === "EXIF" || chunk.type === "XMP " || (chunk.type === "ICCP" && !options.keepProfile)) {
      removed.add(chunk.type === "EXIF" ? "EXIF" : chunk.type === "ICCP" ? "colour profile" : "XMP");
      continue;
    }
    let piece = bytes.subarray(chunk.start, chunk.end);
    if (chunk.type === "VP8X") {
      // Clear the "has EXIF / XMP (/ ICC)" flags so readers do not look for removed chunks.
      piece = piece.slice();
      piece[8] &= options.keepProfile ? ~(0x08 | 0x04) : ~(0x08 | 0x04 | 0x20);
    }
    parts.push(piece);
    total += piece.length;
  }
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, total, true);
  return { blob: new Blob([header, ...parts] as BlobPart[], { type: "image/webp" }), removed: [...removed] };
}

// ---------------------------------------------------------------- public API

export function readMetadata(bytes: Uint8Array): MetadataReport {
  if (isJpegBytes(bytes)) return readJpeg(bytes);
  if (isPngBytes(bytes)) return readPng(bytes);
  if (isWebpBytes(bytes)) return readWebp(bytes);
  return emptyReport();
}

/** Strip metadata without touching pixels. Returns null when the format is not supported. */
export function stripMetadata(bytes: Uint8Array, options: StripOptions): StripResult | null {
  if (isJpegBytes(bytes)) return stripJpeg(bytes, options);
  if (isPngBytes(bytes)) return stripPng(bytes, options);
  if (isWebpBytes(bytes)) return stripWebp(bytes, options);
  return null;
}

/** True when the report holds anything a person would call metadata. */
export function hasAnyMetadata(report: MetadataReport) {
  return report.rows.length > 0 || report.containers.length > 0 || report.hasThumbnail;
}

/** Plain-text summary for the result panel. */
export function describeMetadata(name: string, report: MetadataReport): string {
  if (!hasAnyMetadata(report)) return `${name}\n  No personal metadata found.`;
  const lines = [name];
  for (const [label, value] of report.rows) lines.push(`  ${label}: ${value}`);
  if (report.hasThumbnail) lines.push("  Embedded thumbnail: yes (can reveal the uncropped original)");
  for (const container of report.containers) lines.push(`  ${container}`);
  return lines.join("\n");
}
