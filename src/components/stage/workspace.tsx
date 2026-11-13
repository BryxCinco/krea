"use client";

/**
 * The Workspace: Stage in the centre, side panel (Chains and Recent Moves) on
 * the left, inspector on the right. The home page shows it with every Move
 * available; a tool page (/tools/[slug]) shows the same component locked to one tool.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Link2, Plus, Square, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { RenderLine } from "@/components/chains/render-line";
import { Inspector } from "@/components/inspector/inspector";
import { OPEN_CHAINS_EVENT } from "@/components/ui/app-header";
import { Button } from "@/components/ui/button";
import { Compare } from "@/components/ui/compare";
import { CropBox } from "@/components/ui/crop-box";
import { kindOfMime } from "@/lib/chains";
import { formatBytes, IMAGE_MIMES, PDF_MIME } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { useMediaQuery } from "@/lib/use-media-query";
import { useObjectUrl } from "@/lib/use-object-url";
import { CancelledError, runSteps, StepError, type Job } from "@/lib/worker-client";
import { getTool, movesFor } from "@/tools/registry";
import { defaultOptions, type Chain, type ChainStep, type OptionValues, type ToolResult } from "@/tools/types";
import { Dropzone } from "./dropzone";
import { FileList } from "./file-list";
import { Moves } from "./moves";
import { PageGrid } from "./page-grid";
import { PlacementEditor } from "./placement-editor";
import { Rail, type RailTab } from "./rail";
import { ResultPanel } from "./result-panel";

interface RunState {
  /** Identifies the Move or chain + files this run belongs to, so stale results are never shown. */
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

const RAIL_WIDTH = 320;

