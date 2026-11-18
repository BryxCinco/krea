"use client";

import { Download, Search, ShieldAlert, SquareX, Trash2, Undo2, X } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { renameFile } from "@/lib/file-type";
import { pdfBlob } from "@/lib/pdf-utils";
import { useSession } from "@/lib/session";
import { findText, redact, type RedactionBox } from "@/tools/pdf/redact-pdf";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { normalizedPoint, PageCanvas, PageNav, PdfPicker, PdfPlaceholder, usePageImage, usePdfFile } from "./pdf-shared";

type Dpi = "150" | "200" | "300";
const pageList = (pages: number[]) => pages.map((page) => page + 1).join(", ");

export default function RedactPdfEditor() {
  // Nothing is saved: the PDF and the boxes stay in memory until the tab closes.
  const [boxes, setBoxes] = useState<RedactionBox[]>([]);
  const [history, setHistory] = useState<RedactionBox[][]>([]);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<string>("");
  const [dpi, setDpi] = useState<Dpi>("200");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const nextId = useRef(1);
  const controller = useRef<AbortController | null>(null);
  const { setNotice } = useSession();

  const source = usePdfFile(() => {
    setBoxes([]);
    setHistory([]);
    setPage(0);
    setFound("");
    setError("");
  });
  const pdf = source.pdf;
  const { image, error: renderError } = usePageImage(pdf?.doc ?? null, page);
  const busy = progress !== null;

  const commit = (next: RedactionBox[]) => {
    setHistory((stack) => [...stack.slice(-49), boxes]);
    setBoxes(next);
  };
  const undo = () => {
    if (!history.length) return;
    setBoxes(history[history.length - 1]);
    setHistory((stack) => stack.slice(0, -1));
  };

  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const { x, y } = normalizedPoint(event, event.currentTarget);
    return { x: x * (image?.width ?? 0), y: y * (image?.height ?? 0) };
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || busy || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = pointAt(event);
    setDraft({ x0: x, y0: y, x, y });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draft) setDraft({ ...draft, ...pointAt(event) });
  };
  const onPointerUp = () => {
    if (!draft) return;
    const w = Math.abs(draft.x - draft.x0);
    const h = Math.abs(draft.y - draft.y0);
    if (w >= 3 && h >= 3) commit([...boxes, { id: nextId.current++, page, x: Math.min(draft.x, draft.x0), y: Math.min(draft.y, draft.y0), w, h }]);
    setDraft(null);
  };

  const search = async () => {
    if (!pdf) return;
    setSearching(true);
    setError("");
    try {
      const matches = await findText(pdf.doc, query, nextId.current);
      nextId.current += matches.length;
      if (!matches.length) {
        setFound(`Walang nahanap na "${query.trim()}". Scanned pages cannot be searched: box them by hand.`);
        return;
      }
      commit([...boxes, ...matches]);
      const pages = [...new Set(matches.map((box) => box.page))];
      setFound(`${matches.length} ${matches.length === 1 ? "match" : "matches"} boxed on page ${pageList(pages)}. Check each one.`);
      setPage(pages[0]);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Hindi natapos ang search.");
    } finally {
      setSearching(false);
    }
  };

  const download = async () => {
    if (!pdf) return;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setProgress(0);
    try {
      const result = await redact(pdf.file, pdf.file.name, pdf.doc, boxes, Number(dpi), setProgress, abort.signal);
      downloadBlob(pdfBlob(result.bytes), renameFile(pdf.file.name, "pdf", "-redacted"));
      setNotice(`Na-redact. Page ${pageList(result.rasterized)} ${result.rasterized.length === 1 ? "was" : "were"} turned into an image, so the hidden text is gone.${result.reduced ? " Some large pages were rendered a little lower to stay memory-safe." : ""}`);
    } catch (failure) {
      if (abort.signal.aborted) setNotice("Cancelled. Walang na-save.");
      else setError(failure instanceof Error && failure.message ? failure.message : "Hindi natapos ang redaction.");
    } finally {
      controller.current = null;
      setProgress(null);
    }
  };

  const onPage = boxes.filter((box) => box.page === page);
  const markedPages = [...new Set(boxes.map((box) => box.page))].sort((a, b) => a - b);

  const form = (
    <>
      <PdfPicker state={source} busy={busy} />
      <div role="note" className="flex gap-3 rounded-xl border border-signal/60 p-4 text-sm leading-relaxed text-fg">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-signal" strokeWidth={1.75} />
        <p>
          <span className="font-semibold">Pages with a black box are rasterized</span>: Krea rebuilds them as images, so the text under the boxes is deleted for good. On those pages, text can no longer be selected or searched. Pages without boxes stay as they are.
        </p>
      </div>
      <Group title="Find text">
        <div className="flex gap-2">
          <label htmlFor="redact-query" className="sr-only">
            Text to find
          </label>
          <input
            id="redact-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim().length >= 2) search();
            }}
            placeholder="e.g. a TIN, account number or name"
            autoComplete="off"
            className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg placeholder:text-muted/70 hover:border-muted"
          />
          <Button onClick={search} disabled={!pdf || searching || busy || query.trim().length < 2}>
            <Search aria-hidden className="size-4" strokeWidth={1.75} />
            {searching ? "Finding…" : "Box all"}
          </Button>
        </div>
        {found && <p className="text-sm text-muted">{found}</p>}
        <p className="text-xs leading-relaxed text-muted">Boxes every line of text that contains it, on all pages. Or drag on the page to draw a box by hand.</p>
      </Group>
      {pdf && (
        <Group
          title={`Boxes on page ${page + 1}`}
          actions={
            <Button onClick={undo} disabled={!history.length || busy} className="min-h-9">
              <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
              Undo
            </Button>
          }
        >
          {onPage.length ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-fg">
                {onPage.length} {onPage.length === 1 ? "box" : "boxes"}
              </span>
              <Button onClick={() => commit(boxes.filter((box) => box.page !== page))} disabled={busy}>
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                Clear this page
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">Walang kahon sa page na ito. Tap a box on the page to remove it.</p>
          )}
          {markedPages.length > 0 && (
            <p className="font-mono text-xs text-muted">
              Will be rasterized: page {pageList(markedPages)}
            </p>
          )}
          <Segmented
            label="Quality of redacted pages"
            value={dpi}
            onChange={setDpi}
            options={[
              { value: "150", label: "150 DPI" },
              { value: "200", label: "200 DPI" },
              { value: "300", label: "300 DPI" },
            ]}
          />
        </Group>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
          {error}
        </p>
      )}
      {busy && (
        <div role="progressbar" aria-label="Redacting" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)} className="h-2 overflow-hidden rounded-full bg-ink">
          <div className="h-full bg-lime transition-[width] motion-reduce:transition-none" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted">Document details (title, author), bookmarks and attachments are left out of the redacted file. Walang ina-upload.</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      {pdf && image ? (
        <>
          <PageNav index={page} count={pdf.pages} onChange={setPage} extra={markedPages.includes(page) ? " · will be rasterized" : ""} />
          <PageCanvas
            image={image}
            alt={`Page ${page + 1} of ${pdf.file.name}`}
            overlayProps={{ onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => setDraft(null), className: "absolute inset-0 touch-none cursor-crosshair" }}
          >
            <svg viewBox={`0 0 ${image.width} ${image.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
              {/* Redaction boxes are always black: that is what the file will contain. */}
              {onPage.map((box) => (
                <rect key={box.id} x={box.x} y={box.y} width={box.w} height={box.h} fill="#000000" />
              ))}
              {draft && <rect x={Math.min(draft.x, draft.x0)} y={Math.min(draft.y, draft.y0)} width={Math.abs(draft.x - draft.x0)} height={Math.abs(draft.y - draft.y0)} fill="#000000" opacity={0.6} />}
            </svg>
            {onPage.map((box) => (
              <button
                key={box.id}
                type="button"
                aria-label="Remove this box"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => commit(boxes.filter((entry) => entry.id !== box.id))}
                // 40 px touch target around a small visible handle at the box's top-right corner.
                className="group absolute flex size-10 items-center justify-center"
                style={{ left: `calc(${((box.x + box.w) / image.width) * 100}% - 20px)`, top: `calc(${(box.y / image.height) * 100}% - 20px)` }}
              >
                <span className="flex size-6 items-center justify-center rounded-full border border-line bg-panel text-muted group-hover:text-signal">
                  <X aria-hidden className="size-3.5" strokeWidth={2} />
                </span>
              </button>
            ))}
          </PageCanvas>
        </>
      ) : (
        <PdfPlaceholder icon={<SquareX aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} text={renderError || "Open a PDF to black out text for good. Nothing is uploaded."} />
      )}
    </div>
  );

  const actions = busy ? (
    <Button onClick={() => controller.current?.abort()}>
      <X aria-hidden className="size-4" strokeWidth={1.75} />
      Cancel
    </Button>
  ) : (
    <Button variant="primary" onClick={download} disabled={!pdf || !boxes.length}>
      <Download aria-hidden className="size-4" strokeWidth={2} />
      Download redacted PDF
    </Button>
  );
  return <EditorShell label="Redact PDF" form={form} preview={preview} actions={actions} previewLabel="Page" />;
}
