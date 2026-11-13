/**
 * Core types shared by the UI (main thread) and the workers.
 *
 * A Tool is a self-contained module: metadata + a declarative settings schema
 * + a run() function. run() only ever executes inside a Web Worker, and tools
 * lazy-import their heavy libraries inside run(), so importing the registry on
 * the main thread stays cheap.
 */

export type ToolCategory = "image" | "pdf" | "text";

/**
 * Where a tool runs. "image", "pdf" and "ocr" are our own workers (src/workers).
 * "pdfjs" is the one exception: pdf.js needs the DOM, so those tools are
 * coordinated from the page while pdf.js's own parser and renderer workers do
 * the heavy work (see lib/pdf-render.ts).
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
  | (FieldBase & { type: "text"; placeholder?: string; default: string })
  /** Page picker for PDFs. Value is a range string such as "1-3, 7". Empty means all pages. */
  | (FieldBase & { type: "pages"; default: string })
  /**
   * Interactive crop box drawn over the first image. Writes four normalized
   * (0..1) values: `${key}X`, `${key}Y`, `${key}W`, `${key}H`.
   * `aspectKey` names a select field holding "free" or a "w:h" ratio.
   */
  | (FieldBase & { type: "crop"; aspectKey?: string });

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

export interface ToolResult {
  files: WorkFile[];
  /** Honest, human-readable remark about the outcome (e.g. "could not reach 200 KB without resizing"). */
  note?: string;
}

export interface RunContext {
  /** Report progress for the current run() call. `value` is 0..1. */
  progress: (value: number, label?: string) => void;
  /**
   * Set only for "pdfjs" tools, which cannot be cancelled by terminating a
   * worker: check `signal.aborted` between units of work and stop early.
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
  | "merge"
  | "split"
  | "pdf-to-image"
  | "image-to-pdf";

export interface Tool {
  /** Stable number from the product spec (1-25). */
  id: number;
  slug: string;
  name: string;
  /** Short action label used on Move chips, e.g. "Compress". */
  verb: string;
  category: ToolCategory;
  description: string;
  /** Accepted input MIME types. */
  accepts: string[];
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
  /** Re-run automatically while settings change (single file only) for a live before/after. */
  live?: boolean;
  /** Output keeps the input's framing, so a before/after slider makes sense. */
  compare?: boolean;
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

/** A Render Chain: Moves executed in sequence inside one worker. */
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
      values[`${field.key}X`] = 0;
      values[`${field.key}Y`] = 0;
      values[`${field.key}W`] = 1;
      values[`${field.key}H`] = 1;
    } else {
      values[field.key] = field.default;
    }
  }
  return values;
}
