"use client";

/**
 * Render Chains: build a pipeline of Moves, save it as a preset in
 * localStorage, and run it on the files on the Stage. Built-in presets can be
 * run as-is or saved as an editable copy.
 */
import { ArrowDown, ArrowUp, ChevronDown, Link2, Pencil, Play, Plus, Save, Square, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { Fields } from "@/components/inspector/fields";
import { Button } from "@/components/ui/button";
import { ToolIcon } from "@/components/ui/icon";
import { blockReason, builtInChains, chainOutput, loadSavedChains, newStep, saveChains, validateChain } from "@/lib/chains";
import { getTool, tools } from "@/tools/registry";
import type { Chain, ChainStep, OutputKind } from "@/tools/types";

export interface ChainsPanelProps {
  /** Kind of files on the Stage, or null when it is empty. */
  startKind: OutputKind | null;
  /** Stage holds images and PDFs together. */
  mixed: boolean;
  fileCount: number;
  /** Id of the chain currently running, if any. */
  runningId: string | null;
  onRun: (chain: Chain) => void;
  onCancel: () => void;
}

export function ChainsPanel({ startKind, mixed, fileCount, runningId, onRun, onCancel }: ChainsPanelProps) {
  const [saved, setSaved] = useState<Chain[]>(() => (typeof window === "undefined" ? [] : loadSavedChains()));
  const [draft, setDraft] = useState<Chain | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /** Why a chain cannot run on the current Stage, or null. */
  const runBlock = (chain: Chain): string | null => {
    if (chain.steps.length === 0) return "Add at least one Move.";
    if (fileCount === 0) return "Drop a file on the Stage first.";
    if (mixed) return "Images and PDFs together cannot go through one chain. Remove one kind.";
    const problems = validateChain(chain.steps, startKind);
    const index = problems.findIndex(Boolean);
    if (index >= 0) return `Step ${index + 1}: ${problems[index]}`;
    const first = getTool(chain.steps[0].slug);
    if (first?.minFiles && fileCount < first.minFiles) return `${first.name} needs at least ${first.minFiles} files.`;
    return null;
  };

  const persist = (next: Chain[]) => {
    setSaved(next);
    saveChains(next);
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim() || "Untitled chain";
    const isNew = draft.builtIn || !saved.some((chain) => chain.id === draft.id);
    const chain: Chain = { ...draft, name, builtIn: false, id: isNew ? `user-${Date.now().toString(36)}` : draft.id };
    persist(isNew ? [...saved, chain] : saved.map((entry) => (entry.id === chain.id ? chain : entry)));
    setDraft(chain);
  };

  if (draft) {
    return <ChainEditor draft={draft} startKind={startKind} runBlock={runBlock(draft)} running={runningId === draft.id} onChange={setDraft} onSave={saveDraft} onClose={() => setDraft(null)} onRun={() => onRun(draft)} onCancel={onCancel} />;
  }

  const row = (chain: Chain) => {
    const blocked = runBlock(chain);
    const running = runningId === chain.id;
    return (
      <li key={chain.id} className="rounded-lg border border-line bg-ink p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{chain.name}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {chain.description ??
                chain.steps.map((step) => getTool(step.slug)?.verb ?? step.slug).join(" → ")}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Edit ${chain.name}`}
            onClick={() => setDraft(structuredClone(chain))}
            className="flex size-9 shrink-0 items-center justify-center rounded text-muted hover:text-accent"
          >
            <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
          {!chain.builtIn &&
            (confirmDelete === chain.id ? (
              <button
                type="button"
                onClick={() => {
                  persist(saved.filter((entry) => entry.id !== chain.id));
                  setConfirmDelete(null);
                }}
                className="min-h-9 shrink-0 rounded border border-signal px-2 text-xs font-semibold text-signal"
              >
                Delete?
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Delete ${chain.name}`}
                onClick={() => setConfirmDelete(chain.id)}
                className="flex size-9 shrink-0 items-center justify-center rounded text-muted hover:text-signal"
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {running ? (
            <Button variant="signal" className="min-h-9" onClick={onCancel}>
              <Square aria-hidden className="size-3.5" strokeWidth={2} />
              Cancel
            </Button>
          ) : (
            <Button variant="primary" className="min-h-9" disabled={Boolean(blocked) || Boolean(runningId)} onClick={() => onRun(chain)}>
              <Play aria-hidden className="size-3.5" strokeWidth={2} />
              Run
            </Button>
          )}
          {blocked && !running && <span className="text-xs leading-snug text-muted">{blocked}</span>}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted">
        Pagsunud-sunurin ang Moves, then run them all in one go. Saved chains stay in this browser only.
      </p>
      <Button
        onClick={() => setDraft({ id: "draft", name: "", steps: [] })}
        className="w-full"
      >
        <Plus aria-hidden className="size-4" strokeWidth={1.75} />
        New chain
      </Button>
      {saved.length > 0 && (
        <section aria-label="Your chains">
          <h3 className="mb-2 text-xs uppercase tracking-widest text-muted">Your chains</h3>
          <ul className="flex flex-col gap-2">{saved.map(row)}</ul>
        </section>
      )}
      <section aria-label="Built-in presets">
        <h3 className="mb-2 text-xs uppercase tracking-widest text-muted">Presets</h3>
        <ul className="flex flex-col gap-2">{builtInChains.map(row)}</ul>
      </section>
    </div>
  );
}

interface ChainEditorProps {
  draft: Chain;
  startKind: OutputKind | null;
  runBlock: string | null;
  running: boolean;
  onChange: (chain: Chain) => void;
  onSave: () => void;
  onClose: () => void;
  onRun: () => void;
  onCancel: () => void;
}

