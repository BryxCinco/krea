/**
 * Core types shared by the UI (main thread) and the workers.
 *
 * A Tool is a self-contained module: metadata + a declarative settings schema
 * + a run() function. run() only ever executes inside a Web Worker, and tools
 * lazy-import their heavy libraries inside run(), so importing the registry on
 * the main thread stays cheap.
 */

export type ToolCategory = "image" | "pdf" | "text" | "code" | "video";

/**
 * Where a tool runs.
 * "image" and "pdf" are our own workers (src/workers).
 * "pdfjs" and "ocr" are the exceptions: pdf.js needs the DOM and Tesseract ships
 * its own worker, so those tools are coordinated from the page while the
 * library's own workers do the heavy work (see lib/pdf-render.ts, lib/ocr.ts).
 */
export type WorkerKind = "image" | "pdf" | "ocr" | "pdfjs";

/** Settings values are plain primitives so they clone cheaply and fit in localStorage. */
export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
  /** Hide the field unless this returns true for the current values. */
  showIf?: (values: OptionValues) => boolean;
}

export type OptionField =
  | (FieldBase & { type: "slider"; min: number; max: number; step: number; unit?: string; default: number })
  | (FieldBase & { type: "number"; min?: number; max?: number; step?: number; unit?: string; default: number })
  | (FieldBase & { type: "select"; options: { value: string; label: string }[]; default: string })
  | (FieldBase & { type: "toggle"; default: boolean })
  | (FieldBase & { type: "color"; default: string })
  /** `secret` renders a password input and is never saved into chain presets. */
  | (FieldBase & { type: "text"; placeholder?: string; default: string; secret?: boolean })
  /** Page picker for PDFs. Value is a range string such as "1-3, 7". Empty means all pages. */
  | (FieldBase & { type: "pages"; default: string })
  /** Image picked from the device (a logo). Value is a data URL, "" when empty. */
  | (FieldBase & { type: "image" })
  /** Signature pad: draw, type or upload. Value is a PNG data URL, "" when empty. */
  | (FieldBase & { type: "signature" })
  /**
   * Interactive crop box drawn over the first image. Writes four normalized
   * (0..1) values: `${key}X`, `${key}Y`, `${key}W`, `${key}H`.
   * `aspectKey` names a select field holding "free" or a "w:h" ratio.
   */
  | (FieldBase & { type: "crop"; aspectKey?: string })
  /**
   * Box placed on a rendered PDF page (where a signature goes). Writes the same
   * four normalized values as "crop". `pageKey` names the number field holding
   * the page to preview; `imageKey` names the field holding the image shown in the box.
   */
  | (FieldBase & { type: "placement"; pageKey: string; imageKey: string })
  /**
   * Page thumbnails that can be reordered, rotated and deleted. Value is a JSON
   * string of `{ p: pageIndex, r: extraRotation }[]`; "" means "unchanged".
   */
  | (FieldBase & { type: "pageGrid" });

/** Field types drawn on the Stage itself instead of in the inspector. */
export const STAGE_FIELD_TYPES = ["crop", "placement", "pageGrid"] as const;

/** One-tap settings bundle shown as a chip in the inspector. */
export interface ToolPreset {
  id: string;
  label: string;
  hint?: string;
  values: OptionValues;
}

/** A file as it crosses the worker boundary. Blobs are passed by reference, not copied. */
export interface WorkFile {
  name: string;
  type: string;
  blob: Blob;
}

export interface PaletteColor {
  hex: string;
  rgb: string;
  hsl: string;
  /** Share of the image covered by this colour, 0..1. */
  share: number;
}

/** Extra result content shown on screen in addition to (or instead of) files. */
export type ResultView = { type: "palette"; colors: PaletteColor[] } | { type: "text"; text: string; label?: string; keepSize?: boolean };

export interface ToolResult {
  files: WorkFile[];
  /** Honest, human-readable remark about the outcome (e.g. "could not reach 200 KB without resizing"). */
  note?: string;
  view?: ResultView;
}

export interface RunContext {
  /** Report progress for the current run() call. `value` is 0..1. */
  progress: (value: number, label?: string) => void;
  /**
   * Set only for page-coordinated tools ("pdfjs", "ocr"), which cannot be
   * cancelled by terminating our worker: check `signal.aborted` and stop early.
   */
  signal?: AbortSignal;
}

