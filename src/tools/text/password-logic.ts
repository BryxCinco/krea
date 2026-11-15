/**
 * Password generation and strength estimation. Pure functions with no imports, so they can be
 * tested on their own. Randomness comes from crypto.getRandomValues only (never Math.random).
 * Nothing here stores, logs or sends a password.
 */

export const LOWER = "abcdefghijklmnopqrstuvwxyz";
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "0123456789";
export const SYMBOLS = "!@#$%^&*()-_=+[]{}:;,.?/~";
/** Characters that are easy to confuse when read aloud or printed: O/0, I/l/1, o, | and quote marks. */
export const LOOKALIKES = "O0oIl1|`'\"";

/** Uniform random integer in [0, max) by rejection sampling, so there is no modulo bias. */
export function randomInt(max: number): number {
  if (!(max > 0) || max > 2 ** 32) throw new RangeError("max must be between 1 and 2^32");
  const limit = Math.floor(2 ** 32 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

export function pick<T extends string | readonly unknown[]>(source: T): T extends string ? string : T[number] {
  return source[randomInt(source.length)] as never;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export interface RandomOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeLookalikes: boolean;
  /** Guarantee at least one character from every selected set. */
  requireEach: boolean;
}

export const RANDOM_DEFAULTS: RandomOptions = { length: 16, lower: true, upper: true, digits: true, symbols: true, excludeLookalikes: false, requireEach: true };

/** The character sets an options object selects, after removing look-alikes. */
export function characterSets(options: RandomOptions): string[] {
  const strip = (set: string) => (options.excludeLookalikes ? [...set].filter((c) => !LOOKALIKES.includes(c)).join("") : set);
  return [options.lower && LOWER, options.upper && UPPER, options.digits && DIGITS, options.symbols && SYMBOLS].filter((set): set is string => !!set).map(strip);
}

export function generateRandom(options: RandomOptions): string {
  const sets = characterSets(options);
  if (!sets.length) throw new Error("Pumili ng kahit isang uri ng character.");
  const pool = sets.join("");
  const length = Math.round(options.length);
  const chars: string[] = [];
  if (options.requireEach) {
    if (length < sets.length) throw new Error(`Need a length of at least ${sets.length} to include every selected type.`);
    for (const set of sets) chars.push(pick(set));
  }
  while (chars.length < length) chars.push(pick(pool));
  // Shuffle so the guaranteed characters are not always at the start.
  return shuffle(chars).join("");
}

/** Bits of entropy of a random password made with these options (a close estimate when "require each" is on). */
export function randomEntropy(options: RandomOptions): number {
  const pool = characterSets(options).join("").length;
  return pool > 1 ? Math.round(options.length) * Math.log2(pool) : 0;
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  /** Append a random number from 0 to 99. */
  number: boolean;
}

export const PASSPHRASE_DEFAULTS: PassphraseOptions = { words: 5, separator: "-", capitalize: false, number: false };

export function generatePassphrase(options: PassphraseOptions, words: readonly string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < options.words; i++) {
    const word = pick(words);
    parts.push(options.capitalize ? word[0].toUpperCase() + word.slice(1) : word);
  }
  let phrase = parts.join(options.separator);
  if (options.number) phrase += options.separator + String(randomInt(100));
  return phrase;
}

export function passphraseEntropy(options: PassphraseOptions, wordCount: number): number {
  return options.words * Math.log2(wordCount) + (options.number ? Math.log2(100) : 0);
}

// ---------------------------------------------------------------- strength rating

export type Rating = "very-weak" | "weak" | "fair" | "strong" | "very-strong";

export const RATINGS: Record<Rating, { label: string; meaning: string }> = {
  "very-weak": { label: "Very weak", meaning: "Would fall in moments, even to a slow guesser." },
  weak: { label: "Weak", meaning: "Fine for nothing important. Fast guessing cracks it." },
  fair: { label: "Fair", meaning: "Holds up only if the site limits login attempts. Not enough if the site's data leaks." },
  strong: { label: "Strong", meaning: "Hard to crack by guessing, even if the site's data leaks, as long as the password is not reused." },
  "very-strong": { label: "Very strong", meaning: "Out of reach of guessing with today's hardware, as long as it is unique and stays secret." },
};

export function ratingFor(bits: number): Rating {
  if (bits < 28) return "very-weak";
  if (bits < 40) return "weak";
  if (bits < 60) return "fair";
  if (bits < 80) return "strong";
  return "very-strong";
}

/** Attack speeds in guesses per second: assumptions, shown to the user as such. */
export const ATTACK_SCENARIOS = [
  { id: "online", label: "Online, site limits attempts", rate: 10 },
  { id: "slow", label: "Stolen data, slow hash (bcrypt-style)", rate: 10_000 },
  { id: "fast", label: "Stolen data, fast hash (e.g. unsalted SHA-1)", rate: 10_000_000_000 },
] as const;

/** "3 hours", "400 years", "centuries" for the average time to find a password of `bits` bits at `rate` guesses/s. */
export function timeToGuess(bits: number, rate: number): string {
  // On average an attacker finds the password halfway through the search.
  const seconds = 2 ** Math.max(0, bits - 1) / rate;
  if (seconds < 1) return "under a second";
  const units: [string, number][] = [
    ["second", 1],
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["year", 31_557_600],
  ];
  if (seconds >= 31_557_600 * 1e9) return "longer than the age of the universe";
  if (seconds >= 31_557_600 * 1e6) return "millions of years or more";
  let chosen = units[0];
  for (const unit of units) if (seconds >= unit[1]) chosen = unit;
  const value = seconds / chosen[1];
  const rounded = value >= 100 ? Math.round(value).toLocaleString("en-US") : value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  const plural = Number(rounded.replace(/,/g, "")) === 1 ? "" : "s";
  return `${rounded} ${chosen[0]}${plural}`;
}

// ---------------------------------------------------------------- estimating human-made passwords

export interface Dictionaries {
  /** Most common passwords, most common first. */
  common: readonly string[];
  /** Plain words (the passphrase list). */
  words: readonly string[];
}

export interface Piece {
  /** What the matched part is, in plain words. */
  kind: "common" | "word" | "keyboard" | "sequence" | "repeat" | "year" | "digits" | "random";
  text: string;
  bits: number;
}

export interface Estimate {
  bits: number;
  /** Bits if every character were random from the characters used: the ceiling, rarely reached by human passwords. */
  ceilingBits: number;
  pieces: Piece[];
  warnings: string[];
  suggestions: string[];
}

const LEET: Record<string, string[]> = { "@": ["a"], "4": ["a"], "8": ["b"], "3": ["e"], "1": ["i", "l"], "!": ["i"], "0": ["o"], $: ["s"], "5": ["s"], "7": ["t"], "+": ["t"], "2": ["z"] };
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "qazwsxedcrfvtgbyhnujmikolp"];

