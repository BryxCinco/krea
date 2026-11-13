/**
 * Render Chains: validation, built-in presets and localStorage persistence.
 * Execution lives in lib/worker-client.ts (runSteps).
 */
import { PDF_MIME } from "@/lib/file-type";
import { getTool } from "@/tools/registry";
import { defaultOptions, outputKind, type Chain, type ChainStep, type OutputKind, type Tool } from "@/tools/types";

const STORAGE_KEY = "krea.chains.v1";

/** What kind of file a MIME type is, in chain terms. */
export function kindOfMime(mime: string): OutputKind {
  if (mime === PDF_MIME) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return "data";
}

const KIND_LABEL: Record<OutputKind, string> = { image: "images", pdf: "PDFs", text: "text", data: "data files" };

function acceptsKind(tool: Tool, kind: OutputKind): boolean {
  return tool.accepts.some((mime) => kindOfMime(mime) === kind);
}

/**
 * Why `tool` cannot follow something that produces `incoming`, or null if it can.
 * `incoming` is null for the first step when no files are on the Stage yet.
 */
export function blockReason(tool: Tool, incoming: OutputKind | null, previous?: Tool): string | null {
  if (tool.notChainable) return tool.notChainable;
  if (incoming && !acceptsKind(tool, incoming)) {
    const needs = [...new Set(tool.accepts.map(kindOfMime))].map((kind) => KIND_LABEL[kind]).join(" or ");
    return previous
      ? `${previous.name} outputs ${KIND_LABEL[incoming]}, but ${tool.name} needs ${needs}.`
      : `${tool.name} needs ${needs}, and the Stage has ${KIND_LABEL[incoming]}.`;
  }
  return null;
}

/** The kind of file coming out of the last step (or `start` for an empty chain). */
export function chainOutput(steps: ChainStep[], start: OutputKind | null): OutputKind | null {
  const last = steps[steps.length - 1];
  const tool = last && getTool(last.slug);
  return tool ? outputKind(tool, last.options) : start;
}

/** Per-step problems for a whole chain: `null` entries are fine. */
export function validateChain(steps: ChainStep[], start: OutputKind | null): (string | null)[] {
  let incoming = start;
  let previous: Tool | undefined;
  return steps.map((step) => {
    const tool = getTool(step.slug);
    if (!tool) return "This Move no longer exists.";
    const reason = blockReason(tool, incoming, previous);
    incoming = outputKind(tool, step.options);
    previous = tool;
    return reason;
  });
}

/** A step with the tool's defaults plus any overrides. */
function step(slug: string, overrides: ChainStep["options"] = {}): ChainStep {
  const tool = getTool(slug);
  return { slug, options: { ...(tool ? defaultOptions(tool) : {}), ...overrides } };
}

export const builtInChains: Chain[] = [
  {
    id: "builtin-gov-portal",
    name: "Gov Portal Ready",
    description: "Resize to fit 1600 px, then compress the image under 200 KB as JPG.",
    builtIn: true,
    steps: [
      step("image-resizer", { mode: "pixels", width: 1600, height: 1600, fit: "contain" }),
      step("image-compressor", { mode: "target", targetKB: 200, format: "image/jpeg" }),
    ],
  },
  {
    id: "builtin-2x2",
    name: "2x2 ID Photo",
    description: "White background, 2x2 inch crop, 300 DPI.",
    builtIn: true,
    steps: [step("id-photo-maker", { size: "2x2", background: "white", layout: "single" })],
  },
  {
    id: "builtin-email-pdf",
    name: "Email-Safe PDF",
    description: "Compress a PDF to get it under 2 MB.",
    builtIn: true,
    steps: [step("compress-pdf", { level: "balanced", targetMB: 2 })],
  },
];

/** Remove secret values (passwords) so they are never written to storage. */
function withoutSecrets(steps: ChainStep[]): ChainStep[] {
  return steps.map((entry) => {
    const tool = getTool(entry.slug);
    const options = { ...entry.options };
    tool?.fields.forEach((field) => {
      if (field.type === "text" && field.secret) options[field.key] = "";
    });
    return { slug: entry.slug, options };
  });
}

export function loadSavedChains(): Chain[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Chain[];
    return Array.isArray(parsed) ? parsed.filter((chain) => chain && Array.isArray(chain.steps)) : [];
  } catch {
    return [];
  }
}

export function saveChains(chains: Chain[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chains.map((chain) => ({ ...chain, steps: withoutSecrets(chain.steps) }))));
  } catch {
    // Storage full or blocked: the chain still works for this session.
  }
}

export function newStep(tool: Tool): ChainStep {
  return { slug: tool.slug, options: defaultOptions(tool) };
}
