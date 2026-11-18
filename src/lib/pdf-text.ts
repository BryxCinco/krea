/**
 * Text helpers for tools that write text into PDFs with pdf-lib's standard fonts
 * (TXT to PDF, CSV to PDF, PDF Annotator). Standard fonts only cover Latin
 * (WinAnsi), so text is checked against the font and anything it cannot print
 * becomes "?" and is counted, instead of failing the whole file.
 */
import type { PDFFont } from "pdf-lib";
import { KreaError } from "@/tools/types";

/** Page sizes in PDF points (1/72 inch), portrait. */
export const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

export const PAGE_SIZE_OPTIONS = [
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter (short bond)" },
  { value: "legal", label: "Legal (long bond)" },
];

export const FONT_OPTIONS = [
  { value: "Courier", label: "Courier (monospace)" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "TimesRoman", label: "Times" },
];

export type StandardFontName = "Courier" | "Helvetica" | "TimesRoman";
export const BOLD_FONT: Record<StandardFontName, "CourierBold" | "HelveticaBold" | "TimesRomanBold"> = {
  Courier: "CourierBold",
  Helvetica: "HelveticaBold",
  TimesRoman: "TimesRomanBold",
};

/** Largest text file we lay out, to keep page counts and memory sane. */
export const MAX_TEXT_BYTES = 20 * 1024 * 1024;

/**
 * Decode a text file: UTF-8 (with or without BOM), UTF-16 with a BOM, and
 * otherwise Windows-1252, which is what older Windows apps and Excel save.
 */
export function decodeText(buffer: ArrayBuffer, name: string): string {
  if (buffer.byteLength > MAX_TEXT_BYTES) {
    throw new KreaError("too-large", `"${name}" is over 20 MB of text. Split it into smaller files first.`);
  }
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\u0000")) throw new KreaError("unsupported", `"${name}" looks like a binary file, not text.`);
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Readable stand-ins for common symbols the standard fonts lack. The peso sign
 * matters most: it is not in WinAnsi, and "?1,234.50" on a payslip is useless.
 */
const SUBSTITUTES: Record<string, string> = {
  "₱": "PHP ",
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  "→": "->",
  "←": "<-",
  "✓": "v",
  "✔": "v",
  "✗": "x",
  "✘": "x",
  "−": "-",
  "‐": "-",
  "‑": "-",
};

/** Makes strings printable with one font. `replaced` counts characters swapped for "?". */
export function fontSanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  const state = { replaced: 0 };
  const clean = (text: string): string => {
    let out = "";
    for (const char of text.replace(/\t/g, "    ")) {
      const code = char.codePointAt(0) ?? 0;
      if (supported.has(code)) out += char;
      else if (SUBSTITUTES[char]) out += SUBSTITUTES[char];
      else if (char === " " || char === " " || char === " ") out += " ";
      else if (code < 32) continue;
      else {
        out += "?";
        state.replaced++;
      }
    }
    return out;
  };
  return { clean, state };
}

/**
 * Wrap one line of text to a width. Breaks at spaces; words longer than the
 * width are split by character. Leading spaces are kept (code, indented text).
 */
export function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const width = (value: string) => font.widthOfTextAtSize(value, size);
  if (width(text) <= maxWidth) return [text];
  const lines: string[] = [];
  const tokens = text.match(/\s+|\S+/g) ?? [text];
  let line = "";
  for (const token of tokens) {
    if (width(line + token) <= maxWidth) {
      line += token;
      continue;
    }
    if (/^\s+$/.test(token)) {
      // A space that does not fit ends the line; it is not carried over.
      lines.push(line);
      line = "";
      continue;
    }
    if (line.trim()) lines.push(line);
    line = "";
    if (width(token) <= maxWidth) {
      line = token;
      continue;
    }
    for (const char of token) {
      if (width(line + char) > maxWidth && line) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  lines.push(line);
  return lines;
}

/** "Replaced 3 characters…" note for the result, or "" when nothing was replaced. */
export function replacedNote(count: number): string {
  if (!count) return "";
  return ` ${count} ${count === 1 ? "character" : "characters"} the PDF font cannot print (emoji, non-Latin scripts) became "?".`;
}

/** File-name-safe stem from a user-typed title. */
export function safeStem(value: string, fallback: string): string {
  return value.trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "-") || fallback;
}
