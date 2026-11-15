"use client";

import { Check, Copy, Eye, EyeOff, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { onTabListKeyDown } from "@/lib/use-focus-trap";
import {
  ATTACK_SCENARIOS,
  estimatePassword,
  generatePassphrase,
  generateRandom,
  PASSPHRASE_DEFAULTS,
  passphraseEntropy,
  RANDOM_DEFAULTS,
  randomEntropy,
  RATINGS,
  ratingFor,
  timeToGuess,
  type Dictionaries,
  type PassphraseOptions,
  type Piece,
  type Rating,
  type RandomOptions,
} from "@/tools/text/password-logic";
import { Group } from "./form";
import { EditorShell } from "./editor-shell";

type Tab = "generate" | "check";
type Kind = "random" | "passphrase";

const SEPARATORS = [
  { value: "-", label: "Dash ( - )" },
  { value: " ", label: "Space" },
  { value: ".", label: "Dot ( . )" },
  { value: "_", label: "Underscore ( _ )" },
  { value: "", label: "None" },
];

const PIECE_LABEL: Record<Piece["kind"], string> = {
  common: "Common password",
  word: "Dictionary word",
  keyboard: "Keyboard pattern",
  sequence: "Sequence",
  repeat: "Repeat",
  year: "Year",
  digits: "Digits",
  random: "Characters",
};

const RATING_TEXT: Record<Rating, string> = {
  "very-weak": "text-signal",
  weak: "text-signal",
  fair: "text-fg",
  strong: "text-accent",
  "very-strong": "text-accent",
};
const RATING_STEPS: Record<Rating, number> = { "very-weak": 1, weak: 2, fair: 3, strong: 4, "very-strong": 5 };

function Check2({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={`flex min-h-10 cursor-pointer items-center gap-3 text-sm ${disabled ? "text-muted" : "text-fg"}`}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-lime" />
        {label}
      </label>
      {hint && <p className="ml-7 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Meter({ rating }: { rating: Rating }) {
  const steps = RATING_STEPS[rating];
  const fill = steps <= 2 ? "bg-signal" : "bg-lime";
  return (
    <div aria-hidden className="flex gap-1">
      {[1, 2, 3, 4, 5].map((step) => (
        <span key={step} className={`h-2 flex-1 rounded-full ${step <= steps ? fill : "bg-line"}`} />
      ))}
    </div>
  );
}

function Scenarios({ bits }: { bits: number }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs uppercase tracking-widest text-muted">Rough time to guess</h3>
      <table className="w-full text-sm">
        <caption className="sr-only">Average time for an attacker to guess this password in three situations</caption>
        <tbody>
          {ATTACK_SCENARIOS.map((scenario) => (
            <tr key={scenario.id} className="border-t border-line">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">
                {scenario.label}
              </th>
              <td className="py-2 text-right font-mono text-fg">{timeToGuess(bits, scenario.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Assumes {ATTACK_SCENARIOS.map((scenario) => `${scenario.rate.toLocaleString("en-US")}`).join(", ")} guesses per second, on average halfway through the search. Real attackers vary, so treat these as orders of magnitude.
      </p>
    </div>
  );
}

/** Entropy in plain words, shown with every result so the number means something. */
function EntropyNote() {
  return (
    <details className="mt-4 rounded-md border border-line p-3 text-sm">
      <summary className="cursor-pointer text-fg">What do bits of entropy mean?</summary>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        N bits means about 2^N possible passwords the attacker has to search. Every extra bit doubles the work: 40 bits is about a trillion, 80 bits is more than a trillion trillion. For a random password the number is length × log2(size of the character set). For
        a password a person made up, Krea estimates it from the cheapest way to guess it (common passwords, words, patterns), which is always lower. A high number only covers guessing: phishing, leaks and reusing a password on another site get around it.
      </p>
    </details>
  );
}

function Generate({ kind, random, phrase, count, words, results }: {
  kind: Kind;
  random: RandomOptions;
  phrase: PassphraseOptions;
  count: number;
  words: number;
  results: { text: string }[];
}) {
  const { setNotice } = useSession();
  const [shown, setShown] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const bits = kind === "random" ? randomEntropy(random) : words ? passphraseEntropy(phrase, words) : 0;
  const rating = ratingFor(bits);
  const copy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied((current) => (current === index ? null : current)), 1500);
      setNotice("Copied. Your clipboard may keep it until you copy something else.");
    } catch {
      setNotice("Hindi ma-copy: the browser blocked clipboard access. Select the password and copy it by hand.");
    }
  };
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-widest text-muted">{count === 1 ? "Your password" : `Your ${count} passwords`}</h2>
        <button type="button" onClick={() => setShown((value) => !value)} aria-pressed={!shown} className="inline-flex min-h-10 items-center gap-1.5 rounded px-2 text-sm text-muted hover:text-fg">
          {shown ? <EyeOff aria-hidden className="size-4" strokeWidth={1.75} /> : <Eye aria-hidden className="size-4" strokeWidth={1.75} />}
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <ul aria-label="Generated passwords" className="flex flex-col gap-1.5">
        {results.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 rounded-md border border-line bg-ink p-1.5 pl-3">
            <span data-generated className="min-w-0 flex-1 break-all font-mono text-sm text-fg" aria-label={shown ? undefined : "Hidden password"}>
              {shown ? entry.text : "•".repeat(Math.min(entry.text.length, 32))}
            </span>
            <button
              type="button"
              onClick={() => copy(entry.text, index)}
              aria-label={`Copy password ${index + 1}`}
              className="flex size-10 shrink-0 items-center justify-center rounded text-muted hover:text-accent"
            >
              {copied === index ? <Check aria-hidden className="size-4 text-accent" strokeWidth={2} /> : <Copy aria-hidden className="size-4" strokeWidth={1.75} />}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-lg font-semibold ${RATING_TEXT[rating]}`}>{RATINGS[rating].label}</p>
        <p className="font-mono text-sm text-muted">{Math.round(bits)} bits of entropy</p>
      </div>
      <div className="mt-2">
        <Meter rating={rating} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{RATINGS[rating].meaning}</p>
      <Scenarios bits={bits} />
      <EntropyNote />
    </div>
  );
}

function CheckResult({ password, dictionaries }: { password: string; dictionaries: Dictionaries | null }) {
  const estimate = useMemo(() => (password && dictionaries ? estimatePassword(password, dictionaries) : null), [password, dictionaries]);
  if (!password) {
    return (
      <div className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Strength</h2>
        <p className="text-sm text-muted">I-type ang password sa kaliwa. It stays on this page and is never saved or sent.</p>
      </div>
    );
  }
  if (!estimate) {
    return (
      <div className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Strength</h2>
        <p className="text-sm text-muted">Loading the common-password list…</p>
      </div>
    );
  }
  const rating = ratingFor(estimate.bits);
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Strength</h2>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-lg font-semibold ${RATING_TEXT[rating]}`}>{RATINGS[rating].label}</p>
        <p className="font-mono text-sm text-muted">about {Math.round(estimate.bits)} bits</p>
      </div>
      <div className="mt-2">
        <Meter rating={rating} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{RATINGS[rating].meaning}</p>

      {estimate.warnings.length > 0 && (
        <ul aria-label="Warnings" className="mt-4 flex flex-col gap-1.5">
          {estimate.warnings.map((warning) => (
            <li key={warning} className="flex gap-2 rounded-md border border-signal/60 p-2.5 text-sm text-fg">
              <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.75} />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-4 text-xs uppercase tracking-widest text-muted">How it is guessed</h3>
      <ul aria-label="Parts of the password" className="flex flex-col gap-1">
        {estimate.pieces.map((piece, index) => (
          <li key={index} className="flex items-baseline justify-between gap-3 rounded border border-line px-2.5 py-1.5 text-sm">
            <span className="min-w-0 truncate font-mono text-fg">{"•".repeat(Math.min(piece.text.length, 12))}</span>
            <span className="shrink-0 text-muted">
              {PIECE_LABEL[piece.kind]} · <span className="font-mono">{Math.round(piece.bits)} bits</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        If every character were random, this password would have {Math.round(estimate.ceilingBits)} bits. The estimate is lower when parts of it follow patterns an attacker tries first.
      </p>

      <Scenarios bits={estimate.bits} />

      <h3 className="mb-2 mt-4 text-xs uppercase tracking-widest text-muted">What to do</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg">
        {estimate.suggestions.map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>

      <p className="mt-4 rounded-md border border-line p-3 text-xs leading-relaxed text-muted">
        This is a rough estimate, not a guarantee. It knows 10,000 common passwords, 7,776 words and a few common patterns, so a password built from uncommon words can score higher than it deserves. A strong score does not make a password safe if it is reused, phished
        or leaked.
      </p>
      <EntropyNote />
    </div>
  );
}

export default function PasswordEditor() {
  // Nothing here is saved: passwords exist only in this component's memory.
  const [tab, setTab] = useState<Tab>("generate");
  const [kind, setKind] = useState<Kind>("random");
  const [random, setRandom] = useState<RandomOptions>(RANDOM_DEFAULTS);
  const [phrase, setPhrase] = useState<PassphraseOptions>(PASSPHRASE_DEFAULTS);
  const [count, setCount] = useState(5);
  const [words, setWords] = useState<readonly string[] | null>(null);
  const [dictionaries, setDictionaries] = useState<Dictionaries | null>(null);
  const [seed, setSeed] = useState(0);
  const [typed, setTyped] = useState("");
  const [reveal, setReveal] = useState(false);
  const panelId = useId();
  const passwordId = useId();

  // The 7,776-word list loads only for passphrases; the common-password list only for the checker.
  useEffect(() => {
    if (kind === "passphrase" && !words) import("@/config/wordlist-eff").then((module) => setWords(module.EFF_WORDS));
  }, [kind, words]);
  useEffect(() => {
    if (tab !== "check" || dictionaries) return;
    Promise.all([import("@/config/common-passwords"), import("@/config/wordlist-eff"), import("@/config/ph-passwords")]).then(([common, eff, ph]) => {
      // Local words are ranked as fairly common (about 1,500th), an assumption noted in ph-passwords.ts.
      const merged = [...common.COMMON_PASSWORDS];
      merged.splice(1500, 0, ...ph.PH_PASSWORD_WORDS);
      setDictionaries({ common: merged, words: eff.EFF_WORDS });
    });
  }, [tab, dictionaries]);

  // The preview always matches the settings: it is regenerated whenever an option changes,
  // or when "Generate again" bumps the counter.
  const { results, error } = useMemo(() => {
    void seed;
    try {
      if (kind === "random") return { results: Array.from({ length: count }, () => ({ text: generateRandom(random) })), error: "" };
      if (!words) return { results: [], error: "" };
      return { results: Array.from({ length: count }, () => ({ text: generatePassphrase(phrase, words) })), error: "" };
    } catch (failure) {
      return { results: [], error: failure instanceof Error ? failure.message : "Hindi makagawa ng password." };
    }
  }, [kind, random, phrase, count, words, seed]);
  const generate = () => setSeed((value) => value + 1);

  const setR = (patch: Partial<RandomOptions>) => setRandom((current) => ({ ...current, ...patch }));
  const setP = (patch: Partial<PassphraseOptions>) => setPhrase((current) => ({ ...current, ...patch }));
  const noSets = !random.lower && !random.upper && !random.digits && !random.symbols;

  const switchTab = (next: Tab) => {
    setTab(next);
    // Never keep a typed password around when leaving the checker.
    setTyped("");
    setReveal(false);
  };

  const form = (
    <>
      <div role="tablist" aria-label="Password tools" onKeyDown={onTabListKeyDown} className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1">
        {(
          [
            ["generate", "Generate"],
            ["check", "Check strength"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${panelId}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${panelId}-panel`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => switchTab(id)}
            className={`min-h-10 rounded px-2 text-sm transition-colors ${tab === id ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-tab-${tab}`} className="flex flex-col gap-5">
        {tab === "generate" ? (
          <>
            <Group title="Type">
              <div role="radiogroup" aria-label="Password type" className="grid grid-cols-2 gap-1 rounded-md border border-line bg-ink p-1">
                {(
                  [
                    ["random", "Random password"],
                    ["passphrase", "Passphrase"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    onClick={() => setKind(value)}
                    className={`min-h-10 rounded px-2 text-sm ${kind === value ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {kind === "random" ? (
                <>
                  <div>
                    <label htmlFor="pw-length" className="mb-1.5 flex items-baseline justify-between text-sm text-fg">
                      Length
                      <span className="font-mono text-xs text-muted">{random.length}</span>
                    </label>
                    <input id="pw-length" type="range" min={6} max={64} step={1} value={random.length} onChange={(event) => setR({ length: Number(event.target.value) })} className="w-full accent-lime" />
                  </div>
                  <fieldset>
                    <legend className="mb-1 text-sm text-fg">Characters</legend>
                    <Check2 label="Lowercase (a-z)" checked={random.lower} onChange={(lower) => setR({ lower })} />
                    <Check2 label="Uppercase (A-Z)" checked={random.upper} onChange={(upper) => setR({ upper })} />
                    <Check2 label="Numbers (0-9)" checked={random.digits} onChange={(digits) => setR({ digits })} />
                    <Check2 label="Symbols (!@#$…)" checked={random.symbols} onChange={(symbols) => setR({ symbols })} />
                  </fieldset>
                  <Check2 label="Avoid look-alike characters" checked={random.excludeLookalikes} onChange={(excludeLookalikes) => setR({ excludeLookalikes })} hint="Leaves out O 0 o I l 1 | and quote marks, which are easy to misread." />
                  <Check2 label="Include every selected type" checked={random.requireEach} onChange={(requireEach) => setR({ requireEach })} hint="Some sites insist on at least one of each. It lowers the strength only slightly." />
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="pw-words" className="mb-1.5 flex items-baseline justify-between text-sm text-fg">
                      Words
                      <span className="font-mono text-xs text-muted">{phrase.words}</span>
                    </label>
                    <input id="pw-words" type="range" min={3} max={10} step={1} value={phrase.words} onChange={(event) => setP({ words: Number(event.target.value) })} className="w-full accent-lime" />
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">Each word is picked at random from the 7,776-word EFF list, about 12.9 bits per word. Easier to type and remember than random symbols.</p>
                  </div>
                  <div>
                    <label htmlFor="pw-sep" className="mb-1.5 block text-sm text-fg">
                      Separator
                    </label>
                    <select id="pw-sep" value={phrase.separator} onChange={(event) => setP({ separator: event.target.value })} className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted">
                      {SEPARATORS.map((entry) => (
                        <option key={entry.label} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Check2 label="Capitalize each word" checked={phrase.capitalize} onChange={(capitalize) => setP({ capitalize })} />
                  <Check2 label="Add a number (0-99)" checked={phrase.number} onChange={(number) => setP({ number })} />
                  {!words && <p className="text-xs text-muted">Loading the word list…</p>}
                </>
              )}
            </Group>

            <Group title="How many">
              <div>
                <label htmlFor="pw-count" className="mb-1.5 flex items-baseline justify-between text-sm text-fg">
                  Passwords at once
                  <span className="font-mono text-xs text-muted">{count}</span>
                </label>
                <input id="pw-count" type="range" min={1} max={20} step={1} value={count} onChange={(event) => setCount(Number(event.target.value))} className="w-full accent-lime" />
              </div>
            </Group>
            {kind === "random" && noSets && (
              <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
                Pumili ng kahit isang uri ng character.
              </p>
            )}
            {error && !(kind === "random" && noSets) && (
              <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
                {error}
              </p>
            )}
          </>
        ) : (
          <Group title="Password to check">
            <div>
              <label htmlFor={passwordId} className="mb-1.5 block text-sm text-fg">
                Type or paste a password
              </label>
              <div className="flex gap-2">
                <input
                  id={passwordId}
                  type={reveal ? "text" : "password"}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  maxLength={256}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  className="min-h-10 w-full rounded-md border border-line bg-ink px-3 font-mono text-sm text-fg placeholder:text-muted/70 hover:border-muted [&::-ms-reveal]:hidden"
                />
                <button
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  aria-pressed={reveal}
                  className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line text-muted hover:text-fg"
                >
                  {reveal ? <EyeOff aria-hidden className="size-4" strokeWidth={1.75} /> : <Eye aria-hidden className="size-4" strokeWidth={1.75} />}
                </button>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">Checked on this page only: never saved, logged or sent. Cleared when you leave this tab.</p>
            </div>
          </Group>
        )}
      </div>
    </>
  );

  const preview =
    tab === "generate" ? (
      <Generate kind={kind} random={random} phrase={phrase} count={count} words={words?.length ?? 0} results={results} />
    ) : (
      <CheckResult password={typed} dictionaries={dictionaries} />
    );

  const actions =
    tab === "generate" ? (
      <Button variant="primary" onClick={generate} disabled={kind === "random" ? noSets : !words}>
        <RefreshCw aria-hidden className="size-4" strokeWidth={2} />
        Generate again
      </Button>
    ) : (
      <Button onClick={() => setTyped("")} disabled={!typed}>
        <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
        Clear
      </Button>
    );

  return <EditorShell label="Password generator and strength checker" form={form} preview={preview} actions={actions} previewLabel="Result" />;
}