function ChainEditor({ draft, startKind, runBlock, running, onChange, onSave, onClose, onRun, onCancel }: ChainEditorProps) {
  const nameId = useId();
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(draft.steps.length === 0);
  const problems = validateChain(draft.steps, startKind);

  const setSteps = (steps: ChainStep[]) => onChange({ ...draft, steps });
  const move = (from: number, to: number) => {
    const steps = [...draft.steps];
    const [item] = steps.splice(from, 1);
    steps.splice(to, 0, item);
    setSteps(steps);
    setOpen(null);
  };

  // What the next step will receive, and which Moves fit it.
  const incoming = chainOutput(draft.steps, startKind);
  const last = draft.steps.length ? getTool(draft.steps[draft.steps.length - 1].slug) : undefined;
  // Editors (Markdown, resume, ...) are not file Moves, so they are not offered at all.
  const candidates = tools.filter((tool) => tool.kind !== "editor").map((tool) => ({ tool, reason: blockReason(tool, incoming, last) }));
  const available = candidates.filter((entry) => !entry.reason);
  const unavailable = candidates.filter((entry) => entry.reason);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{draft.builtIn ? "Preset" : "Edit chain"}</h3>
        <Button variant="ghost" icon aria-label="Back to all chains" onClick={onClose}>
          <X aria-hidden className="size-4" strokeWidth={1.75} />
        </Button>
      </div>

      <div>
        <label htmlFor={nameId} className="mb-1.5 block text-sm text-fg">
          Name
        </label>
        <input
          id={nameId}
          type="text"
          value={draft.name}
          placeholder="e.g. Pang-upload sa portal"
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg placeholder:text-muted/70"
        />
      </div>

      <ol aria-label="Steps" className="flex flex-col gap-2">
        {draft.steps.map((step, index) => {
          const tool = getTool(step.slug);
          if (!tool) return null;
          const expanded = open === index;
          return (
            <li key={`${step.slug}-${index}`} className={`rounded-lg border bg-ink ${problems[index] ? "border-signal" : "border-line"}`}>
              <div className="flex items-center gap-1 p-2">
                <span className="w-5 shrink-0 text-center font-mono text-xs text-muted">{index + 1}</span>
                <ToolIcon name={tool.icon} className="size-4 shrink-0 text-accent" />
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : index)}
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-1 rounded px-1 text-left text-sm text-fg"
                >
                  <span className="truncate">{tool.name}</span>
                  <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} strokeWidth={1.75} />
                </button>
                <button type="button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)} className="flex size-8 items-center justify-center rounded text-muted hover:text-accent disabled:opacity-30">
                  <ArrowUp aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button type="button" aria-label={`Move step ${index + 1} down`} disabled={index === draft.steps.length - 1} onClick={() => move(index, index + 1)} className="flex size-8 items-center justify-center rounded text-muted hover:text-accent disabled:opacity-30">
                  <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() => {
                    setSteps(draft.steps.filter((_, i) => i !== index));
                    setOpen(null);
                  }}
                  className="flex size-8 items-center justify-center rounded text-muted hover:text-signal"
                >
                  <X aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </div>
              {problems[index] && <p className="px-3 pb-2 text-xs leading-relaxed text-signal">{problems[index]}</p>}
              {expanded && (
                <div className="border-t border-line p-3">
                  <Fields
                    tool={tool}
                    values={step.options}
                    compact
                    onChange={(patch) =>
                      setSteps(draft.steps.map((entry, i) => (i === index ? { ...entry, options: { ...entry.options, ...patch } } : entry)))
                    }
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {adding ? (
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-muted">
              {draft.steps.length ? "Add the next Move" : "First Move"}
            </p>
            {draft.steps.length > 0 && (
              <button type="button" onClick={() => setAdding(false)} className="min-h-8 px-1 text-xs text-muted underline">
                Close
              </button>
            )}
          </div>
          {available.length ? (
            <div className="flex flex-wrap gap-1.5">
              {available.map(({ tool }) => (
                <button
                  key={tool.slug}
                  type="button"
                  onClick={() => {
                    setSteps([...draft.steps, newStep(tool)]);
                    setAdding(false);
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-fg hover:border-accent"
                >
                  <ToolIcon name={tool.icon} />
                  {tool.verb}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Walang Move na pwedeng sumunod dito.</p>
          )}
          {unavailable.length > 0 && (
            <details className="mt-3">
              <summary className="min-h-8 text-xs text-muted">Hindi pwede next ({unavailable.length}): why?</summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {unavailable.map(({ tool, reason }) => (
                  <li key={tool.slug} className="text-xs leading-relaxed text-muted">
                    <span className="text-fg">{tool.name}:</span> {reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <Button onClick={() => setAdding(true)}>
          <Link2 aria-hidden className="size-4" strokeWidth={1.75} />
          Add a Move
        </Button>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {running ? (
          <Button variant="signal" className="flex-1" onClick={onCancel}>
            <Square aria-hidden className="size-4" strokeWidth={2} />
            Cancel
          </Button>
        ) : (
          <Button variant="primary" className="flex-1" disabled={Boolean(runBlock)} onClick={onRun}>
            <Play aria-hidden className="size-4" strokeWidth={2} />
            Run chain
          </Button>
        )}
        <Button onClick={onSave} disabled={draft.steps.length === 0}>
          <Save aria-hidden className="size-4" strokeWidth={1.75} />
          {draft.builtIn ? "Save a copy" : "Save"}
        </Button>
      </div>
      {runBlock && !running && <p className="text-xs leading-relaxed text-muted">{runBlock}</p>}
    </div>
  );
}
