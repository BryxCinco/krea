"use client";

import { ArrowDown, ArrowUp, Plus, Printer, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { printDocument } from "@/lib/print";
import { usePersistentState } from "@/lib/use-persistent-state";
import {
  newEntry,
  newResume,
  newSection,
  resumeDocument,
  SECTION_PRESETS,
  type ResumeData,
  type ResumeEntry,
  type ResumeSection,
} from "@/tools/text/resume";
import { DocPreview } from "./doc-preview";
import { ColorInput, ConfirmButton, Group, Segmented, TextArea, TextInput } from "./form";
import { EditorShell } from "./editor-shell";

/** Keep only well-formed stored data (it may come from an older version). */
function restore(stored: unknown): ResumeData | null {
  const data = stored as ResumeData;
  if (!data || typeof data !== "object" || !data.basics || !Array.isArray(data.sections)) return null;
  return { ...newResume(), ...data, basics: { ...newResume().basics, ...data.basics } };
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-9 items-center justify-center rounded text-muted disabled:opacity-30 ${danger ? "hover:text-signal" : "hover:text-accent"}`}
    >
      {children}
    </button>
  );
}

function EntryEditor({ entry, index, count, onChange, onMove, onRemove }: {
  entry: ResumeEntry;
  index: number;
  count: number;
  onChange: (entry: ResumeEntry) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<ResumeEntry>) => onChange({ ...entry, ...patch });
  return (
    <div className="rounded-lg border border-line bg-ink p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-muted">Entry {index + 1}</span>
        <div className="flex">
          <IconButton label={`Move entry ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton label={`Move entry ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton label={`Remove entry ${index + 1}`} danger onClick={onRemove}>
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Title" value={entry.title} onChange={(title) => set({ title })} placeholder="Job title, degree, project" />
        <TextInput label="Where" value={entry.subtitle} onChange={(subtitle) => set({ subtitle })} placeholder="Company, school" />
        <TextInput label="When" value={entry.period} onChange={(period) => set({ period })} placeholder="2022 to present" />
      </div>
      <div className="mt-3">
        <TextArea label="Details (one bullet per line)" value={entry.details} onChange={(details) => set({ details })} rows={3} placeholder={"Led a team of 5\nCut processing time by 30%"} />
      </div>
    </div>
  );
}

function SectionEditor({ section, index, count, onChange, onMove, onRemove }: {
  section: ResumeSection;
  index: number;
  count: number;
  onChange: (section: ResumeSection) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const titleId = useId();
  const set = (patch: Partial<ResumeSection>) => onChange({ ...section, ...patch });
  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label id={titleId} htmlFor={`${titleId}-input`} className="mb-1.5 block text-xs uppercase tracking-widest text-muted">
            Section {index + 1}: {section.title || "Untitled"}
          </label>
          <input
            id={`${titleId}-input`}
            value={section.title}
            onChange={(event) => set({ title: event.target.value })}
            aria-label="Section title"
            className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm font-semibold text-fg"
          />
        </div>
        <IconButton label={`Move ${section.title || "section"} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton label={`Move ${section.title || "section"} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton label={`Remove ${section.title || "section"}`} danger onClick={onRemove}>
          <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>

      {section.kind === "entries" && (
        <div className="flex flex-col gap-3">
          {section.entries.map((entry, entryIndex) => (
            <EntryEditor
              key={entry.id}
              entry={entry}
              index={entryIndex}
              count={section.entries.length}
              onChange={(next) => set({ entries: section.entries.map((item) => (item.id === entry.id ? next : item)) })}
              onMove={(to) => set({ entries: move(section.entries, entryIndex, to) })}
              onRemove={() => set({ entries: section.entries.filter((item) => item.id !== entry.id) })}
            />
          ))}
          <Button onClick={() => set({ entries: [...section.entries, newEntry()] })}>
            <Plus aria-hidden className="size-4" strokeWidth={1.75} />
            Add entry
          </Button>
        </div>
      )}
      {section.kind === "list" && (
        <TextArea label="Items (comma or one per line)" value={section.content} onChange={(content) => set({ content })} rows={3} placeholder="Excel, Customer service, Filipino, English" />
      )}
      {section.kind === "text" && <TextArea label="Text" value={section.content} onChange={(content) => set({ content })} rows={4} />}
    </section>
  );
}

export default function ResumeEditor() {
  const { value: data, setValue: setData, saved, clear } = usePersistentState("krea.resume", newResume, restore);
  const [adding, setAdding] = useState(false);
  const set = (patch: Partial<ResumeData>) => setData((current) => ({ ...current, ...patch }));
  const setBasics = (patch: Partial<ResumeData["basics"]>) => setData((current) => ({ ...current, basics: { ...current.basics, ...patch } }));
  const html = resumeDocument(data);

  const form = (
    <>
      <Group title="Look">
        <Segmented
          label="Template"
          value={data.template}
          onChange={(template) => set({ template })}
          options={[
            { value: "classic", label: "Classic" },
            { value: "modern", label: "Modern" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented
            label="Paper"
            value={data.paper}
            onChange={(paper) => set({ paper })}
            options={[
              { value: "a4", label: "A4" },
              { value: "letter", label: "Letter" },
            ]}
          />
          <ColorInput label="Accent colour" value={data.accent} onChange={(accent) => set({ accent })} />
        </div>
      </Group>

      <Group title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Full name" value={data.basics.name} onChange={(name) => setBasics({ name })} autoComplete="name" />
          <TextInput label="Headline" value={data.basics.headline} onChange={(headline) => setBasics({ headline })} placeholder="Customer Support Specialist" />
          <TextInput label="Email" type="email" value={data.basics.email} onChange={(email) => setBasics({ email })} autoComplete="email" />
          <TextInput label="Phone" type="tel" value={data.basics.phone} onChange={(phone) => setBasics({ phone })} autoComplete="tel" />
          <TextInput label="Location" value={data.basics.location} onChange={(location) => setBasics({ location })} placeholder="Quezon City" />
          <TextInput label="Links" value={data.basics.links} onChange={(links) => setBasics({ links })} placeholder="linkedin.com/in/you, portfolio.ph" />
        </div>
        <TextArea label="Profile summary" value={data.basics.summary} onChange={(summary) => setBasics({ summary })} rows={3} />
      </Group>

      {data.sections.map((section, index) => (
        <SectionEditor
          key={section.id}
          section={section}
          index={index}
          count={data.sections.length}
          onChange={(next) => set({ sections: data.sections.map((item) => (item.id === section.id ? next : item)) })}
          onMove={(to) => set({ sections: move(data.sections, index, to) })}
          onRemove={() => set({ sections: data.sections.filter((item) => item.id !== section.id) })}
        />
      ))}

      <div className="rounded-xl border border-dashed border-line p-4">
        {adding ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted">Add a section</p>
            <div className="flex flex-wrap gap-2">
              {SECTION_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    set({ sections: [...data.sections, newSection(preset.title, preset.kind)] });
                    setAdding(false);
                  }}
                  className="min-h-9 rounded-full border border-line px-3 text-sm text-fg hover:border-accent"
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Button onClick={() => setAdding(true)} className="w-full">
            <Plus aria-hidden className="size-4" strokeWidth={1.75} />
            Add section
          </Button>
        )}
      </div>
    </>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={() => printDocument(html)} title="Opens the print dialog: choose Save as PDF">
        <Printer aria-hidden className="size-4" strokeWidth={2} />
        Save as PDF
      </Button>
      <ConfirmButton
        label={
          <>
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            Clear data
          </>
        }
        confirmLabel="Delete my resume data?"
        onConfirm={() => clear(newResume())}
      />
    </>
  );

  return <EditorShell label="Resume builder" form={form} preview={<DocPreview html={html} title="Resume preview" />} actions={actions} saved={saved} />;
}