export function Workspace({ lockedSlug }: { lockedSlug?: string }) {
  const { files, addFiles, clearFiles, addRecent, setNotice } = useSession();
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const [optionsBySlug, setOptionsBySlug] = useState<Record<string, OptionValues>>({});
  const [chain, setChain] = useState<Chain | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("chains");
  const desktop = useMediaQuery("(min-width: 64rem)");
  const jobRef = useRef<Job | null>(null);
  const jobKeyRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  // Which tool is active: the page's tool, or the Move picked on the Stage (if it still fits the files).
  const moves = useMemo(() => movesFor(files.map((file) => file.mime)), [files]);
  const lockedTool = lockedSlug ? getTool(lockedSlug) : undefined;
  const tool = chain ? undefined : (lockedTool ?? moves.find((move) => move.tool.slug === pickedSlug)?.tool);

  const values = useMemo(() => (tool ? (optionsBySlug[tool.slug] ?? defaultOptions(tool)) : {}), [tool, optionsBySlug]);
  const changeOptions = useCallback(
    (patch: OptionValues) => {
      if (!tool) return;
      setOptionsBySlug((current) => ({ ...current, [tool.slug]: { ...(current[tool.slug] ?? defaultOptions(tool)), ...patch } }));
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
    else if (locked && !tool.acceptsLocked) blocked = `"${locked.name}" is password-protected. I-unlock muna gamit ang Protect / Unlock PDF.`;
    else if (files.length < minFiles) blocked = `${tool.name} needs at least ${minFiles} files. Mag-add pa.`;
  }
  const warning =
    tool?.warn && !blocked
      ? tool.warn(files.map((file) => ({ width: file.info?.width, height: file.info?.height, pages: file.info?.pages, bytes: file.file.size })), values)
      : null;

  const fileKey = files.map((file) => file.id).join(",");
  const key = chain ? `chain:${chain.id}|${fileKey}` : `move:${tool?.slug}|${fileKey}`;
  const current = run?.key === key ? run : null;
  const running = current?.status === "running";

  // Leaving this tool/file combination cancels work still running for it. Compare
  // against the job's own key: starting a chain changes `key` and must not cancel itself.
  useEffect(() => {
    if (jobRef.current && jobKeyRef.current !== key) {
      jobRef.current.cancel();
      jobRef.current = null;
    }
  }, [key]);
  useEffect(() => () => jobRef.current?.cancel(), []);

  /** Execute steps on the Stage files and track the run under `runKey`. */
  const execute = (runKey: string, steps: ChainStep[], name: string, record: boolean) => {
    jobRef.current?.cancel();
    const job = runSteps(
      steps,
      files.map((file) => ({ name: file.name, type: file.mime, blob: file.file })),
      (progress) => {
        if (jobRef.current !== job) return;
        setRun((previous) => (previous?.key === runKey ? { ...previous, progress: progress.value, label: progress.label } : previous));
      },
    );
    jobRef.current = job;
    jobKeyRef.current = runKey;
    // Keep the previous result on screen while a live preview re-renders.
    setRun((previous) => ({
      key: runKey,
      status: "running",
      progress: 0,
      label: name,
      result: previous?.key === runKey ? previous.result : undefined,
    }));

    job.promise.then(
      (result) => {
        if (jobRef.current !== job) return;
        jobRef.current = null;
        setRun({ key: runKey, status: "done", progress: 1, label: "Done", result });
        if (record) {
          addRecent(name, result.files);
          setNotice(`${name}: tapos na. ${result.files.length} ${result.files.length === 1 ? "file" : "files"} ready.`);
        }
      },
      (error: Error) => {
        if (jobRef.current !== job) return;
        jobRef.current = null;
        if (error instanceof CancelledError) {
          setRun(null);
          return;
        }
        // In a chain, say which step failed and keep what the earlier steps produced.
        const multi = steps.length > 1 && error instanceof StepError;
        setRun({
          key: runKey,
          status: "error",
          progress: 0,
          label: "",
          message: multi ? `Step ${error.stepIndex + 1} (${error.toolName}) failed: ${error.message}` : error.message,
          result: multi && error.partial ? { files: error.partial, note: `Output of steps 1 to ${error.stepIndex}, before the failure.` } : undefined,
        });
      },
    );
  };

  /** Run the active Move. `record` adds the result to Recent Moves (skipped for live previews). */
  const start = (record: boolean) => {
    if (!tool || blocked || files.length === 0) return;
    execute(key, [{ slug: tool.slug, options: values }], tool.name, record);
  };

  const runChain = (next: Chain) => {
    if (files.length === 0) return;
    setChain(next);
    if (!desktop) setRailOpen(false); // show the render line on phones
    execute(`chain:${next.id}|${fileKey}`, next.steps, next.name, true);
  };

  const cancel = () => {
    jobRef.current?.cancel();
    jobRef.current = null;
    setRun(null);
  };

  // Live preview: re-run shortly after settings change. Multi-file tools (collage) preview the whole set.
  const livePreview = useEffectEvent(() => start(false));
  const liveEnabled = Boolean(tool?.live) && !blocked && (tool?.input === "all" ? files.length <= 12 : files.length === 1);
  useEffect(() => {
    if (!liveEnabled) return;
    const timer = setTimeout(livePreview, 350);
    return () => clearTimeout(timer);
  }, [liveEnabled, values, key]);

  // A file picked before React hydrated never fired onChange: pick it up now.
  const adoptEarlyPick = useEffectEvent(() => {
    const input = inputRef.current;
    if (input?.files?.length) {
      addFiles(input.files);
      input.value = "";
    }
  });
  useEffect(() => adoptEarlyPick(), []);

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

  // The header's "Chains" link opens the side panel (directly, or via /#chains from another page).
  useEffect(() => {
    const openChains = () => {
      setRailTab("chains");
      setRailOpen(true);
      document.getElementById("stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (location.hash === "#chains") openChains();
    window.addEventListener(OPEN_CHAINS_EVENT, openChains);
    return () => window.removeEventListener(OPEN_CHAINS_EVENT, openChains);
  }, []);

  const acceptList = lockedTool ? lockedTool.accepts : [...IMAGE_MIMES, PDF_MIME];
  const formats = acceptList.map((mime) => FORMAT_LABELS[mime]).join(" · ");
  const openPicker = () => inputRef.current?.click();

  // Chains need one kind of file on the Stage.
  const kinds = new Set(files.map((file) => kindOfMime(file.mime)));
  const chainProps = {
    startKind: kinds.size === 1 ? [...kinds][0] : null,
    mixed: kinds.size > 1,
    fileCount: files.length,
    runningId: chain && running ? chain.id : null,
    onRun: runChain,
    onCancel: cancel,
  };

  // Preview pieces
  const first = files[0];
  const stageField = tool?.fields.find((field) => field.type === "crop" || field.type === "placement" || field.type === "pageGrid");
  const result = current?.result;
  const firstOutput = result?.files[0];
  const outputUrl = useObjectUrl(firstOutput?.type.startsWith("image/") ? firstOutput.blob : undefined);
  const inputBytes = files.reduce((sum, file) => sum + file.file.size, 0);
  const rect = (prefix: string) => ({
    x: Number(values[`${prefix}X`]),
    y: Number(values[`${prefix}Y`]),
    w: Number(values[`${prefix}W`]),
    h: Number(values[`${prefix}H`]),
  });
  const setRect = (prefix: string) => (next: { x: number; y: number; w: number; h: number }) =>
    changeOptions({ [`${prefix}X`]: next.x, [`${prefix}Y`]: next.y, [`${prefix}W`]: next.w, [`${prefix}H`]: next.h });

  let preview: ReactNode = null;
  if (stageField?.type === "crop" && first?.previewUrl && first.info?.width && first.info.height) {
    const [ratioW, ratioH] = String(values[stageField.aspectKey ?? ""] ?? "free").split(":").map(Number);
    preview = (
      <CropBox
        src={first.previewUrl}
        alt="Image being cropped"
        label={`Crop area, ${Math.round(Number(values[`${stageField.key}W`]) * first.info.width)} by ${Math.round(Number(values[`${stageField.key}H`]) * first.info.height)} pixels`}
        imageWidth={first.info.width}
        imageHeight={first.info.height}
        aspect={ratioW && ratioH ? ratioW / ratioH : null}
        value={rect(stageField.key)}
        onChange={setRect(stageField.key)}
      />
    );
  } else if (stageField?.type === "placement" && first?.mime === PDF_MIME && !blocked) {
    preview = (
      <PlacementEditor
        file={first}
        page={values.allPages ? 1 : Number(values[stageField.pageKey]) || 1}
        image={String(values[stageField.imageKey] ?? "")}
        value={rect(stageField.key)}
        onChange={setRect(stageField.key)}
      />
    );
  } else if (stageField?.type === "pageGrid" && first?.mime === PDF_MIME && !blocked) {
    preview = <PageGrid file={first} value={String(values[stageField.key] ?? "")} onChange={(layout) => changeOptions({ [stageField.key]: layout })} />;
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
    preview = <img src={outputUrl} alt="Result preview" className="checkerboard max-h-[56vh] max-w-full rounded-md border border-line" />;
  } else if (files.length === 1 && first.previewUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
    preview = <img src={first.previewUrl} alt={first.name} className="checkerboard max-h-[56vh] max-w-full rounded-md border border-line" />;
  }

  const rail = <Rail tab={railTab} onTab={setRailTab} chains={chainProps} />;
  const showInspector = Boolean(tool) && files.length > 0;

  return (
    <div
      id="stage"
      className="relative flex scroll-mt-(--header-h) border-y border-line"
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
        accept={acceptList.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          if (event.target.files?.length) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/* Side panel: in the layout on desktop, a bottom sheet on phones. */}
      <AnimatePresence initial={false}>
        {railOpen &&
          (desktop ? (
            <motion.aside
              key="rail"
              aria-label="Chains and recent Moves"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: RAIL_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="shrink-0 overflow-hidden border-r border-line bg-panel"
            >
              <div className="sticky top-(--header-h) h-[calc(100dvh-var(--header-h))]" style={{ width: RAIL_WIDTH }}>
                {rail}
              </div>
            </motion.aside>
          ) : (
            <div key="sheet" className="fixed inset-0 z-[60]">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRailOpen(false)} className="absolute inset-0 bg-scrim" />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Chains and recent Moves"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="absolute inset-x-0 bottom-0 flex h-[85dvh] flex-col rounded-t-2xl border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]"
              >
                <div className="flex items-center justify-between px-4 pt-3">
                  <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-line" />
                </div>
                <div className="absolute right-2 top-2">
                  <Button variant="ghost" icon aria-label="Close panel" onClick={() => setRailOpen(false)}>
                    <X aria-hidden className="size-5" strokeWidth={1.75} />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 pt-6">{rail}</div>
              </motion.div>
            </div>
          ))}
      </AnimatePresence>

      <section aria-label="The Stage" className={`min-w-0 flex-1 px-4 py-4 lg:px-8 lg:py-6 ${showInspector ? "pb-36 lg:pb-10" : ""}`}>
        <div className="mx-auto mb-3 flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <Button
            aria-label={railOpen ? "Hide chains panel" : "Show chains panel"}
            aria-expanded={railOpen}
            onClick={() => setRailOpen((open) => !open)}
            className={railOpen ? "border-accent text-accent" : ""}
          >
            <Link2 aria-hidden className="size-4" strokeWidth={1.75} />
            Chains
          </Button>
          {files.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-xs text-muted min-[420px]:inline">
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
          <Dropzone formats={formats} dragging={dragging} onPick={openPicker} />
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-5">
            <FileList />

            {!lockedSlug &&
              (moves.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-widest text-muted">
                    {tool || chain ? "Moves" : "Ano'ng gusto mong gawin? Pick a Move"}
                  </p>
                  {/* Re-key on the file mix so chips spring in again when the available Moves change. */}
                  <Moves
                    key={moves.map((move) => move.tool.slug).join()}
                    moves={moves}
                    activeSlug={tool?.slug ?? null}
                    onPick={(slug) => {
                      setChain(null);
                      setPickedSlug(slug);
                    }}
                  />
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
                  <Link href="/" className="underline hover:text-accent">
                    open the Stage
                  </Link>{" "}
                  to see every Move for these files.
                </span>
              </p>
            )}

            {chain && (
              <p className="flex items-center gap-2 text-sm text-fg">
                <Link2 aria-hidden className="size-4 text-accent" strokeWidth={1.75} />
                Chain: <span className="font-semibold">{chain.name}</span>
                <span className="font-mono text-xs text-muted">{chain.steps.length} steps</span>
              </p>
            )}

            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <RenderLine active={running} progress={current?.progress ?? 0} label={current?.label ?? ""} />
              </div>
              {running && (chain || !tool?.live) && (
                <Button variant="signal" className="min-h-8 shrink-0 px-3" onClick={cancel}>
                  <Square aria-hidden className="size-3.5" strokeWidth={2} />
                  Cancel
                </Button>
              )}
            </div>

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
                title={current?.status === "error" ? "Partial result" : undefined}
                onReuse={() => {
                  clearFiles();
                  setChain(null);
                  addFiles(result.files);
                }}
              />
            )}
          </div>
        )}

        {/* Full-stage drop hint while dragging over existing files. */}
        {dragging && files.length > 0 && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-accent bg-scrim">
            <p className="text-2xl font-semibold text-accent">I-drop mo lang.</p>
          </div>
        )}
      </section>

      {showInspector && tool && (
        <Inspector
          tool={tool}
          values={values}
          pageCount={files.find((file) => file.info?.pages)?.info?.pages}
          running={running}
          blocked={blocked}
          warning={warning}
          runLabel={files.length > 1 && tool.input === "each" ? `${tool.verb} ${files.length} files` : tool.verb}
          onChange={changeOptions}
          onRun={() => start(true)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}
