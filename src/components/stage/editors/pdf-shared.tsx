"use client";

/**
 * Building blocks shared by the PDF editors (Form Filler, Annotator, Redact PDF):
 * opening a PDF with pdf.js (locked and damaged files get a clear message),
 * rendering one page as an image sized to the screen, page navigation, and an
 * overlay that uses coordinates normalized to the page as seen (0..1, rotation
 * applied). Object URLs and pdf.js documents are released when replaced or when
 * the editor closes.
 */
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { detectFileType, formatBytes, MAX_FILE_BYTES, PDF_MIME } from "@/lib/file-type";
import { openPdf, renderPage } from "@/lib/pdf-render";
import { Group } from "./form";

export interface LoadedPdf {
  file: File;
  doc: PDFDocumentProxy;
  pages: number;
}

/** Open and keep one PDF; closes the previous one. `onOpened` runs after a successful open. */
export function usePdfFile(onOpened?: (pdf: LoadedPdf) => void) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<{ close: () => Promise<void> } | null>(null);
  useEffect(() => () => void current.current?.close(), []);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_FILE_BYTES) {
      setError(`Masyadong malaki ang PDF (${formatBytes(file.size)}). Krea opens up to ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    setOpening(true);
    try {
      const detected = await detectFileType(file, file.name);
      if (detected.kind !== "pdf") {
        setError("Hindi PDF ang file na ito. Choose a .pdf file.");
        return;
      }
      const opened = await openPdf({ name: file.name, type: PDF_MIME, blob: file });
      await current.current?.close();
      current.current = opened;
      const loaded = { file, doc: opened.pdf, pages: opened.pdf.numPages };
      setPdf(loaded);
      onOpened?.(loaded);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Hindi mabuksan ang PDF. It may be damaged.");
    } finally {
      setOpening(false);
    }
  };
  return { pdf, opening, error, setError, open };
}

export function PdfPicker({ state, busy, children }: { state: ReturnType<typeof usePdfFile>; busy: boolean; children?: ReactNode }) {
  const { pdf, opening, error, open } = state;
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <Group title="PDF">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          open(event.dataTransfer.files[0]);
        }}
        className={`rounded-lg border border-dashed p-4 text-center ${dragging ? "border-accent bg-raised" : "border-line"}`}
      >
        <p className="break-all text-sm text-fg">{pdf ? pdf.file.name : "I-drop o pumili ng PDF."}</p>
        {pdf && (
          <p className="mt-1 font-mono text-xs text-muted">
            {pdf.pages} {pdf.pages === 1 ? "page" : "pages"} · {formatBytes(pdf.file.size)}
          </p>
        )}
        <Button className="mt-3" variant={pdf ? "outline" : "primary"} onClick={() => input.current?.click()} disabled={opening || busy}>
          <FileText aria-hidden className="size-4" strokeWidth={1.75} />
          {opening ? "Opening…" : pdf ? "Open another PDF" : "Choose a PDF"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            open(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
          {error}
        </p>
      )}
      {children}
    </Group>
  );
}

export interface PageImage {
  url: string;
  /** Page size as seen (rotation applied), in PDF points. */
  width: number;
  height: number;
  rotation: number;
}

/** Render one page (zero-based) for the screen. Re-renders when the page changes; frees the old image. */
export function usePageImage(doc: PDFDocumentProxy | null, index: number, targetWidth = 1100) {
  const [image, setImage] = useState<PageImage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let url = "";
    (async () => {
      try {
        const page = await doc.getPage(index + 1);
        const { width, height } = page.getViewport({ scale: 1 });
        const rotation = page.rotate;
        page.cleanup();
        const rendered = await renderPage(doc, index, Math.min(3, targetWidth / width), "image/png");
        if (cancelled) return;
        url = URL.createObjectURL(rendered.blob);
        setImage({ url, width, height, rotation });
        setError("");
      } catch {
        if (!cancelled) setError(`Hindi ma-render ang page ${index + 1}.`);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, index, targetWidth]);
  return { image: image, error };
}

export function PageNav({ index, count, onChange, extra }: { index: number; count: number; onChange: (index: number) => void; extra?: ReactNode }) {
  if (count <= 1 && !extra) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <Button icon aria-label="Previous page" disabled={index === 0} onClick={() => onChange(index - 1)}>
        <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
      </Button>
      <p className="font-mono text-xs text-muted" aria-live="polite">
        Page {index + 1} of {count}
        {extra}
      </p>
      <Button icon aria-label="Next page" disabled={index >= count - 1} onClick={() => onChange(index + 1)}>
        <ChevronRight aria-hidden className="size-4" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

/**
 * The page image with an overlay of the same size. The wrapper shrink-wraps the
 * image (no letterboxing), so normalized overlay coordinates line up exactly.
 */
export function PageCanvas({ image, alt, children, overlayProps }: { image: PageImage; alt: string; children?: ReactNode; overlayProps?: React.HTMLAttributes<HTMLDivElement> }) {
  return (
    <div className="flex justify-center">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not an optimisable asset */}
        <img src={image.url} alt={alt} draggable={false} className="block h-auto bg-paper max-h-[70vh] w-auto max-w-full select-none rounded-sm shadow" />
        <div className="absolute inset-0" {...overlayProps}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Pointer position inside an element, normalized to 0..1 and clamped. */
export function normalizedPoint(event: { clientX: number; clientY: number }, element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
}

export function PdfPlaceholder({ icon, text = "Open a PDF to start. Nothing is uploaded." }: { icon: ReactNode; text?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-line p-6 text-center">
      {icon}
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
