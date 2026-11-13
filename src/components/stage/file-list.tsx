"use client";

import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, FileText, GripVertical, X } from "lucide-react";
import { formatBytes } from "@/lib/file-type";
import { useSession, type StageFile } from "@/lib/session";

/** One-line facts about a file: dimensions or page count, then size. */
function describe(file: StageFile): string {
  const parts: string[] = [];
  if (file.info?.width) parts.push(`${file.info.width} x ${file.info.height}`);
  if (file.info?.pages) parts.push(`${file.info.pages} ${file.info.pages === 1 ? "page" : "pages"}`);
  if (file.info?.locked) parts.push("password-protected");
  if (file.info === null) parts.push("cannot be read");
  parts.push(formatBytes(file.file.size));
  return parts.join(" · ");
}

/**
 * Files on the Stage. The order matters for combining tools (merge, image to
 * PDF): drag the grip to reorder, or use the arrow buttons from the keyboard.
 */
export function FileList() {
  const { files, reorderFiles } = useSession();
  return (
    <Reorder.Group axis="y" values={files} onReorder={reorderFiles} aria-label="Files on the Stage" className="flex flex-col gap-1.5">
      {files.map((file, index) => (
        <Row key={file.id} file={file} index={index} />
      ))}
    </Reorder.Group>
  );
}

function Row({ file, index }: { file: StageFile; index: number }) {
  const { files, reorderFiles, removeFile } = useSession();
  const controls = useDragControls();
  const many = files.length > 1;
  const problem = file.info === null || file.info?.locked;

  const move = (offset: number) => {
    const next = [...files];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item);
    reorderFiles(next);
  };

  return (
    <Reorder.Item
      value={file}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-md border border-line bg-panel p-1.5"
    >
      {many && (
        <span
          aria-hidden
          onPointerDown={(event) => controls.start(event)}
          className="flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
        >
          <GripVertical className="size-4" strokeWidth={1.75} />
        </span>
      )}
      {file.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob URL
        <img src={file.previewUrl} alt="" decoding="async" className="size-10 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-raised text-muted">
          <FileText aria-hidden className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{file.name}</p>
        <p className={`truncate font-mono text-xs ${problem ? "text-signal" : "text-muted"}`}>{describe(file)}</p>
      </div>
      {many && (
        <>
          <button
            type="button"
            aria-label={`Move ${file.name} up`}
            disabled={index === 0}
            onClick={() => move(-1)}
            className="flex size-9 items-center justify-center rounded text-muted hover:text-accent disabled:opacity-30"
          >
            <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={`Move ${file.name} down`}
            disabled={index === files.length - 1}
            onClick={() => move(1)}
            className="flex size-9 items-center justify-center rounded text-muted hover:text-accent disabled:opacity-30"
          >
            <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </>
      )}
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={() => removeFile(file.id)}
        className="flex size-9 items-center justify-center rounded text-muted hover:text-signal"
      >
        <X aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
    </Reorder.Item>
  );
}