/** Number of classes (lower, upper, digit, symbol) used, as the size of the pool a brute-force attacker needs. */
function poolSize(text: string): number {
  let pool = 0;
  if (/[a-z]/.test(text)) pool += 26;
  if (/[A-Z]/.test(text)) pool += 26;
  if (/\d/.test(text)) pool += 10;
  if (/[^A-Za-z0-9]/.test(text)) pool += 33;
  return pool || 1;
}

const log2 = Math.log2;

/** Extra bits for how a word is written: Capitalised and ALL CAPS are cheap, odd mixtures cost more. */
function caseBits(text: string): number {
  if (text === text.toLowerCase()) return 0;
  if (/^[A-Z][^A-Z]*$/.test(text) || text === text.toUpperCase()) return 1;
  const uppers = (text.match(/[A-Z]/g) ?? []).length;
  return log2(Math.max(2, uppers * 2));
}

function deLeet(text: string): { plain: string; swaps: number } | null {
  let swaps = 0;
  let plain = "";
  for (const ch of text.toLowerCase()) {
    const sub = LEET[ch];
    if (sub) {
      plain += sub[0];
      swaps++;
    } else plain += ch;
  }
  return swaps ? { plain, swaps } : null;
}

/**
 * Estimate how many guesses an attacker who knows common passwords, words and common patterns
 * would need. This is a rough, deliberately simple model (in the spirit of zxcvbn): it splits the
 * password into the cheapest-to-guess pieces and adds up their cost. It knows about 10,000 common
 * passwords and 7,776 words, so a password made of uncommon words can score higher than it deserves.
 */
