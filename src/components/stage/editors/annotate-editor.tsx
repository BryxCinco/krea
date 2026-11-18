"use client";

import { Download, Highlighter, PenLine, RectangleHorizontal, Trash2, Type, Undo2 } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { renameFile } from "@/lib/file-type";
import { pdfBlob } from "@/lib/pdf-utils";
import { useSession } from "@/lib/session";
import { applyAnnotations, HIGHLIGHT_COLORS, INK_COLORS, TEXT_ASCENT, TEXT_LINE_HEIGHT, type Annotation, type AnnotationKind } from "@/tools/pdf/annotate";
import { Group, Segmented } from "./form";
import { EditorShell } from "./editor-shell";
import { normalizedPoint, PageCanvas, PageNav, PdfPicker, PdfPlaceholder, usePageImage, usePdfFile } from "./pdf-shared";

const TOOLS: { value: AnnotationKind; label: string; icon: typeof Type }[] = [
  { value: "text", label: "Text", icon: Type },
  { value: "highlight", label: "Highlight", icon: Highlighter },
  { value: "box", label: "Box", icon: RectangleHorizontal },
  { value: "pen", label: "Pen", icon: PenLine },
];
const KIND_LABEL: Record<AnnotationKind, string> = { text: "Text", highlight: "Highlight", box: "Box", pen: "Drawing" };
type Draft = { kind: "rect"; x0: number; y0: number; x: number; y: number } | { kind: "pen"; points: [number, number][] };

