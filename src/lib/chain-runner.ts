/**
 * Chain runner. Executes one or more steps in sequence, feeding each step's
 * output files into the next. A single Move is just a chain with one step.
 * Runs inside a worker (see src/workers/runtime.ts).
 */
import { MAX_FILE_BYTES } from "@/lib/file-type";
import { getTool } from "@/tools/registry";
import { KreaError, type ChainStep, type ToolResult, type WorkFile } from "@/tools/types";

export interface ChainProgress {
  /** Overall progress, 0..1. */
  value: number;
  label: string;
  /** Zero-based index of the step that is running. */
  step: number;
}

export async function runChain(
  steps: ChainStep[],
  inputs: WorkFile[],
  onProgress: (progress: ChainProgress) => void,
  /** Only passed when running on the main thread ("pdfjs" tools). */
  signal?: AbortSignal,
): Promise<ToolResult> {
  let files = inputs;
  let view: ToolResult["view"];
  const notes: string[] = [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    const tool = getTool(step.slug);
    if (!tool) throw new KreaError("failed", `Unknown tool "${step.slug}".`);

    for (const file of files) {
      if (!tool.accepts.includes(file.type)) {
        throw new KreaError("unsupported", `${tool.name} cannot open "${file.name}". Hindi supported ang file type na ito.`);
      }
      if (file.blob.size > MAX_FILE_BYTES) {
        throw new KreaError("too-large", `"${file.name}" is over 200 MB, masyadong malaki to process safely in a browser.`);
      }
    }
    if (files.length < (tool.minFiles ?? 1)) {
      throw new KreaError("failed", `${tool.name} needs at least ${tool.minFiles} files.`);
    }

    // Map a tool's local 0..1 progress onto the whole chain.
    const report = (local: number, label?: string) =>
      onProgress({
        value: (stepIndex + Math.min(1, Math.max(0, local))) / steps.length,
        label: label ?? tool.verb,
        step: stepIndex,
      });
    report(0);

    if (tool.input === "all") {
      const result = await tool.run(files, step.options, { progress: report, signal });
      files = result.files;
      view = result.view;
      if (result.note) notes.push(result.note);
    } else {
      // Batch: one file at a time keeps peak memory at a single decoded file.
      const outputs: WorkFile[] = [];
      const texts: string[] = [];
      let textView: Extract<NonNullable<ToolResult["view"]>, { type: "text" }> | undefined;
      view = undefined;
      for (let i = 0; i < files.length; i++) {
        const result = await tool.run([files[i]], step.options, {
          signal,
          progress: (local, label) =>
            report((i + local) / files.length, files.length > 1 ? `${label ?? tool.verb} (${i + 1}/${files.length})` : label),
        });
        outputs.push(...result.files);
        if (result.note && !notes.includes(result.note)) notes.push(result.note);
        // On-screen content: text from several files is joined; otherwise the first file's view is shown.
        if (result.view?.type === "text") {
          textView ??= result.view;
          texts.push(files.length > 1 ? `=== ${files[i].name} ===\n${result.view.text}` : result.view.text);
        } else {
          view ??= result.view;
        }
      }
      if (texts.length) view = { type: "text", text: texts.join("\n\n"), label: textView?.label, keepSize: textView?.keepSize };
      files = outputs;
    }
  }

  onProgress({ value: 1, label: "Done", step: steps.length - 1 });
  return { files, note: notes.join(" ") || undefined, view };
}
