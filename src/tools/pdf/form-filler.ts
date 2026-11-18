/**
 * Tool 47: PDF Form Filler. Reads the fillable fields of a PDF (text,
 * checkboxes, dropdowns, lists, radio buttons), lets you type the answers next
 * to a preview of the page, and writes them back with pdf-lib, optionally
 * flattened. Nothing is saved: answers live in memory until the tab closes.
 * UI: components/stage/editors/form-filler-editor.tsx.
 */
import { PDF_MIME } from "@/lib/file-type";
import { fontSanitizer } from "@/lib/pdf-text";
import { loadPdf } from "@/lib/pdf-utils";
import { editorTool } from "../text/editor-tool";
import { KreaError } from "../types";

export const formFiller = editorTool(
  {
    id: 47,
    slug: "pdf-form-filler",
    name: "PDF Form Filler",
    verb: "Fill PDF form",
    description: "Type into a fillable PDF form, tick the boxes, and download it filled in, or locked.",
    seoTitle: "Fill out PDF forms online, free and without uploading",
    seoDescription:
      "Fill in fillable PDF forms in your browser: text boxes, checkboxes, dropdowns and radio buttons, with a preview of each field on the page. Optionally flatten it. No upload, no account.",
    howTo: [
      "Open a fillable PDF form, such as a government, school or HR form.",
      "Type the answers. Tap a field on the preview to jump to it.",
      "Download the filled PDF. Turn on Lock answers to flatten it, if the office asks for that.",
    ],
    faqs: [
      { q: "My PDF shows no fields. Why?", a: "It is not a fillable form: a scanned paper form, or a form made only of lines and boxes. Use PDF Annotator to type text anywhere on the page instead. Dynamic XFA forms, made with older Adobe tools, are not supported either." },
      { q: "Are my answers saved or uploaded?", a: "Neither. The form is filled inside your browser and your answers are kept only until you close the tab, so personal details like your TIN or address never leave your device." },
      { q: "What does Lock answers do?", a: "It flattens the form: your answers become part of the page and can no longer be changed. Many offices ask for this. Keep an unlocked copy if you may need to edit later." },
      { q: "Can I type ñ and other accents?", a: "Yes, Latin letters with accents work. Emoji and non-Latin scripts cannot be printed by the standard form font and are replaced with ?, and Krea tells you." },
      { q: "What about signature fields?", a: "They are left as they are. Use Sign PDF to place your signature on the page." },
    ],
    icon: "form",
  },
  "pdf",
);

export type FieldKind = "text" | "multiline" | "checkbox" | "dropdown" | "list" | "radio";
export type FieldValue = string | boolean | string[];

export interface FormFieldInfo {
  name: string;
  kind: FieldKind;
  value: FieldValue;
  options: string[];
  readOnly: boolean;
  /** Text fields only. */
  maxLength?: number;
  /** Dropdowns that also accept typed text. */
  editable?: boolean;
  /** Lists that allow more than one choice. */
  multiple?: boolean;
}

export interface ReadResult {
  fields: FormFieldInfo[];
  /** Signature and push-button fields, which are left untouched. */
  skipped: number;
}

/** List the fillable fields. Throws a KreaError for locked, damaged or field-less PDFs. */
export async function readForm(file: Blob, name: string): Promise<ReadResult> {
  const lib = await import("pdf-lib");
  const pdf = await loadPdf({ name, type: PDF_MIME, blob: file });
  let all;
  try {
    all = pdf.getForm().getFields();
  } catch {
    throw new KreaError("corrupted", `The form in "${name}" is damaged, so its fields cannot be read.`);
  }
  const fields: FormFieldInfo[] = [];
  let skipped = 0;
  for (const field of all) {
    const base = { name: field.getName(), readOnly: field.isReadOnly() };
    try {
      if (field instanceof lib.PDFTextField) {
        fields.push({ ...base, kind: field.isMultiline() ? "multiline" : "text", value: field.getText() ?? "", options: [], maxLength: field.getMaxLength() });
      } else if (field instanceof lib.PDFCheckBox) {
        fields.push({ ...base, kind: "checkbox", value: field.isChecked(), options: [] });
      } else if (field instanceof lib.PDFDropdown) {
        fields.push({ ...base, kind: "dropdown", value: field.getSelected()[0] ?? "", options: field.getOptions(), editable: field.isEditable() });
      } else if (field instanceof lib.PDFOptionList) {
        fields.push({ ...base, kind: "list", value: field.getSelected(), options: field.getOptions(), multiple: field.isMultiselect() });
      } else if (field instanceof lib.PDFRadioGroup) {
        fields.push({ ...base, kind: "radio", value: field.getSelected() ?? "", options: field.getOptions() });
      } else skipped++;
    } catch {
      // A malformed field is skipped rather than blocking the whole form.
      skipped++;
    }
  }
  if (!fields.length) {
    throw new KreaError(
      "unsupported",
      skipped
        ? "This form only has signature or button fields. Use Sign PDF to sign it."
        : "Walang fillable fields ang PDF na ito. It may be a scanned form: use PDF Annotator to type on the page instead.",
    );
  }
  return { fields, skipped };
}