export default function AnnotateEditor() {
  // Nothing is saved: the PDF and the marks stay in memory until the tab closes.
  const [marks, setMarks] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [tool, setTool] = useState<AnnotationKind>("text");
  const [text, setText] = useState("");
  const [textSize, setTextSize] = useState(11);
  const [ink, setInk] = useState(INK_COLORS[0]);
  const [marker, setMarker] = useState(HIGHLIGHT_COLORS[0]);
  const [width, setWidth] = useState(2);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const nextId = useRef(1);
  const { setNotice } = useSession();

  const source = usePdfFile(() => {
    setMarks([]);
    setHistory([]);
    setPage(0);
    setSaveError("");
  });
  const pdf = source.pdf;
  const { image, error: renderError } = usePageImage(pdf?.doc ?? null, page);

  const commit = (next: Annotation[]) => {
    setHistory((stack) => [...stack.slice(-49), marks]);
    setMarks(next);
  };
  const undo = () => {
    if (!history.length) return;
    setMarks(history[history.length - 1]);
    setHistory((stack) => stack.slice(0, -1));
  };

  // Pointer positions in points of the page as seen.
  const pointAt = (event: PointerEvent<HTMLDivElement>): [number, number] => {
    const { x, y } = normalizedPoint(event, event.currentTarget);
    return [x * (image?.width ?? 0), y * (image?.height ?? 0)];
  };
  const base = () => ({ id: nextId.current++, page, pageW: image!.width, pageH: image!.height });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || event.button > 0) return;
    const [x, y] = pointAt(event);
    if (tool === "text") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft(tool === "pen" ? { kind: "pen", points: [[x, y]] } : { kind: "rect", x0: x, y0: y, x, y });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    const [x, y] = pointAt(event);
    setDraft(draft.kind === "pen" ? { kind: "pen", points: [...draft.points, [x, y]] } : { ...draft, x, y });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!image) return;
    const [x, y] = pointAt(event);
    if (tool === "text") {
      if (!text.trim()) {
        setNotice("I-type muna ang text sa kaliwa, then tap where it goes.");
        return;
      }
      commit([...marks, { ...base(), kind: "text", x, y: Math.max(0, y - textSize * TEXT_ASCENT), text, size: textSize, color: ink }]);
      return;
    }
    if (!draft) return;
    if (draft.kind === "pen") {
      commit([...marks, { ...base(), kind: "pen", points: draft.points, width, color: ink }]);
    } else {
      const w = Math.abs(draft.x - draft.x0);
      const h = Math.abs(draft.y - draft.y0);
      // A tap is not a box.
      if (w >= 3 && h >= 3) {
        const kind = tool === "highlight" ? "highlight" : "box";
        commit([...marks, { ...base(), kind, x: Math.min(draft.x, draft.x0), y: Math.min(draft.y, draft.y0), w, h, width, color: kind === "highlight" ? marker : ink }]);
      }
    }
    setDraft(null);
  };

  const download = async () => {
    if (!pdf) return;
    setSaving(true);
    setSaveError("");
    try {
      const { bytes, replaced } = await applyAnnotations(pdf.file, pdf.file.name, marks);
      downloadBlob(pdfBlob(bytes), renameFile(pdf.file.name, "pdf", "-annotated"));
      setNotice(replaced ? `Na-save. ${replaced} character${replaced === 1 ? "" : "s"} the PDF font cannot print became "?".` : "Na-save ang annotated PDF.");
    } catch (failure) {
      setSaveError(failure instanceof Error && failure.message ? failure.message : "Hindi ma-save ang PDF.");
    } finally {
      setSaving(false);
    }
  };

  const onPage = marks.filter((mark) => mark.page === page);
  const swatches = (colors: string[], value: string, set: (color: string) => void, label: string) => (
    <fieldset>
      <legend className="mb-1.5 text-sm text-fg">{label}</legend>
      <div className="flex gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${color}`}
            aria-pressed={value === color}
            onClick={() => set(color)}
            className={`size-10 rounded-full border-2 ${value === color ? "border-accent" : "border-line"}`}
            // The swatch shows ink that goes into the document, not a theme colour.
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </fieldset>
  );

  const form = (
    <>
      <PdfPicker state={source} busy={saving} />
      <Group title="Tool">
        <Segmented label="Mark" value={tool} onChange={setTool} options={TOOLS.map(({ value, label }) => ({ value, label }))} />
        {tool === "text" && (
          <>
            <div>
              <label htmlFor="annotate-text" className="mb-1.5 block text-sm text-fg">
                Text to place
              </label>
              <textarea
                id="annotate-text"
                rows={2}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type, then tap the page where it goes"
                className="min-h-10 w-full resize-y rounded-md border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-muted/70 hover:border-muted"
              />
            </div>
            <div>
              <label htmlFor="annotate-size" className="mb-1.5 flex justify-between text-sm text-fg">
                Text size <span className="font-mono text-xs text-muted">{textSize} pt</span>
              </label>
              <input id="annotate-size" type="range" min={6} max={36} step={1} value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} className="w-full accent-lime" />
            </div>
          </>
        )}
        {(tool === "box" || tool === "pen") && (
          <div>
            <label htmlFor="annotate-width" className="mb-1.5 flex justify-between text-sm text-fg">
              Line width <span className="font-mono text-xs text-muted">{width} pt</span>
            </label>
            <input id="annotate-width" type="range" min={1} max={8} step={0.5} value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-full accent-lime" />
          </div>
        )}
        {tool === "highlight" ? swatches(HIGHLIGHT_COLORS, marker, setMarker, "Highlight colour") : swatches(INK_COLORS, ink, setInk, "Ink colour")}
        <p className="text-xs leading-relaxed text-muted">{tool === "text" ? "Tap the page to place the text there." : "Drag on the page."}</p>
      </Group>
      {pdf && (
        <Group
          title={`Marks on page ${page + 1}`}
          actions={
            <Button onClick={undo} disabled={!history.length} className="min-h-9">
              <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
              Undo
            </Button>
          }
        >
          {onPage.length ? (
            <ul className="flex flex-col gap-1">
              {onPage.map((mark) => (
                <li key={mark.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-fg">
                    {KIND_LABEL[mark.kind]}
                    {mark.kind === "text" && <span className="text-muted">: {mark.text}</span>}
                  </span>
                  <Button icon aria-label={`Remove ${KIND_LABEL[mark.kind].toLowerCase()}`} onClick={() => commit(marks.filter((entry) => entry.id !== mark.id))}>
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Wala pang marka sa page na ito.</p>
          )}
          {marks.length > onPage.length && <p className="font-mono text-xs text-muted">{marks.length} marks in total</p>}
        </Group>
      )}
      {saveError && (
        <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
          {saveError}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted">Marks are drawn into the page, so they look the same in every app. Walang ina-upload.</p>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      {pdf && image ? (
        <>
          <PageNav index={page} count={pdf.pages} onChange={setPage} />
          <PageCanvas
            image={image}
            alt={`Page ${page + 1} of ${pdf.file.name}`}
            overlayProps={{
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel: () => setDraft(null),
              className: `absolute inset-0 touch-none ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`,
            }}
          >
            <svg viewBox={`0 0 ${image.width} ${image.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
              {onPage.map((mark) => {
                if (mark.kind === "text") {
                  return (
                    <text key={mark.id} x={mark.x} y={mark.y} fill={mark.color} fontSize={mark.size} fontFamily="Helvetica, Arial, sans-serif">
                      {mark.text.split("\n").map((line, i) => (
                        <tspan key={i} x={mark.x} y={mark.y + (TEXT_ASCENT + i * TEXT_LINE_HEIGHT) * mark.size}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  );
                }
                if (mark.kind === "pen") {
                  return <polyline key={mark.id} points={mark.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={mark.color} strokeWidth={mark.width} strokeLinecap="round" strokeLinejoin="round" />;
                }
                return mark.kind === "highlight" ? (
                  <rect key={mark.id} x={mark.x} y={mark.y} width={mark.w} height={mark.h} fill={mark.color} opacity={0.4} style={{ mixBlendMode: "multiply" }} />
                ) : (
                  <rect key={mark.id} x={mark.x} y={mark.y} width={mark.w} height={mark.h} fill="none" stroke={mark.color} strokeWidth={mark.width} />
                );
              })}
              {draft?.kind === "pen" && <polyline points={draft.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={ink} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />}
              {draft?.kind === "rect" && (
                <rect
                  x={Math.min(draft.x, draft.x0)}
                  y={Math.min(draft.y, draft.y0)}
                  width={Math.abs(draft.x - draft.x0)}
                  height={Math.abs(draft.y - draft.y0)}
                  fill={tool === "highlight" ? marker : "none"}
                  opacity={tool === "highlight" ? 0.4 : 1}
                  stroke={tool === "highlight" ? "none" : ink}
                  strokeWidth={width}
                  strokeDasharray={tool === "highlight" ? undefined : "4 3"}
                />
              )}
            </svg>
          </PageCanvas>
        </>
      ) : (
        <PdfPlaceholder icon={<Highlighter aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} text={renderError || "Open a PDF to type, highlight or draw on it. Nothing is uploaded."} />
      )}
    </div>
  );

  const actions = (
    <Button variant="primary" onClick={download} disabled={!pdf || !marks.length || saving}>
      <Download aria-hidden className="size-4" strokeWidth={2} />
      {saving ? "Saving…" : "Download annotated PDF"}
    </Button>
  );
  return <EditorShell label="PDF annotator" form={form} preview={preview} actions={actions} previewLabel="Page" />;
}
