"use client";

import { ClipboardPen, Download, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { renameFile } from "@/lib/file-type";
import { pdfBlob } from "@/lib/pdf-utils";
import { useSession } from "@/lib/session";
import { fillForm, readForm, type FieldValue, type FormFieldInfo } from "@/tools/pdf/form-filler";
import { Group } from "./form";
import { EditorShell } from "./editor-shell";
import { PageCanvas, PageNav, PdfPicker, PdfPlaceholder, usePageImage, usePdfFile } from "./pdf-shared";

interface Spot {
  page: number;
  /** Normalized to the page as seen: left, top, width, height (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
}
interface FieldView extends FormFieldInfo {
  label: string;
  spots: Spot[];
}

/** Pages scanned for field positions and labels; past this, fields still work, just without a preview spot. */
const MAX_SCAN_PAGES = 200;
const control = "min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted disabled:opacity-60";
const fieldId = (index: number) => `form-field-${index}`;

/** "first_name" or "Text12" style names into something readable. */
const humanize = (name: string) =>
  name
    .split(".")
    .pop()!
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim() || name;

export default function FormFillerEditor() {
  // Nothing is saved: answers stay in memory until the tab closes (they are often personal data).
  const [fields, setFields] = useState<FieldView[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [skipped, setSkipped] = useState(0);
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [lock, setLock] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [readError, setReadError] = useState("");
  const { setNotice } = useSession();

  const source = usePdfFile(async (loaded) => {
    setFields([]);
    setValues({});
    setPage(0);
    setActive(null);
    setSaveError("");
    setReadError("");
    setReading(true);
    try {
      const { fields: found, skipped: other } = await readForm(loaded.file, loaded.file.name);
      // Positions and tooltips come from pdf.js, which knows where each widget sits on the page as seen.
      const spots = new Map<string, Spot[]>();
      const labels = new Map<string, string>();
      for (let i = 0; i < Math.min(loaded.pages, MAX_SCAN_PAGES); i++) {
        const pdfPage = await loaded.doc.getPage(i + 1);
        const viewport = pdfPage.getViewport({ scale: 1 });
        for (const annotation of await pdfPage.getAnnotations()) {
          if (annotation.subtype !== "Widget" || !annotation.fieldName) continue;
          // Two opposite corners into page-as-seen pixels (this handles /Rotate and the CropBox offset).
          const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]) as number[];
          const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]) as number[];
          const spot = { page: i, x: Math.min(x1, x2) / viewport.width, y: Math.min(y1, y2) / viewport.height, w: Math.abs(x2 - x1) / viewport.width, h: Math.abs(y2 - y1) / viewport.height };
          spots.set(annotation.fieldName, [...(spots.get(annotation.fieldName) ?? []), spot]);
          if (annotation.alternativeText && !labels.has(annotation.fieldName)) labels.set(annotation.fieldName, annotation.alternativeText);
        }
        pdfPage.cleanup();
      }
      const views = found.map((field) => ({ ...field, label: labels.get(field.name) ?? humanize(field.name), spots: spots.get(field.name) ?? [] }));
      // Page order, then top to bottom, so the list reads like the form.
      views.sort((a, b) => (a.spots[0]?.page ?? 1e9) - (b.spots[0]?.page ?? 1e9) || (a.spots[0]?.y ?? 0) - (b.spots[0]?.y ?? 0) || (a.spots[0]?.x ?? 0) - (b.spots[0]?.x ?? 0));
      setFields(views);
      setValues(Object.fromEntries(found.map((field) => [field.name, field.value])));
      setSkipped(other);
      if (views[0]?.spots[0]) setPage(views[0].spots[0].page);
    } catch (failure) {
      setReadError(failure instanceof Error && failure.message ? failure.message : "Hindi mabasa ang form.");
    } finally {
      setReading(false);
    }
  });
  const pdf = source.pdf;
  const { image, error: renderError } = usePageImage(pdf?.doc ?? null, page);

  const original = useMemo(() => Object.fromEntries(fields.map((field) => [field.name, field.value])), [fields]);
  const changedCount = fields.filter((field) => JSON.stringify(values[field.name]) !== JSON.stringify(original[field.name])).length;
  const set = (name: string, value: FieldValue) => setValues((current) => ({ ...current, [name]: value }));

  /** Mark a field as the one being edited and show its page. */
  const activate = (name: string) => {
    setActive(name);
    const spot = fields.find((field) => field.name === name)?.spots[0];
    if (spot) setPage(spot.page);
  };
  const focusField = (name: string) => {
    const index = fields.findIndex((field) => field.name === name);
    if (index < 0) return;
    activate(name);
    document.getElementById(fieldId(index))?.focus();
  };

  const download = async () => {
    if (!pdf) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await fillForm(pdf.file, pdf.file.name, fields, values, lock);
      downloadBlob(pdfBlob(result.bytes), renameFile(pdf.file.name, "pdf", lock ? "-filled-locked" : "-filled"));
      setNotice(result.replaced ? `Na-save. ${result.replaced} character${result.replaced === 1 ? "" : "s"} the form font cannot print became "?".` : "Na-save ang filled form.");
    } catch (failure) {
      setSaveError(failure instanceof Error && failure.message ? failure.message : "Hindi ma-save ang form.");
    } finally {
      setSaving(false);
    }
  };

  const renderControl = (field: FieldView, index: number) => {
    const id = fieldId(index);
    const value = values[field.name];
    const common = { id, disabled: field.readOnly, onFocus: () => activate(field.name) };
    const label = (
      <label htmlFor={id} className="mb-1.5 block text-sm text-fg">
        {field.label}
        {field.readOnly && <span className="text-muted"> (read-only)</span>}
      </label>
    );
    if (field.kind === "checkbox") {
      return (
        <label key={field.name} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-fg">
          <input type="checkbox" {...common} checked={Boolean(value)} onChange={(event) => set(field.name, event.target.checked)} className="size-5 accent-(--accent)" />
          {field.label}
          {field.readOnly && <span className="text-muted">(read-only)</span>}
        </label>
      );
    }
    if (field.kind === "radio" || (field.kind === "dropdown" && !field.editable)) {
      return (
        <div key={field.name}>
          {label}
          <select {...common} value={String(value)} onChange={(event) => set(field.name, event.target.value)} className={control}>
            <option value="">(none)</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (field.kind === "dropdown") {
      const listId = `${id}-options`;
      return (
        <div key={field.name}>
          {label}
          <input {...common} list={listId} value={String(value)} onChange={(event) => set(field.name, event.target.value)} className={control} />
          <datalist id={listId}>
            {field.options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      );
    }
    if (field.kind === "list") {
      const chosen = value as string[];
      return (
        <div key={field.name}>
          {label}
          <select
            {...common}
            multiple={field.multiple}
            value={field.multiple ? chosen : (chosen[0] ?? "")}
            onChange={(event) => set(field.name, [...event.target.selectedOptions].map((option) => option.value))}
            className={`${control} ${field.multiple ? "py-1" : ""}`}
          >
            {!field.multiple && <option value="">(none)</option>}
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }
    const length = String(value).length;
    return (
      <div key={field.name}>
        {label}
        {field.kind === "multiline" ? (
          <textarea {...common} rows={3} value={String(value)} maxLength={field.maxLength} onChange={(event) => set(field.name, event.target.value)} className={`${control} resize-y py-2 leading-relaxed`} />
        ) : (
          <input {...common} type="text" value={String(value)} maxLength={field.maxLength} onChange={(event) => set(field.name, event.target.value)} className={control} autoComplete="off" />
        )}
        {field.maxLength !== undefined && <p className="mt-1 font-mono text-xs text-muted">{length} / {field.maxLength}</p>}
      </div>
    );
  };

  const byPage = new Map<number, { field: FieldView; index: number }[]>();
  fields.forEach((field, index) => {
    const key = field.spots[0]?.page ?? -1;
    byPage.set(key, [...(byPage.get(key) ?? []), { field, index }]);
  });

  const form = (
    <>
      <PdfPicker state={source} busy={reading || saving}>
        {reading && <p className="text-sm text-muted">Reading the form fields…</p>}
        {readError && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            {readError}
          </p>
        )}
        {fields.length > 0 && (
          <p className="font-mono text-xs text-muted">
            {fields.length} {fields.length === 1 ? "field" : "fields"}
            {skipped ? `, ${skipped} signature or button ${skipped === 1 ? "field" : "fields"} left as is` : ""}
          </p>
        )}
      </PdfPicker>
      {[...byPage.entries()].map(([pageIndex, entries]) => (
        <Group key={pageIndex} title={pageIndex < 0 ? "Other fields" : `Page ${pageIndex + 1}`}>
          {entries.map(({ field, index }) => renderControl(field, index))}
        </Group>
      ))}
      {fields.length > 0 && (
        <Group title="Download">
          <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm text-fg">
            <input type="checkbox" checked={lock} onChange={(event) => setLock(event.target.checked)} className="mt-0.5 size-5 accent-(--accent)" />
            <span>
              Lock answers (flatten)
              <span className="block text-xs leading-relaxed text-muted">The answers become part of the page and can no longer be edited. Keep an unlocked copy too.</span>
            </span>
          </label>
          {saveError && (
            <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
              {saveError}
            </p>
          )}
        </Group>
      )}
      <p className="text-xs leading-relaxed text-muted">Hindi sine-save o ina-upload ang mga sagot mo. They stay in this tab until you close it.</p>
    </>
  );

  const spotsHere = fields.flatMap((field) => field.spots.filter((spot) => spot.page === page).map((spot) => ({ field, spot })));
  const preview = (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      {pdf && image ? (
        <>
          <PageNav index={page} count={pdf.pages} onChange={setPage} />
          <PageCanvas image={image} alt={`Page ${page + 1} of ${pdf.file.name}`}>
            {spotsHere.map(({ field, spot }, i) => (
              <button
                key={`${field.name}-${i}`}
                type="button"
                aria-label={`Go to field ${field.label}`}
                onClick={() => focusField(field.name)}
                className={`absolute rounded-sm border-2 ${active === field.name ? "border-accent bg-lime/25" : "border-accent/50 hover:bg-lime/15"}`}
                style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.w * 100}%`, height: `${spot.h * 100}%` }}
              />
            ))}
          </PageCanvas>
          <p className="text-xs text-muted">The preview shows the original page. Tap a box to jump to its field.</p>
        </>
      ) : (
        <PdfPlaceholder icon={<ClipboardPen aria-hidden className="size-6 text-muted" strokeWidth={1.5} />} text={renderError || "Open a fillable PDF form. Nothing is uploaded."} />
      )}
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={download} disabled={!pdf || !fields.length || saving}>
        <Download aria-hidden className="size-4" strokeWidth={2} />
        {saving ? "Saving…" : "Download filled PDF"}
      </Button>
      <Button onClick={() => setValues(original)} disabled={!changedCount || saving}>
        <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
        Reset answers
      </Button>
    </>
  );
  return <EditorShell label="PDF form filler" form={form} preview={preview} actions={actions} previewLabel="Page" />;
}
