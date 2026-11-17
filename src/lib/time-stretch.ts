/**
 * Streaming time-stretch that keeps the pitch (WSOLA: waveform-similarity overlap-add), used by
 * the Video Speed tool. Any ratio from 0.25x to 4x works in one pass, so there is no need to chain
 * stages the way ffmpeg's atempo (0.5x-2x per filter) requires.
 *
 * Push planar float audio in any chunk size; read stretched audio out. Every channel uses the same
 * splice points (chosen on the channel mix), so stereo stays aligned. Pure math, no DOM.
 */
export class TimeStretcher {
  private readonly frame: number;
  private readonly hopOut: number;
  private readonly hopIn: number;
  private readonly seek: number;
  private readonly window: Float32Array;
  /** Input not yet consumed, per channel. */
  private input: Float32Array[];
  /** Overlap-add accumulator, per channel (length = frame). */
  private tail: Float32Array[];
  /** Nominal read position (in samples) of the next analysis frame, relative to `input[0]`. */
  private nominal = 0;
  /** Where the previous chosen frame started, relative to `input[0]` (for the similarity target). */
  private previous = -1;
  private started = false;

  constructor(
    readonly sampleRate: number,
    readonly channels: number,
    readonly speed: number,
  ) {
    this.frame = Math.max(64, Math.round(sampleRate * 0.04)) & ~1;
    this.hopOut = this.frame / 2;
    this.hopIn = this.hopOut * speed;
    this.seek = Math.round(sampleRate * 0.012);
    this.window = new Float32Array(this.frame);
    // Periodic Hann: two windows at 50% overlap sum to exactly 1.
    for (let i = 0; i < this.frame; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.frame);
    this.input = Array.from({ length: channels }, () => new Float32Array(0));
    this.tail = Array.from({ length: channels }, () => new Float32Array(this.frame));
  }

  /** Add input; returns the stretched audio that is now complete (may be empty). */
  push(planes: Float32Array[]): Float32Array[] {
    this.input = this.input.map((buffer, c) => {
      const joined = new Float32Array(buffer.length + planes[c].length);
      joined.set(buffer);
      joined.set(planes[c], buffer.length);
      return joined;
    });
    return this.run(false);
  }

  /** Emit whatever is left (call once at the end). */
  flush(): Float32Array[] {
    return this.run(true);
  }

  /** Channel mix of the current input, rebuilt once per `run`. */
  private mono = new Float32Array(0);

  private score(target: number, candidate: number, step: number): number {
    const m = this.mono;
    let sum = 0;
    for (let i = 0; i < this.hopOut; i += step) sum += (m[target + i] ?? 0) * (m[candidate + i] ?? 0);
    return sum;
  }

  /** Offset in [-seek, seek] whose frame start best continues the previous frame: coarse search, then refine. */
  private bestOffset(nominal: number): number {
    if (this.previous < 0) return 0;
    const target = this.previous + this.hopOut;
    const from = Math.max(-this.seek, -nominal);
    let best = 0;
    let bestScore = -Infinity;
    for (let offset = from; offset <= this.seek; offset += 4) {
      const value = this.score(target, nominal + offset, 4);
      if (value > bestScore) {
        bestScore = value;
        best = offset;
      }
    }
    const coarse = best;
    bestScore = -Infinity;
    for (let offset = Math.max(from, coarse - 3); offset <= Math.min(this.seek, coarse + 3); offset++) {
      const value = this.score(target, nominal + offset, 1);
      if (value > bestScore) {
        bestScore = value;
        best = offset;
      }
    }
    return best;
  }

  private run(final: boolean): Float32Array[] {
    const outputs: Float32Array[][] = Array.from({ length: this.channels }, () => []);
    const available = this.input[0].length;
    this.mono = new Float32Array(available);
    for (const plane of this.input) for (let i = 0; i < available; i++) this.mono[i] += plane[i];
    while (true) {
      const nominal = Math.round(this.nominal);
      const needed = nominal + this.seek + this.frame;
      if (needed > available && !(final && nominal < available)) break;
      const offset = this.bestOffset(nominal);
      const start = Math.max(0, nominal + offset);
      for (let c = 0; c < this.channels; c++) {
        const plane = this.input[c];
        const acc = this.tail[c];
        for (let i = 0; i < this.frame; i++) acc[i] += (plane[start + i] ?? 0) * this.window[i];
        // The first half is now complete: emit it and shift the accumulator.
        outputs[c].push(acc.slice(0, this.hopOut));
        acc.copyWithin(0, this.hopOut);
        acc.fill(0, this.frame - this.hopOut);
      }
      // The very first half-frame has only one window over it: skip it so the start is not faded in.
      if (!this.started) {
        this.started = true;
        for (const list of outputs) list.pop();
      }
      this.previous = start;
      this.nominal += this.hopIn;
    }
    // Drop input that no future frame can reach.
    const keepFrom = Math.max(0, Math.min(Math.floor(this.nominal) - this.seek, this.previous));
    if (keepFrom > 0) {
      this.input = this.input.map((plane) => plane.slice(keepFrom));
      this.nominal -= keepFrom;
      this.previous -= keepFrom;
    }
    return outputs.map((list) => {
      const total = list.reduce((sum, part) => sum + part.length, 0);
      const out = new Float32Array(total);
      let at = 0;
      for (const part of list) {
        out.set(part, at);
        at += part.length;
      }
      return out;
    });
  }
}

/** Frames to keep when speeding up, so the output stays at a sensible rate (at most `maxFps`). */
export function keepFrame(newTimestamp: number, lastKept: number | null, maxFps: number): boolean {
  return lastKept === null || newTimestamp - lastKept >= 1 / maxFps - 1e-6;
}

export const SPEEDS = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3, 4] as const;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
