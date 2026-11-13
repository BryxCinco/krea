"use client";

import { Archive, CornerUpLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob, downloadZip } from "@/lib/download";
import { formatBytes } from "@/lib/file-type";
import { useObjectUrl } from "@/lib/use-object-url";
import type { ToolResult, WorkFile } from "@/tools/types";

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

interface ResultPanelProps {
  result: ToolResult;
  /** Combined size of the input files, to show the before/after size honestly. */
  inputBytes: number;
  /** Still re-rendering with new settings: results shown are from the previous run. */
  stale: boolean;
  onReuse: () => void;
}

/** Output files with sizes and download actions. Several files download together as a ZIP. */
export function ResultPanel({ result, inputBytes, stale, onReuse }: ResultPanelProps) {
  const { files, note } = result;
  const outputBytes = files.reduce((sum, file) => sum + file.blob.size, 0);
  const change = inputBytes ? Math.round((outputBytes / inputBytes - 1) * 100) : 0;

  return (
    <section aria-label="Result" className={`rounded-xl border border-lime/60 bg-panel p-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-fg">Ayos, tapos na.</h2>
        <p className="font-mono text-sm text-muted">
          {formatBytes(inputBytes)} <span aria-hidden>-&gt;</span>
          <span className="sr-only">to</span> <span className="text-lime">{formatBytes(outputBytes)}</span>{" "}
          <span>
            ({change > 0 ? "+" : ""}
            {change}%)
          </span>
        </p>
      </div>
      {note && <p className="mt-2 text-sm leading-relaxed text-fg">{note}</p>}

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
                className="flex size-9 items-center justify-center rounded text-muted hover:text-lime"
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
        <Button className="min-h-12" onClick={onReuse} title="Put the result back on the Stage and apply another Move">
          <CornerUpLeft aria-hidden className="size-4" strokeWidth={1.75} />
          Keep going with this
        </Button>
      </div>
    </section>
  );
}