/**
 * Automatic sizing (font size 0, or a size pdf-lib stored after auto-sizing,
 * such as 60) fills a multi-line box as if it held one line, so an address ends
 * up huge and cut off. Keep the form's size when every line fits; otherwise
 * shrink it so they do (not below 6 pt).
 */
function fitMultiline(field: import("pdf-lib").PDFTextField, text: string): void {
  const height = field.acroField.getWidgets()[0]?.getRectangle().height ?? 0;
  if (!height) return;
  const current = Number(/(\d+(?:\.\d+)?)\s+Tf/.exec(field.acroField.getDefaultAppearance() ?? "")?.[1] ?? 0);
  const fits = (height - 4) / (text.split("\n").length * 1.25);
  if (current > 0 && current <= fits) return;
  field.setFontSize(Math.max(6, Math.min(current || 12, 12, fits)));
}

export interface FillResult {
  bytes: Uint8Array;
  /** Characters the form font could not print, replaced with "?". */
  replaced: number;
  changed: number;
}

/** Write the answers (only fields whose value changed) and optionally flatten. */
export async function fillForm(file: Blob, name: string, original: FormFieldInfo[], values: Record<string, FieldValue>, flatten: boolean): Promise<FillResult> {
  const lib = await import("pdf-lib");
  const pdf = await loadPdf({ name, type: PDF_MIME, blob: file });
  const form = pdf.getForm();
  const font = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const { clean, state } = fontSanitizer(font);
  let changed = 0;
  for (const info of original) {
    if (info.readOnly || !(info.name in values)) continue;
    const value = values[info.name];
    if (JSON.stringify(value) === JSON.stringify(info.value)) continue;
    const label = `"${info.name}"`;
    try {
      if (info.kind === "text" || info.kind === "multiline") {
        let text = String(value)
          .split("\n")
          .map(clean)
          .join(info.kind === "multiline" ? "\n" : " ");
        if (info.maxLength !== undefined) text = text.slice(0, info.maxLength);
        const field = form.getTextField(info.name);
        field.setText(text || undefined);
        if (info.kind === "multiline" && text) fitMultiline(field, text);
      } else if (info.kind === "checkbox") {
        const box = form.getCheckBox(info.name);
        if (value) box.check();
        else box.uncheck();
      } else if (info.kind === "dropdown") {
        const dropdown = form.getDropdown(info.name);
        if (value === "") dropdown.clear();
        else dropdown.select(info.editable ? clean(String(value)) : String(value));
      } else if (info.kind === "list") {
        const list = form.getOptionList(info.name);
        const chosen = (value as string[]).filter((option) => info.options.includes(option));
        if (chosen.length) list.select(info.multiple ? chosen : chosen.slice(0, 1));
        else list.clear();
      } else if (info.kind === "radio") {
        const group = form.getRadioGroup(info.name);
        if (value === "") group.clear();
        else group.select(String(value));
      }
      changed++;
    } catch {
      throw new KreaError("failed", `Field ${label} could not take that answer. Check the value and try again.`);
    }
  }
  try {
    // Redraw every field with a font we know, so viewers that ignore form data still show the answers.
    form.updateFieldAppearances(font);
    if (flatten) form.flatten({ updateFieldAppearances: false });
  } catch {
    throw new KreaError("failed", "Hindi ma-redraw ang mga sagot sa form na ito. Try without Lock answers, or use PDF Annotator.");
  }
  return { bytes: await pdf.save(), replaced: state.replaced, changed };
}
