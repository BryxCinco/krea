"use client";

/**
 * The Workspace: Stage in the centre, Recent Moves rail on the left, inspector
 * on the right. The home page shows it with every Move available; a tool page
 * (/tools/[slug]) shows the same component locked to one tool.
 */
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeft, PanelLeftClose, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { RenderLine } from "@/components/chains/render-line";
import { Inspector } from "@/components/inspector/inspector";
import { Button } from "@/components/ui/button";
import { Compare } from "@/components/ui/compare";
import { CropBox } from "@/components/ui/crop-box";
import { formatBytes, IMAGE_MIMES, PDF_MIME } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { useObjectUrl } from "@/lib/use-object-url";
import { CancelledError, runSteps, type Job } from "@/lib/worker-client";
import { getTool, movesFor } from "@/tools/registry";
import { defaultOptions, type OptionValues, type ToolResult } from "@/tools/types";
import { Dropzone } from "./dropzone";
import { FileList } from "./file-list";
import { Moves } from "./moves";
import { Rail } from "./rail";
import { ResultPanel } from "./result-panel";

interface RunState {
  /** Identifies the tool + files this run belongs to, so stale results are never shown. */
  key: string;
  status: "running" | "done" | "error";
  progress: number;
  label: string;
  result?: ToolResult;
  message?: string;
}

const FORMAT_LABELS: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  [PDF_MIME]: "PDF",
};

