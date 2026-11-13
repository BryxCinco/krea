"use client";

/**
 * Renders a tool's declarative settings schema (OptionField[]) as form
 * controls. Tools never ship their own settings UI; they only describe fields.
 */
import { useId } from "react";
import type { OptionField, OptionValue, OptionValues, Tool } from "@/tools/types";
import { PagePicker } from "./page-picker";

interface FieldsProps {
  tool: Tool;
  values: OptionValues;
  /** Page count of the first PDF on the Stage, for page pickers. */
  pageCount?: number;
  onChange: (patch: OptionValues) => void;
}

const inputClass =
  "min-h-10 w-full rounded-md border border-line bg-ink px-3 font-mono text-sm text-fg placeholder:text-muted/70 hover:border-muted";

export function Fields({ tool, values, pageCount, onChange }: FieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      {tool.presets && (
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
                    active ? "border-lime bg-lime text-ink" : "border-line text-fg hover:border-lime"
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
        .filter((field) => !field.showIf || field.showIf(values))
        .map((field) => (
          <Field
            key={field.key}
            field={field}
            value={values[field.key]}
            pageCount={pageCount}
            onChange={(value) => onChange({ [field.key]: value })}
            onReset={() =>
              onChange({ [`${field.key}X`]: 0, [`${field.key}Y`]: 0, [`${field.key}W`]: 1, [`${field.key}H`]: 1 })
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
            <output htmlFor={id} className="font-mono text-sm text-lime">
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
              inputMode="numeric"
              min={field.min}
              max={field.max}
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
                  className={`flex min-h-9 cursor-pointer items-center justify-center rounded px-2 text-center text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-lime ${
                    value === option.value ? "bg-raised text-lime" : "text-muted hover:text-fg"
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
              value ? "border-lime bg-lime" : "border-line bg-ink"
            }`}
          >
            <span
              className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-all ${
                value ? "left-6 bg-ink" : "left-0.5 bg-muted"
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
            type="text"
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

    case "crop":
      return (
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg">{field.label}</span>
            <button type="button" onClick={onReset} className="min-h-9 rounded px-2 text-sm text-muted underline hover:text-lime">
              Reset
            </button>
          </div>
          {hint}
        </div>
      );
  }
}
