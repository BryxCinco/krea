/**
 * A small reader for Excel workbooks (.xlsx), enough to print their values.
 *
 * An .xlsx file is a ZIP of XML parts. This reads the sheet list, the shared
 * strings and the number formats, and returns every visible sheet as rows of
 * display strings: dates as dates, percentages with "%", numbers with the
 * decimals and thousands separators of their format. Formulas give their
 * last saved result. Runs in a worker, where there is no DOMParser, so the XML
 * is read with regular expressions over the well-defined OOXML structure.
 */
import { KreaError } from "@/tools/types";

export interface Sheet {
  name: string;
  rows: string[][];
}

/** Uncompressed XML we are willing to read from one part, to keep a zip bomb from taking the tab. */
const MAX_PART_BYTES = 150 * 1024 * 1024;

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** XML entities and Excel's own _xHHHH_ escapes (used for control characters such as _x000D_). */
export function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\r\n?/g, "\n");
}

function attr(attributes: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes);
  return match ? decodeXml(match[1]) : undefined;
}

/** Text of every <t> run inside a string item, skipping phonetic hints (<rPh>). */
function runText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) text += decodeXml(match[1] ?? "");
  return text;
}

/** "AB12" -> 27 (zero-based column of a cell reference). */
export function columnIndex(ref: string): number {
  let index = 0;
  for (const char of ref.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** Built-in number formats that show dates or times (ECMA-376, 18.8.30). */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const BUILTIN_FORMATS: Record<number, string> = { 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 37: "#,##0", 38: "#,##0", 39: "#,##0.00", 40: "#,##0.00" };

interface NumberFormat {
  kind: "general" | "number" | "percent" | "date" | "time" | "datetime" | "text";
  decimals: number;
  grouped: boolean;
}

/** What a format code shows, ignoring literal text, colours and conditions. */
export function classifyFormat(id: number, code: string | undefined): NumberFormat {
  const plain = { kind: "general" as const, decimals: -1, grouped: false };
  if (BUILTIN_DATE_FORMATS.has(id)) {
    const time = id >= 18 && id <= 21 ? "time" : id === 22 ? "datetime" : id >= 45 ? "time" : "date";
    return { kind: time, decimals: 0, grouped: false };
  }
  const source = code ?? BUILTIN_FORMATS[id];
  if (!source || /^general$/i.test(source)) return plain;
  if (source === "@") return { kind: "text", decimals: 0, grouped: false };
  // Only the positive section matters for the shape; strip quoted text, escapes, [colours] and fills.
  const first = source.split(";")[0].replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "").replace(/[_*]./g, "");
  const hasDate = /[dy]/i.test(first) || (/m/i.test(first) && !/[0#?]/.test(first));
  const hasTime = /[hs]/i.test(first);
  if (hasDate || hasTime) return { kind: hasDate && hasTime ? "datetime" : hasDate ? "date" : "time", decimals: 0, grouped: false };
  const decimalsMatch = /\.([0#?]+)/.exec(first);
  const decimals = decimalsMatch ? decimalsMatch[1].length : /[0#?]/.test(first) ? 0 : -1;
  return { kind: first.includes("%") ? "percent" : "number", decimals, grouped: /[0#?],[0#?]/.test(first) };
}

/** Excel serial day number to a calendar date (1900 or 1904 date system). */
export function serialToDate(serial: number, date1904: boolean): Date {
  // Day 0 of the 1900 system is 1899-12-30 because Excel counts the 29 Feb 1900 that never was.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(serial * 86_400_000));
}

const pad = (value: number) => String(value).padStart(2, "0");

export function formatCellNumber(value: number, format: NumberFormat, date1904: boolean): string {
  if (!Number.isFinite(value)) return String(value);
  if (format.kind === "date" || format.kind === "time" || format.kind === "datetime") {
    const date = serialToDate(value, date1904);
    const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    return format.kind === "date" ? day : format.kind === "time" ? time : `${day} ${time}`;
  }
  const shown = format.kind === "percent" ? value * 100 : value;
  let text: string;
  if (format.decimals >= 0) {
    text = shown.toLocaleString("en-US", { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals, useGrouping: format.grouped });
  } else {
    // General: drop floating-point noise such as 0.30000000000000004.
    text = String(Number(shown.toPrecision(15)));
  }
  return format.kind === "percent" ? `${text}%` : text;
}

async function readPart(zip: import("jszip"), path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  // jszip keeps the declared size of each entry; refuse huge parts before inflating them.
  const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  if (declared > MAX_PART_BYTES) throw new KreaError("too-large", `This workbook has a part of ${Math.round(declared / 1e6)} MB, too large to read in the browser.`);
  return entry.async("string");
}

/** Resolve a relationship target ("worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml") against xl/. */
function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `xl/${target}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== ".") out.push(part);
  }
  return out.join("/");
}

/** Read every visible sheet of an .xlsx file. `fileName` is only used in messages. */
export async function readXlsx(buffer: ArrayBuffer, fileName: string): Promise<Sheet[]> {
  const { default: JSZip } = await import("jszip");
  let zip: import("jszip");
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new KreaError("corrupted", `Hindi mabuksan ang "${fileName}". It is not a valid Excel file.`);
  }
  const workbook = await readPart(zip, "xl/workbook.xml");
  if (!workbook) {
    const encrypted = zip.file("EncryptionInfo") || zip.file("EncryptedPackage");
    throw new KreaError(encrypted ? "password" : "corrupted", encrypted ? `"${fileName}" is password-protected. Remove the password in Excel first.` : `"${fileName}" is not an Excel workbook (.xlsx).`);
  }

  const rels = (await readPart(zip, "xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(match[1], "Id");
    const target = attr(match[1], "Target");
    if (id && target) targets.set(id, resolveTarget(target));
  }
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);

  const sharedXml = (await readPart(zip, "xl/sharedStrings.xml")) ?? "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((match) => runText(match[1] ?? ""));

  // Style index -> number format, from <cellXfs>.
  const stylesXml = (await readPart(zip, "xl/styles.xml")) ?? "";
  const customFormats = new Map<number, string>();
  for (const match of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(match[1], "numFmtId"));
    const code = attr(match[1], "formatCode");
    if (Number.isFinite(id) && code !== undefined) customFormats.set(id, code);
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  const styles = [...cellXfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)].map((match) => {
    const id = Number(attr(match[1], "numFmtId") ?? 0);
    return classifyFormat(id, customFormats.get(id));
  });
  const general = classifyFormat(0, undefined);

  const sheets: Sheet[] = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = attr(match[1], "name") ?? `Sheet ${sheets.length + 1}`;
    if (/^(hidden|veryHidden)$/.test(attr(match[1], "state") ?? "")) continue;
    const path = targets.get(attr(match[1], "r:id") ?? "");
    const xml = path ? await readPart(zip, path) : null;
    // Chart sheets and dialog sheets have no cells.
    if (!xml || !xml.includes("<sheetData")) continue;

    const rows: string[][] = [];
    let nextRow = 0;
    for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(attr(rowMatch[1], "r"));
      const rowIndex = Number.isFinite(r) && r > 0 ? r - 1 : nextRow;
      nextRow = rowIndex + 1;
      const cells: string[] = [];
      let nextCol = 0;
      for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cellMatch[1], "r");
        const col = ref ? columnIndex(ref) : nextCol;
        nextCol = col + 1;
        const body = cellMatch[2] ?? "";
        const type = attr(cellMatch[1], "t") ?? "n";
        const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value = "";
        if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") value = runText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
        else if (type === "b") value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : "";
        else if (type === "str" || type === "e") value = decodeXml(raw ?? "");
        else if (type === "d") value = decodeXml(raw ?? "").replace("T", " ").replace(/(:\d\d)(\.\d+)?Z?$/, "$1");
        else if (raw !== undefined && raw !== "") {
          const style = styles[Number(attr(cellMatch[1], "s") ?? 0)] ?? general;
          value = formatCellNumber(Number(raw), style, date1904);
        }
        if (col >= 0 && col < 16_384) cells[col] = value;
      }
      if (cells.length) rows[rowIndex] = Array.from(cells, (cell) => cell ?? "");
    }

    // Drop empty rows (Excel keeps formatted but blank ones) and trailing empty columns.
    const filled = rows.filter((row) => row && row.some((cell) => cell.trim() !== ""));
    let width = 0;
    for (const row of filled) {
      for (let i = row.length - 1; i >= width; i--) {
        if (row[i]?.trim()) {
          width = i + 1;
          break;
        }
      }
    }
    sheets.push({ name, rows: filled.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? "")) });
  }
  return sheets;
}