export function Workspace({ lockedSlug, title }: { lockedSlug?: string; title?: ReactNode }) {
  const { files, addFiles, clearFiles, addRecent, setNotice } = useSession();
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const [optionsBySlug, setOptionsBySlug] = useState<Record<string, OptionValues>>({});
  const [run, setRun] = useState<RunState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const jobRef = useRef<Job | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  // Which tool is active: the page's tool, or the Move picked on the Stage (if it still fits the files).
  const moves = useMemo(() => movesFor(files.map((file) => file.mime)), [files]);
  const lockedTool = lockedSlug ? getTool(lockedSlug) : undefined;
  const tool = lockedTool ?? moves.find((move) => move.tool.slug === pickedSlug)?.tool;

  const values = useMemo(
    () => (tool ? (optionsBySlug[tool.slug] ?? defaultOptions(tool)) : {}),
    [tool, optionsBySlug],
  );
  const changeOptions = useCallback(
    (patch: OptionValues) => {
      if (!tool) return;
      setOptionsBySlug((current) => ({
        ...current,
        [tool.slug]: { ...(current[tool.slug] ?? defaultOptions(tool)), ...patch },
      }));
    },
    [tool],
  );

  // Can the active tool run on what is on the Stage?
  const rejected = tool ? files.filter((file) => !tool.accepts.includes(file.mime)) : [];
  const locked = files.find((file) => file.info?.locked);
  let blocked: string | null = null;
  if (tool) {
    const minFiles = tool.minFiles ?? 1;
    if (rejected.length) blocked = `${tool.name} cannot open ${rejected.length === 1 ? `"${rejected[0].name}"` : `${rejected.length} of these files`}.`;
    else if (locked) blocked = `"${locked.name}" is password-protected. I-unlock muna.`;
    else if (files.length < minFiles) blocked = `${tool.name} needs at least ${minFiles} files. Mag-add pa.`;
  }

  const key = `${tool?.slug}|${files.map((file) => file.id).join(",")}`;
  const current = run?.key === key ? run : null;
  const running = current?.status === "running";

  // Leaving this tool/file combination cancels any work still running for it.
  useEffect(
    () => () => {
      jobRef.current?.cancel();
      jobRef.current = null;
    },
    [key],
  );

  /** Run the active Move. `record` adds the result to Recent Moves (skipped for live previews). */
  const start = (record: boolean) => {
    if (!tool || blocked || files.length === 0) return;
    jobRef.current?.cancel();
    const runKey = key;
    const job = runSteps(
      tool.worker,
      [{ slug: tool.slug, options: values }],
      files.map((file) => ({ name: file.name, type: file.mime, blob: file.file })),
      (progress) => {
        if (jobRef.current !== job) return;
        setRun((previous) => (previous?.key === runKey ? { ...previous, progress: progress.value, label: progress.label } : previous));
      },
    );
    jobRef.current = job;
    // Keep the previous result on screen while a live preview re-renders.
    setRun((previous) => ({
      key: runKey,
      status: "running",
      progress: 0,
      label: tool.verb,
      result: previous?.key === runKey ? previous.result : undefined,
    }));

    job.promise.then(
      (result) => {
        if (jobRef.current !== job) return;
        jobRef.current = null;
        setRun({ key: runKey, status: "done", progress: 1, label: "Done", result });
        if (record) {
          addRecent(tool.name, result.files);
          setNotice(`${tool.name}: tapos na. ${result.files.length} ${result.files.length === 1 ? "file" : "files"} ready.`);
        }
      },
      (error: Error) => {
        if (jobRef.current !== job) return;
        jobRef.current = null;
        setRun(
          error instanceof CancelledError
            ? null
            : { key: runKey, status: "error", progress: 0, label: "", message: error.message },
        );
      },
    );
  };

  const cancel = () => {
    jobRef.current?.cancel();
    jobRef.current = null;
    setRun(null);
  };

  // Live preview: re-run shortly after settings change (single file only, to stay light).
  const livePreview = useEffectEvent(() => start(false));
  const liveEnabled = Boolean(tool?.live) && files.length === 1 && !blocked;
  useEffect(() => {
    if (!liveEnabled) return;
    const timer = setTimeout(livePreview, 350);
    return () => clearTimeout(timer);
  }, [liveEnabled, values, key]);

  // Paste anywhere (Ctrl+V) to add files.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = event.clipboardData?.files;
      if (pasted?.length) {
        event.preventDefault();
        addFiles(pasted);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const accept = (tool && lockedSlug ? tool.accepts : [...IMAGE_MIMES, PDF_MIME]).join(",");
  const formats = (tool && lockedSlug ? tool.accepts : [...IMAGE_MIMES, PDF_MIME]).map((mime) => FORMAT_LABELS[mime]).join(" · ");
  const openPicker = () => inputRef.current?.click();

  // Preview pieces
  const first = files[0];
  const cropField = tool?.fields.find((field) => field.type === "crop");
  const result = current?.result;
  const firstOutput = result?.files[0];
  const outputUrl = useObjectUrl(firstOutput?.type.startsWith("image/") ? firstOutput.blob : undefined);
  const inputBytes = files.reduce((sum, file) => sum + file.file.size, 0);

  let preview: ReactNode = null;
  if (tool && cropField?.type === "crop" && first?.previewUrl && first.info?.width && first.info.height) {
    const [ratioW, ratioH] = String(values[cropField.aspectKey ?? ""] ?? "free").split(":").map(Number);
    preview = (
      <CropBox
        src={first.previewUrl}
        imageWidth={first.info.width}
        imageHeight={first.info.height}
        aspect={ratioW && ratioH ? ratioW / ratioH : null}
        value={{
          x: Number(values[`${cropField.key}X`]),
          y: Number(values[`${cropField.key}Y`]),
          w: Number(values[`${cropField.key}W`]),
          h: Number(values[`${cropField.key}H`]),
        }}
        onChange={(rect) =>
          changeOptions({
            [`${cropField.key}X`]: rect.x,
            [`${cropField.key}Y`]: rect.y,
            [`${cropField.key}W`]: rect.w,
            [`${cropField.key}H`]: rect.h,
          })
        }
      />
    );
  } else if (outputUrl && firstOutput && tool?.compare && files.length === 1 && first.previewUrl && result.files.length === 1) {
    preview = (
      <Compare
        before={first.previewUrl}
        after={outputUrl}
        beforeLabel={`Before ${formatBytes(first.file.size)}`}
        afterLabel={`After ${formatBytes(firstOutput.blob.size)}`}
      />
    );
  } else if (outputUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
    preview = <img src={outputUrl} alt="Result preview" className="checkerboard max-h-[52vh] max-w-full rounded-md border border-line" />;
  } else if (files.length === 1 && first.previewUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
    preview = <img src={first.previewUrl} alt={first.name} className="checkerboard max-h-[52vh] max-w-full rounded-md border border-line" />;
  }

  return (
    <div
      className="relative flex min-h-[calc(100dvh-3.5rem)]"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files?.length) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/* Left rail: in the layout on desktop, an overlay drawer on mobile. */}
      <AnimatePresence initial={false}>
        {railOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRailOpen(false)}
              className="fixed inset-0 z-30 bg-ink/70 lg:hidden"
            />
            <motion.aside
              aria-label="Recent Moves"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 272, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed inset-y-0 left-0 z-40 shrink-0 overflow-hidden border-r border-line bg-panel pt-14 lg:static lg:z-auto lg:pt-0"
            >
              <div className="h-full w-[272px]">
                <Rail />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <section aria-label="The Stage" className={`min-w-0 flex-1 px-4 pt-3 lg:px-8 ${tool && files.length ? "pb-36 lg:pb-10" : "pb-10"}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            icon
            aria-label={railOpen ? "Hide Recent Moves" : "Show Recent Moves"}
            aria-expanded={railOpen}
            className="relative z-50 lg:z-auto"
            onClick={() => setRailOpen((open) => !open)}
          >
            {railOpen ? <PanelLeftClose aria-hidden className="size-5" strokeWidth={1.75} /> : <PanelLeft aria-hidden className="size-5" strokeWidth={1.75} />}
          </Button>
          {files.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted">
                {files.length} {files.length === 1 ? "file" : "files"} · {formatBytes(inputBytes)}
              </span>
              <Button onClick={openPicker}>
                <Plus aria-hidden className="size-4" strokeWidth={1.75} />
                Add
              </Button>
              <Button variant="ghost" onClick={clearFiles}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {files.length === 0 ? (
          <Dropzone title={title} formats={formats} dragging={dragging} onPick={openPicker} />
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <FileList />

            {!lockedSlug &&
              (moves.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-widest text-muted">
                    {tool ? "Moves" : "Ano'ng gusto mong gawin? Pick a Move"}
                  </p>
                  {/* Re-key on the file mix so chips spring in again when the available Moves change. */}
                  <Moves key={moves.map((move) => move.tool.slug).join()} moves={moves} activeSlug={tool?.slug ?? null} onPick={setPickedSlug} />
                </div>
              ) : (
                <p className="flex items-start gap-2 text-sm leading-relaxed text-signal">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  Walang Move na pwede sa lahat ng files na ito nang sabay. Images and PDFs need different Moves, so remove one kind.
                </p>
              ))}

            {lockedSlug && rejected.length > 0 && (
              <p className="flex items-start gap-2 text-sm leading-relaxed text-signal">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                <span>
                  {blocked} Remove {rejected.length === 1 ? "it" : "them"}, or{" "}
                  <Link href="/" className="underline hover:text-lime">
                    open the Stage
                  </Link>{" "}
                  to see every Move for these files.
                </span>
              </p>
            )}

            <RenderLine active={running} progress={current?.progress ?? 0} label={current?.label ?? ""} />

            {current?.status === "error" && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-signal p-3 text-sm leading-relaxed text-fg">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.75} />
                {current.message}
              </p>
            )}

            {preview && <div className="flex justify-center">{preview}</div>}

            {result && (
              <ResultPanel
                result={result}
                inputBytes={inputBytes}
                stale={running}
                onReuse={() => {
                  clearFiles();
                  addFiles(result.files);
                }}
              />
            )}
          </div>
        )}

        {/* Full-stage drop hint while dragging over existing files. */}
        {dragging && files.length > 0 && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-lime bg-ink/80">
            <p className="text-2xl font-semibold text-lime">I-drop mo lang.</p>
          </div>
        )}
      </section>

      {tool && files.length > 0 && (
        <Inspector
          tool={tool}
          values={values}
          pageCount={files.find((file) => file.info?.pages)?.info?.pages}
          running={running}
          blocked={blocked}
          runLabel={files.length > 1 && tool.input === "each" ? `${tool.verb} ${files.length} files` : tool.verb}
          onChange={changeOptions}
          onRun={() => start(true)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}
