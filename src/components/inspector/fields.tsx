"use client";

/**
 * Renders a tool's declarative settings schema (OptionField[]) as form
 * controls. Tools never ship their own settings UI; they only describe fields.
 */
import { ImagePlus, X } from "lucide-react";
import { useId } from "react";
import type { OptionField, OptionValue, OptionValues, Tool } from "@/tools/types";
import { PagePicker } from "./page-picker";
import { SignaturePad } from "./signature-pad";

interface FieldsProps {
  tool: Tool;
  values: OptionValues;
  /** Page count of the first PDF on the Stage, for page pickers. */
  pageCount?: number;
  /**
   * Chain steps are edited without the Stage, so fields that need it (crop box,
   * signature placement, page thumbnails) and presets are left out.
   */
  compact?: boolean;
  onChange: (patch: OptionValues) => void;
}

const inputClass =
  "min-h-10 w-full rounded-md border border-line bg-ink px-3 font-mono text-sm text-fg placeholder:text-muted/70 hover:border-muted";

/** Largest logo we keep in settings (as a data URL). Bigger files are refused with a message. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function Fields({ tool, values, pageCount, compact = false, onChange }: FieldsProps) {
  const stageOnly = (field: OptionField) => field.type === "crop" || field.type === "placement" || field.type === "pageGrid";
  return (
    <div className="flex flex-col gap-5">
      {tool.presets && !compact && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted">Presets</p>
          <div className="flex flex-wrap gap-2">
            {tool.presets.map((preset) => {
              const active = Object.entries(preset.values).every(([key, value]) => values[key] === value);
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.hint}
                  aria-pressed={active}
                  onClick={() => onChange(preset.values)}
                  className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${
                    active ? "border-accent bg-lime text-on-lime" : "border-line text-fg hover:border-accent"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {tool.fields
        .filter((field) => (!field.showIf || field.showIf(values)) && !(compact && stageOnly(field)))
        .map((field) => (
          <Field
            key={field.key}
            field={field}
            value={values[field.key]}
            pageCount={pageCount}
            onChange={(value) => onChange({ [field.key]: value })}
            onReset={() =>
              onChange(
                field.type === "pageGrid"
                  ? { [field.key]: "" }
                  : field.type === "placement"
                    ? { [`${field.key}X`]: 0.55, [`${field.key}Y`]: 0.8, [`${field.key}W`]: 0.35, [`${field.key}H`]: 0.1 }
                    : { [`${field.key}X`]: 0, [`${field.key}Y`]: 0, [`${field.key}W`]: 1, [`${field.key}H`]: 1 },
              )
            }
          />
        ))}
    </div>
  );
}

interface FieldProps {
  field: OptionField;
  value: OptionValue;
  pageCount?: number;
  onChange: (value: OptionValue) => void;
  onReset: () => void;
}

function Field({ field, value, pageCount, onChange, onReset }: FieldProps) {
  const id = useId();
  const hintId = field.hint ? `${id}-hint` : undefined;
  const hint = field.hint && (
    <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-muted">
      {field.hint}
    </p>
  );
  const label = (
    <label htmlFor={id} className="mb-1.5 block text-sm text-fg">
      {field.label}
    </label>
  );

  switch (field.type) {
    case "slider":
      return (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={id} className="text-sm text-fg">
              {field.label}
            </label>
            <output htmlFor={id} className="font-mono text-sm text-accent">
              {String(value)}
              {field.unit}
            </output>
          </div>
          <input
            id={id}
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value)}
            aria-describedby={hintId}
            onChange={(event) => onChange(Number(event.target.value))}
            className="h-10 w-full"
          />
          {hint}
        </div>
      );

    case "number":
      return (
        <div>
          {label}
          <div className="relative">
            <input
              id={id}
              type="number"
              inputMode="decimal"
              min={field.min}
              max={field.max ?? (field.key === "page" ? pageCount : undefined)}
              step={field.step}
              value={Number.isFinite(value) ? Number(value) : ""}
              aria-describedby={hintId}
              onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
              className={`${inputClass} ${field.unit ? "pr-12" : ""}`}
            />
            {field.unit && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                {field.unit}
              </span>
            )}
          </div>
          {hint}
        </div>
      );

    case "select":
      // Up to three short choices read better as a segmented control.
      if (field.options.length <= 3 && field.options.every((option) => option.label.length <= 16)) {
        return (
          <fieldset aria-describedby={hintId}>
            <legend className="mb-1.5 text-sm text-fg">{field.label}</legend>
            <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-line bg-ink p-1">
              {field.options.map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-9 cursor-pointer items-center justify-center rounded px-2 text-center text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                    value === option.value ? "bg-raised text-accent" : "text-muted hover:text-fg"
                  }`}
                >
                  <input
                    type="radio"
                    name={id}
                    value={option.value}
                    checked={value === option.value}
                    onChange={() => onChange(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {hint}
          </fieldset>
        );
      }
      return (
        <div>
          {label}
          <select
            id={id}
            value={String(value)}
            aria-describedby={hintId}
            onChange={(event) => onChange(event.target.value)}
            className={`${inputClass} font-sans`}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {hint}
        </div>
      );

    case "toggle":
      return (
        <div className="flex items-center justify-between gap-3">
          <span id={`${id}-label`} className="text-sm text-fg">
            {field.label}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            aria-labelledby={`${id}-label`}
            onClick={() => onChange(!value)}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
              value ? "border-accent bg-lime" : "border-line bg-ink"
            }`}
          >
            <span
              className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-all ${
                value ? "left-6 bg-on-lime" : "left-0.5 bg-muted"
              }`}
            />
          </button>
        </div>
      );

    case "color":
      return (
        <div>
          {label}
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              value={String(value)}
              aria-describedby={hintId}
              onChange={(event) => onChange(event.target.value)}
              className="size-10 shrink-0 rounded-md border border-line bg-ink p-1"
            />
            <span className="font-mono text-sm uppercase text-muted">{String(value)}</span>
          </div>
          {hint}
        </div>
      );

    case "text":
      return (
        <div>
          {label}
          <input
            id={id}
            type={field.secret ? "password" : "text"}
            autoComplete={field.secret ? "new-password" : "off"}
            value={String(value)}
            placeholder={field.placeholder}
            aria-describedby={hintId}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
          {hint}
        </div>
      );

    case "pages":
      return (
        <div>
          {label}
          <PagePicker id={id} value={String(value)} pageCount={pageCount} hintId={hintId} onChange={onChange} />
          {hint}
        </div>
      );

    case "image":
      return (
        <div>
          <span className="mb-1.5 block text-sm text-fg">{field.label}</span>
          {value ? (
            <div className="flex items-center gap-3 rounded-md border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={String(value)} alt="Selected logo" className="checkerboard size-14 rounded object-contain" />
              <span className="flex-1 text-sm text-muted">Logo loaded</span>
              <button
                type="button"
                aria-label="Remove logo"
                onClick={() => onChange("")}
                className="flex size-9 items-center justify-center rounded text-muted hover:text-signal"
              >
                <X aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm text-fg hover:border-accent has-focus-visible:outline-2 has-focus-visible:outline-accent">
              <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
              Choose image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-describedby={hintId}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file || file.size > MAX_IMAGE_BYTES) {
                    if (file) window.alert("That image is over 3 MB. Gumamit ng mas maliit na logo.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => onChange(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          )}
          {hint}
        </div>
      );

    case "signature":
      return (
        <div>
          <span className="mb-1.5 block text-sm text-fg">{field.label}</span>
          <SignaturePad value={String(value ?? "")} onChange={onChange} />
          {hint}
        </div>
      );

    case "crop":
    case "placement":
    case "pageGrid":
      // The control itself is drawn on the Stage; the inspector carries its hint and reset.
      return (
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg">{field.label}</span>
            <button type="button" onClick={onReset} className="min-h-9 rounded px-2 text-sm text-muted underline hover:text-accent">
              Reset
            </button>
          </div>
          {hint}
        </div>
      );
  }
}
