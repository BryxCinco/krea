"use client";

/** Small labelled form controls for the document editors, styled like the inspector fields. */
import { useId, useState, type ReactNode } from "react";

const inputClass =
  "min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg placeholder:text-muted/70 hover:border-muted";

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url" | "date";
  hint?: string;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-fg">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  unit,
  min = 0,
  step = 0.01,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  step?: number;
  hint?: string;
}) {
  const id = useId();
  // Keep what the user typed (e.g. "12." or "") while the number stays valid.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-fg">
        {label}
      </label>
      <div className="relative">
        {unit === "₱" && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">₱</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={draft ?? (Number.isFinite(value) ? String(value) : "")}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = Number(event.target.value);
            onChange(event.target.value === "" || !Number.isFinite(parsed) ? 0 : parsed);
          }}
          onBlur={() => setDraft(null)}
          className={`${inputClass} font-mono ${unit === "₱" ? "pl-7" : ""} ${unit && unit !== "₱" ? "pr-10" : ""}`}
        />
        {unit && unit !== "₱" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">{unit}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-fg">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} resize-y py-2 leading-relaxed`}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm text-fg">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-line bg-ink p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-9 cursor-pointer items-center justify-center rounded px-2 text-center text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent ${
              value === option.value ? "bg-raised text-accent" : "text-muted hover:text-fg"
            }`}
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-10 shrink-0 rounded-md border border-line bg-ink p-1" />
        <span className="font-mono text-sm uppercase text-muted">{value}</span>
      </div>
    </div>
  );
}

/** A titled group of fields. */
export function Group({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-widest text-muted">{title}</h2>
        {actions}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Two-step destructive button: first press asks, second press does it. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = "" }: { label: ReactNode; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [asking, setAsking] = useState(false);
  return asking ? (
    <span className="inline-flex gap-1">
      <button
        type="button"
        autoFocus
        onClick={() => {
          onConfirm();
          setAsking(false);
        }}
        className={`inline-flex min-h-10 items-center rounded-md border border-signal px-3 text-sm font-semibold text-signal hover:bg-signal hover:text-on-signal ${className}`}
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="inline-flex min-h-10 items-center rounded-md px-3 text-sm text-muted hover:text-fg">
        Cancel
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setAsking(true)}
      className={`inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg hover:border-signal hover:text-signal ${className}`}
    >
      {label}
    </button>
  );
}
