/**
 * Barcode text validation and check digits. Pure functions with no imports, so they can be
 * tested on their own. Drawing is done by JsBarcode (MIT) in the editor.
 */

export type BarcodeFormat = "CODE128" | "CODE39" | "EAN13" | "EAN8" | "UPC";

export const BARCODE_FORMATS: { value: BarcodeFormat; label: string; hint: string; example: string }[] = [
  { value: "CODE128", label: "Code 128", hint: "Any letters, numbers and symbols (ASCII). Common for shipping, inventory and tickets.", example: "KREA-2026-0001" },
  { value: "CODE39", label: "Code 39", hint: "Capital letters, numbers and - . space $ / + %. Common for IDs and labels. Lowercase is turned into capitals.", example: "KREA 2026" },
  { value: "EAN13", label: "EAN-13", hint: "12 digits; the 13th is a check digit that Krea adds. Used on retail products worldwide.", example: "590123412345" },
  { value: "EAN8", label: "EAN-8", hint: "7 digits; the 8th is a check digit that Krea adds. For small retail packages.", example: "9638507" },
  { value: "UPC", label: "UPC-A", hint: "11 digits; the 12th is a check digit that Krea adds. Used on retail products in the US and Canada.", example: "03600029145" },
];

/** Digits-only formats: the data length without and with the check digit. */
const DIGIT_LENGTH: Partial<Record<BarcodeFormat, number>> = { EAN13: 12, EAN8: 7, UPC: 11 };

/** GS1 check digit: weights 3, 1, 3, 1... from the right-most data digit. */
export function gs1CheckDigit(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const digit = Number(data[data.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export interface BarcodeCheck {
  ok: boolean;
  /** The text that is encoded (with the check digit added, capitals for Code 39). */
  value: string;
  /** Why the text cannot be used, in plain words. */
  error?: string;
  /** A change Krea made that the user should know about. */
  note?: string;
}

const CODE39_CHARS = /^[0-9A-Z\-. $/+%]+$/;

export function checkBarcodeText(format: BarcodeFormat, input: string): BarcodeCheck {
  if (!input) return { ok: false, value: "", error: "I-type ang laman ng barcode." };

  if (format === "CODE128") {
    if (input.length > 80) return { ok: false, value: input, error: "Too long: Code 128 labels are usually under 80 characters, and longer ones are hard to scan." };
    for (const ch of input) {
      if (ch.charCodeAt(0) > 127) return { ok: false, value: input, error: `Code 128 cannot encode "${ch}". Use plain letters, numbers and symbols (ASCII).` };
    }
    return { ok: true, value: input };
  }

  if (format === "CODE39") {
    const upper = input.toUpperCase();
    if (upper.length > 40) return { ok: false, value: upper, error: "Too long: Code 39 gets very wide past 40 characters." };
    const bad = [...upper].find((ch) => !CODE39_CHARS.test(ch));
    if (bad) return { ok: false, value: upper, error: `Code 39 cannot encode "${bad}". Allowed: A-Z, 0-9, space and - . $ / + %.` };
    return { ok: true, value: upper, note: upper !== input ? "Lowercase letters were changed to capitals, because Code 39 has no lowercase." : undefined };
  }

  const dataLength = DIGIT_LENGTH[format]!;
  const name = format === "UPC" ? "UPC-A" : format === "EAN13" ? "EAN-13" : "EAN-8";
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return { ok: false, value: input, error: `${name} uses digits only.` };
  if (digits.length === dataLength) {
    const check = gs1CheckDigit(digits);
    return { ok: true, value: digits + check, note: `Check digit ${check} added.` };
  }
  if (digits.length === dataLength + 1) {
    const expected = gs1CheckDigit(digits.slice(0, -1));
    if (Number(digits.at(-1)) !== expected) {
      return { ok: false, value: digits, error: `The check digit is wrong: the last digit should be ${expected}, not ${digits.at(-1)}. Type only the first ${dataLength} digits and Krea adds it.` };
    }
    return { ok: true, value: digits };
  }
  return { ok: false, value: digits, error: `${name} needs ${dataLength} digits (Krea adds the check digit) or ${dataLength + 1} with it. You typed ${digits.length}.` };
}

// ---------------------------------------------------------------- reading scanned text

export interface WifiInfo {
  ssid: string;
  password: string;
  security: string;
}

export type ScanKind = "url" | "wifi" | "email" | "phone" | "sms" | "geo" | "text";

export interface ScanInfo {
  kind: ScanKind;
  wifi?: WifiInfo;
}

/** Split "WIFI:T:WPA;S:name;P:secret;;" respecting backslash escapes. */
function parseWifi(text: string): WifiInfo | undefined {
  const body = text.slice(5);
  const fields: Record<string, string> = {};
  let key = "";
  let value = "";
  let inValue = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\" && i + 1 < body.length) {
      if (inValue) value += body[++i];
      else key += body[++i];
    } else if (!inValue && ch === ":") inValue = true;
    else if (ch === ";") {
      if (key) fields[key] = value;
      key = "";
      value = "";
      inValue = false;
    } else if (inValue) value += ch;
    else key += ch;
  }
  if (key) fields[key] = value;
  return fields.S === undefined ? undefined : { ssid: fields.S, password: fields.P ?? "", security: fields.T || "nopass" };
}

/** What a scanned text is, so the UI can offer the right action and warn before anything is opened. */
export function classifyScan(text: string): ScanInfo {
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/i.test(trimmed)) return { kind: "url" };
  if (/^WIFI:/i.test(trimmed)) {
    const wifi = parseWifi(trimmed);
    if (wifi) return { kind: "wifi", wifi };
  }
  if (/^mailto:/i.test(trimmed)) return { kind: "email" };
  if (/^tel:/i.test(trimmed)) return { kind: "phone" };
  if (/^smsto?:/i.test(trimmed)) return { kind: "sms" };
  if (/^geo:/i.test(trimmed)) return { kind: "geo" };
  return { kind: "text" };
}

/** Friendly names for the format ids the detectors return. */
export function formatLabel(format: string): string {
  const names: Record<string, string> = {
    qr_code: "QR code",
    micro_qr_code: "Micro QR",
    rm_qr_code: "rMQR",
    code_128: "Code 128",
    code_39: "Code 39",
    code_93: "Code 93",
    codabar: "Codabar",
    ean_13: "EAN-13",
    ean_8: "EAN-8",
    upc_a: "UPC-A",
    upc_e: "UPC-E",
    itf: "ITF",
    data_matrix: "Data Matrix",
    aztec: "Aztec",
    pdf417: "PDF417",
    databar: "GS1 DataBar",
    databar_expanded: "GS1 DataBar Expanded",
  };
  return names[format] ?? format.replace(/_/g, " ");
}