/** Icon keys resolved to lucide icons in components/ui/icon.tsx (kept as strings so workers never import React). */
export type IconKey =
  | "compress"
  | "resize"
  | "crop"
  | "convert"
  | "cutout"
  | "id"
  | "watermark"
  | "upscale"
  | "palette"
  | "collage"
  | "merge"
  | "split"
  | "compress-pdf"
  | "pdf-to-image"
  | "image-to-pdf"
  | "stamp"
  | "sign"
  | "lock"
  | "organize"
  | "ocr"
  | "markdown"
  | "resume"
  | "invoice"
  | "qr"
  | "payroll"
  | "metadata"
  | "pagenumber"
  | "text"
  | "password"
  | "barcode"
  | "redact"
  | "paycalc"
  | "scan"
  | "video"
  | "trim"
  | "speed"
  | "vcrop"
  | "vwatermark"
  | "audio";

/** What a tool produces, used to check that chain steps fit together. */
export type OutputKind = "image" | "pdf" | "text" | "data";

/** Facts about the files on the Stage, passed to a tool's `warn`. */
export interface InputFacts {
  width?: number;
  height?: number;
  pages?: number;
  bytes: number;
}

/** A question and answer shown on the tool page (and in its FAQ structured data). */
export interface Faq {
  q: string;
  a: string;
}

export interface Tool {
  /** Stable number from the product spec (1-35). */
  id: number;
  /**
   * "file" (default): transforms files on the Stage, runs in a worker.
   * "editor": a self-contained editor (Markdown, resume, invoice, QR, payroll)
   * whose UI lives in src/components/stage/editors; it has no run() of its own.
   */
  kind?: "file" | "editor";
  /** 3 to 5 questions people actually ask about this job. */
  faqs: Faq[];
  slug: string;
  name: string;
  /** Short action label used on Move chips, e.g. "Compress". */
  verb: string;
  category: ToolCategory;
  description: string;
  /** Accepted input MIME types. */
  accepts: string[];
  /** What comes out. A function when it depends on the settings. */
  output: OutputKind | ((options: OptionValues) => OutputKind);
  seoTitle: string;
  seoDescription: string;
  howTo: string[];
  icon: IconKey;
  worker: WorkerKind;
  /**
   * "each": run() is called once per file, so the tool is batch-capable.
   * "all": run() receives every file at once and combines them (merge, image to PDF).
   */
  input: "each" | "all";
  /** Minimum number of files needed (default 1). */
  minFiles?: number;
  /** Re-run automatically while settings change, for a live preview. */
  live?: boolean;
  /** Output keeps the input's framing, so a before/after slider makes sense. */
  compare?: boolean;
  /** Can open password-protected PDFs (only the unlock tool). */
  acceptsLocked?: boolean;
  /** Set to a reason when the tool cannot be a chain step (it needs hands-on placement, or a password). */
  notChainable?: string;
  /** Optional heads-up shown before running, e.g. a very large output. Return null for none. */
  warn?: (inputs: InputFacts[], options: OptionValues) => string | null;
  fields: OptionField[];
  presets?: ToolPreset[];
  run: (inputs: WorkFile[], options: OptionValues, ctx: RunContext) => Promise<ToolResult>;
}

/** A Move is a tool offered for the files currently on the Stage. */
export interface Move {
  tool: Tool;
  /** True when it will run across several files and produce a ZIP. */
  batch: boolean;
}

/** One step of a Render Chain. */
export interface ChainStep {
  slug: string;
  options: OptionValues;
}

/** A Render Chain: Moves executed in sequence. */
export interface Chain {
  id: string;
  name: string;
  description?: string;
  steps: ChainStep[];
  builtIn?: boolean;
}

export type ErrorCode = "unsupported" | "too-large" | "corrupted" | "password" | "failed";

/** Error with a machine-readable code so the UI can show a clear, specific message. */
export class KreaError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "KreaError";
    this.code = code;
  }
}

/** Default values for a tool's fields. */
export function defaultOptions(tool: Tool): OptionValues {
  const values: OptionValues = {};
  for (const field of tool.fields) {
    if (field.type === "crop") {
      Object.assign(values, { [`${field.key}X`]: 0, [`${field.key}Y`]: 0, [`${field.key}W`]: 1, [`${field.key}H`]: 1 });
    } else if (field.type === "placement") {
      // Bottom-right quarter of the page: where a signature usually goes.
      Object.assign(values, { [`${field.key}X`]: 0.55, [`${field.key}Y`]: 0.8, [`${field.key}W`]: 0.35, [`${field.key}H`]: 0.1 });
    } else if (field.type === "image" || field.type === "signature" || field.type === "pageGrid") {
      values[field.key] = "";
    } else {
      values[field.key] = field.default;
    }
  }
  return values;
}

export function outputKind(tool: Tool, options: OptionValues): OutputKind {
  return typeof tool.output === "function" ? tool.output(options) : tool.output;
}
