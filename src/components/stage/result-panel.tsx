"use client";

import { Archive, Copy, CornerUpLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob, downloadZip } from "@/lib/download";
import { formatBytes } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { useObjectUrl } from "@/lib/use-object-url";
import type { PaletteColor, ToolResult, WorkFile } from "@/tools/types";

function Thumb({ file }: { file: WorkFile }) {
  const url = useObjectUrl(file.type.startsWith("image/") ? file.blob : undefined);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
    <img src={url} alt="" decoding="async" className="checkerboard size-10 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded bg-raised text-muted">
      <FileText aria-hidden className="size-5" strokeWidth={1.75} />
    </span>
  );
}

function useCopy() {
  const { setNotice } = useSession();
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Copied ${what}.`);
    } catch {
      setNotice("Hindi ma-copy: the browser blocked clipboard access. Select the text and copy it by hand.");
    }
  };
}

/** Swatches: tap the colour to copy HEX, or a format button for RGB / HSL. */
function PaletteView({ colors }: { colors: PaletteColor[] }) {
  const copy = useCopy();
  return (
    <ul aria-label="Palette" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {colors.map((color) => (
        <li key={color.hex} className="overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            onClick={() => copy(color.hex, color.hex)}
            aria-label={`Copy ${color.hex}`}
            className="block h-16 w-full"
            style={{ backgroundColor: color.hex }}
          />
          <div className="p-2">
            <p className="flex items-baseline justify-between font-mono text-sm text-fg">
              {color.hex}
              <span className="text-xs text-muted">{Math.round(color.share * 100)}%</span>
            </p>
            <div className="mt-1 flex gap-1">
              {(["hex", "rgb", "hsl"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => copy(color[format], color[format])}
                  title={color[format]}
                  className="min-h-8 flex-1 rounded border border-line font-mono text-[11px] uppercase text-muted hover:border-accent hover:text-accent"
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TextView({ text }: { text: string }) {
  const copy = useCopy();
  return (
    <div className="mt-3">
      <textarea
        readOnly
        value={text}
        aria-label="Extracted text"
        rows={Math.min(16, Math.max(5, text.split("\n").length + 1))}
        className="w-full resize-y rounded-md border border-line bg-ink p-3 font-mono text-sm leading-relaxed text-fg"
      />
      <Button className="mt-2" onClick={() => copy(text, "the text")} disabled={!text}>
        <Copy aria-hidden className="size-4" strokeWidth={1.75} />
        Copy text
      </Button>
    </div>
  );
}

interface ResultPanelProps {
  result: ToolResult;
  /** Combined size of the input files, to show the before/after size honestly. */
  inputBytes: number;
  /** Still re-rendering with new settings: results shown are from the previous run. */
  stale: boolean;
  /** Heading override, e.g. for the partial output of a chain that stopped. */
  title?: string;
  onReuse: () => void;
}

/** Output files with sizes and download actions. Several files download together as a ZIP. */
export function ResultPanel({ result, inputBytes, stale, title, onReuse }: ResultPanelProps) {
  const { files, note, view } = result;
  const outputBytes = files.reduce((sum, file) => sum + file.blob.size, 0);
  const change = inputBytes ? Math.round((outputBytes / inputBytes - 1) * 100) : 0;
  // Palettes and text are not files you would keep editing on the Stage.
  const reusable = files.every((file) => file.type.startsWith("image/") || file.type === "application/pdf");
  const showSize = !view;

  return (
    <section aria-label="Result" className={`rounded-xl border border-accent/60 bg-panel p-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-fg">{title ?? "Ayos, tapos na."}</h2>
        {showSize && (
          <p className="font-mono text-sm text-muted">
            {formatBytes(inputBytes)} <span aria-hidden>-&gt;</span>
            <span className="sr-only">to</span> <span className="text-accent">{formatBytes(outputBytes)}</span>{" "}
            <span>
              ({change > 0 ? "+" : ""}
              {change}%)
            </span>
          </p>
        )}
      </div>
      {note && <p className="mt-2 text-sm leading-relaxed text-fg">{note}</p>}

      {view?.type === "palette" && <PaletteView colors={view.colors} />}
      {view?.type === "text" && <TextView text={view.text} />}

      <ul className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {files.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md border border-line p-1.5">
            <Thumb file={file} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{file.name}</p>
              <p className="font-mono text-xs text-muted">{formatBytes(file.blob.size)}</p>
            </div>
            {files.length > 1 && (
              <button
                type="button"
                aria-label={`Download ${file.name}`}
                onClick={() => downloadBlob(file.blob, file.name)}
                className="flex size-9 items-center justify-center rounded text-muted hover:text-accent"
              >
                <Download aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {files.length === 1 ? (
          <Button variant="primary" className="min-h-12 flex-1 sm:flex-none" onClick={() => downloadBlob(files[0].blob, files[0].name)}>
            <Download aria-hidden className="size-4" strokeWidth={2} />
            Download
          </Button>
        ) : (
          <Button variant="primary" className="min-h-12 flex-1 sm:flex-none" onClick={() => downloadZip(files, "krea-files.zip")}>
            <Archive aria-hidden className="size-4" strokeWidth={2} />
            Download ZIP ({files.length} files)
          </Button>
        )}
        {reusable && (
          <Button className="min-h-12" onClick={onReuse} title="Put the result back on the Stage and apply another Move">
            <CornerUpLeft aria-hidden className="size-4" strokeWidth={1.75} />
            Keep going with this
          </Button>
        )}
      </div>
    </section>
  );
}