export function estimatePassword(password: string, dictionaries: Dictionaries): Estimate {
  const n = password.length;
  const commonRank = new Map<string, number>();
  dictionaries.common.forEach((word, index) => {
    if (!commonRank.has(word)) commonRank.set(word, index + 1);
  });
  const wordRank = new Map<string, number>();
  dictionaries.words.forEach((word, index) => wordRank.set(word, 12_000 + index));

  const ceilingBits = n * log2(poolSize(password));
  if (!n) return { bits: 0, ceilingBits: 0, pieces: [], warnings: [], suggestions: [] };

  // Candidate pieces: starting at i, covering `length` characters.
  const candidates: (Piece & { start: number; end: number })[] = [];
  const add = (start: number, end: number, kind: Piece["kind"], bits: number) => candidates.push({ start, end, kind, text: password.slice(start, end), bits });

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j <= n; j++) {
      const text = password.slice(i, j);
      const lower = text.toLowerCase();
      // Dictionary hits, plain and with common character swaps (p@ssw0rd).
      const rank = commonRank.get(lower);
      if (rank !== undefined) add(i, j, "common", log2(rank) + caseBits(text));
      else {
        const word = wordRank.get(lower);
        if (word !== undefined && text.length >= 3) add(i, j, "word", log2(word) + caseBits(text));
      }
      const swapped = deLeet(text);
      if (swapped) {
        const swappedRank = commonRank.get(swapped.plain);
        const swappedWord = wordRank.get(swapped.plain);
        const base = swappedRank ?? swappedWord;
        if (base !== undefined && text.length >= 3) add(i, j, swappedRank !== undefined ? "common" : "word", log2(base) + caseBits(text) + 1 + Math.min(2, swapped.swaps - 1));
      }
      if (text.length >= 4) {
        // Keyboard walks, forwards or backwards.
        for (const row of KEYBOARD_ROWS) if (row.includes(lower) || [...row].reverse().join("").includes(lower)) add(i, j, "keyboard", log2(60 * text.length));
        // Sequences: abcd, 4321.
        const step = lower.charCodeAt(1) - lower.charCodeAt(0);
        if ((step === 1 || step === -1) && [...lower].every((ch, k) => k === 0 || ch.charCodeAt(0) - lower.charCodeAt(k - 1) === step)) add(i, j, "sequence", log2(26 * text.length * 2));
        // Repeats: aaaa, abcabc.
        for (let size = 1; size <= text.length / 2; size++) {
          if (text.length % size === 0 && text.slice(0, size).repeat(text.length / size) === text) {
            const unit = text.slice(0, size);
            add(i, j, "repeat", log2(2 ** Math.min(30, size * log2(poolSize(unit) || 1) + 1)) + log2(text.length / size));
            break;
          }
        }
      }
      if (/^(19|20)\d\d$/.test(text)) add(i, j, "year", log2(120));
      if (/^\d+$/.test(text) && text.length >= 2) add(i, j, "digits", text.length * log2(10));
    }
  }
  // Anything unmatched costs the brute-force price of its own characters.
  // A lone separator between words (space, dash, dot...) is one of a handful of likely choices.
  for (let i = 0; i < n; i++) add(i, i + 1, "random", " -_.,;:/".includes(password[i]) ? 3 : log2(poolSize(password[i])));

  // Cheapest cover of the whole password (dynamic programming over positions).
  const best: { bits: number; from: number; piece?: Piece }[] = Array.from({ length: n + 1 }, () => ({ bits: Infinity, from: -1 }));
  best[0].bits = 0;
  for (let end = 1; end <= n; end++) {
    for (const piece of candidates) {
      if (piece.end !== end || best[piece.start].bits === Infinity) continue;
      // One bit per piece covers the ordering of pieces.
      const total = best[piece.start].bits + piece.bits + 1;
      if (total < best[end].bits) best[end] = { bits: total, from: piece.start, piece };
    }
  }
  const pieces: Piece[] = [];
  for (let at = n; at > 0; at = best[at].from) pieces.unshift(best[at].piece!);
  // Merge neighbouring single random characters into one readable piece.
  const merged: Piece[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && last.kind === "random" && piece.kind === "random") {
      last.text += piece.text;
      last.bits += piece.bits;
    } else merged.push({ ...piece });
  }

  const bits = Math.min(best[n].bits, ceilingBits);

  const warnings: string[] = [];
  const suggestions: string[] = [];
  const whole = commonRank.get(password.toLowerCase());
  if (whole !== undefined) warnings.push(whole <= 100 ? "This is one of the 100 most common passwords." : `This is a very common password (about number ${whole.toLocaleString("en-US")} on a list of the most common).`);
  else if (merged.length === 1 && merged[0].kind === "common") warnings.push("This is a common password with a simple change. Attackers try those first.");
  if (merged.some((piece) => piece.kind === "keyboard")) warnings.push("Keyboard patterns like qwerty or asdf are among the first things tried.");
  if (merged.some((piece) => piece.kind === "sequence")) warnings.push("Runs like abcd or 1234 are easy to guess.");
  if (merged.some((piece) => piece.kind === "repeat")) warnings.push("Repeated characters add almost nothing.");
  if (merged.some((piece) => piece.kind === "year")) warnings.push("Years and birth dates are easy to guess.");
  if (n < 12) suggestions.push("Longer is stronger: aim for at least 12 characters, or four random words.");
  if (merged.some((piece) => piece.kind === "common" || piece.kind === "word")) suggestions.push("Avoid words, even with letters swapped for symbols (p@ssw0rd). Use random characters or a random passphrase from the generator.");
  if (bits < 60) suggestions.push("Do not use this password for email, banking or anything you cannot afford to lose.");
  suggestions.push("Use a different password for every site, and a password manager to remember them.");

  return { bits, ceilingBits, pieces: merged, warnings, suggestions };
}
