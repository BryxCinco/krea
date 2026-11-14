/**
 * The Krea mark: a pixel-art K (11 x 13 cells, Bricolage-style heavy stem and straight
 * 45-degree arms) with pixel sparkles. Same geometry as public/icons/icon.svg.
 */
export const K_WIDTH = 11;
export const K_HEIGHT = 13;

/** Filled cells of the K as [column, row]. */
export const K_PIXELS: [number, number][] = [];
for (let r = 0; r < K_HEIGHT; r++) {
  for (let c = 0; c < K_WIDTH; c++) {
    const up = r <= 6 && c >= 8 - r && c < 11 - r && c >= 2;
    const down = r >= 6 && c >= r - 4 && c < r - 1;
    if (c < 3 || up || down) K_PIXELS.push([c, r]);
  }
}

/** Sparkle pixels in half-cell units: [x, y, width, opacity]. */
export const SPARKLES: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  const star = (cx: number, cy: number, n: number) => {
    out.push([cx, cy, 1, 1]);
    for (let i = 1; i <= n; i++) {
      const o = i === n ? 0.6 : 1;
      out.push([cx - i, cy, 1, o], [cx + i, cy, 1, o], [cx, cy - i, 1, o], [cx, cy + i, 1, o]);
    }
  };
  star(16.5, 12.5, 3);
  star(20.5, 6.5, 1);
  star(19.5, 19.5, 1);
  return out;
})();
