/**
 * Myers' O(ND) difference algorithm over token arrays (lines or words).
 * Common prefix and suffix are trimmed first, and the search stops after
 * `maxEdits` edits so two unrelated documents fail fast instead of eating memory.
 */

export type DiffOp = { type: "same" | "del" | "add"; /** Index in `a` (same, del) or `b` (add). */ index: number; other?: number };

/** Returns the edit script from `a` to `b`, or null when they differ by more than `maxEdits` tokens. */
export function diffTokens(a: string[], b: string[], maxEdits = 4000): DiffOp[] | null {
  // Intern tokens so the inner loop compares integers.
  const ids = new Map<string, number>();
  const intern = (token: string) => {
    let id = ids.get(token);
    if (id === undefined) ids.set(token, (id = ids.size));
    return id;
  };
  const A = Int32Array.from(a, intern);
  const B = Int32Array.from(b, intern);

  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }

  const N = endA - start;
  const M = endB - start;
  const middle: DiffOp[] = [];
  if (N || M) {
    const max = Math.min(N + M, maxEdits);
    const offset = max + 1;
    const v = new Int32Array(2 * max + 3);
    // trace[d] is v before step d, kept for k in [-d-1, d+1].
    const trace: Int32Array[] = [];
    let found = -1;
    for (let d = 0; d <= max && found < 0; d++) {
      trace.push(v.slice(offset - d - 1, offset + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && A[start + x] === B[start + y]) {
          x++;
          y++;
        }
        v[offset + k] = x;
        if (x >= N && y >= M) {
          found = d;
          break;
        }
      }
    }
    if (found < 0) return null;

    let x = N;
    let y = M;
    for (let d = found; d >= 0; d--) {
      const snapshot = trace[d];
      const at = (k: number) => snapshot[k + d + 1];
      const k = x - y;
      const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
      const prevX = d === 0 ? 0 : at(prevK);
      const prevY = d === 0 ? 0 : prevX - prevK;
      while (x > prevX && y > prevY) {
        x--;
        y--;
        middle.push({ type: "same", index: start + x, other: start + y });
      }
      if (d > 0) {
        if (x === prevX) middle.push({ type: "add", index: start + y - 1 });
        else middle.push({ type: "del", index: start + x - 1 });
      }
      x = prevX;
      y = prevY;
    }
    middle.reverse();
  }

  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: "same", index: i, other: i });
  ops.push(...middle);
  for (let i = 0; i < A.length - endA; i++) ops.push({ type: "same", index: endA + i, other: endB + i });
  return ops;
}
