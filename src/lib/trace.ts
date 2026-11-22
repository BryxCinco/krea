/**
 * Raster to vector tracing for Image to SVG (tool 62). Pure functions over RGBA
 * pixels: no DOM, safe in a worker.
 *
 * 1. Colours: k-means in RGB (deterministic seeds) for colour mode, or an Otsu
 *    threshold for black and white. Transparent pixels are left out.
 * 2. A 3x3 majority filter removes single-pixel specks.
 * 3. Each colour's region is outlined along pixel edges into closed loops (holes
 *    become separate loops; fill-rule evenodd cuts them out).
 * 4. Loops are simplified (collinear points, then Ramer-Douglas-Peucker) and
 *    optionally drawn as smooth quadratic curves through edge midpoints.
 */

export interface TraceOptions {
  mode: "color" | "bw";
  /** Number of colours in colour mode (2-16). */
  colors: number;
  /** Simplification tolerance in pixels of the traced image (0.3-2). */
  tolerance: number;
  smooth: boolean;
  /** Drop the colour that covers most of the border (a plain background). */
  removeBackground: boolean;
}

export interface TraceResult {
  svg: string;
  colors: string[];
  paths: number;
}

type RGB = [number, number, number];

const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const dist2 = (a: RGB, r: number, g: number, b: number) => (a[0] - r) ** 2 + (a[1] - g) ** 2 + (a[2] - b) ** 2;

/** Pixel labels: palette index per pixel, -1 for transparent. */
export interface Labels {
  labels: Int16Array;
  palette: RGB[];
}

/** k-means colour quantization with farthest-point seeding on a pixel sample. */
export function quantize(data: Uint8ClampedArray, width: number, height: number, k: number): Labels {
  const total = width * height;
  const labels = new Int16Array(total).fill(-1);
  const step = Math.max(1, Math.floor(total / 40_000));
  const sample: RGB[] = [];
  for (let i = 0; i < total; i += step) if (data[i * 4 + 3] >= 128) sample.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  if (!sample.length) return { labels, palette: [] };

  // Seeds: the mean colour first, then repeatedly the sample farthest from every seed.
  const mean: RGB = [0, 0, 0];
  for (const c of sample) for (let j = 0; j < 3; j++) mean[j] += c[j] / sample.length;
  const centers: RGB[] = [mean];
  const nearest = new Float64Array(sample.length).fill(Infinity);
  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let far = -1;
    let farDist = 0;
    sample.forEach((c, i) => {
      nearest[i] = Math.min(nearest[i], dist2(last, c[0], c[1], c[2]));
      if (nearest[i] > farDist) {
        farDist = nearest[i];
        far = i;
      }
    });
    if (far < 0 || farDist < 1) break; // fewer distinct colours than asked
    centers.push([...sample[far]] as RGB);
  }

  const assign = (r: number, g: number, b: number) => {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centers.length; c++) {
      const d = dist2(centers[c], r, g, b);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  };
  for (let iteration = 0; iteration < 12; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of sample) {
      const s = sums[assign(c[0], c[1], c[2])];
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
      s[3]++;
    }
    let moved = 0;
    sums.forEach((s, i) => {
      if (!s[3]) return;
      const next: RGB = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
      moved += dist2(centers[i], next[0], next[1], next[2]);
      centers[i] = next;
    });
    if (moved < 1) break;
  }
  for (let i = 0; i < total; i++) if (data[i * 4 + 3] >= 128) labels[i] = assign(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  return { labels, palette: centers };
}

/** Black and white: dark pixels (by Otsu's threshold on luminance) become black shapes; the rest is transparent. */
export function threshold(data: Uint8ClampedArray, width: number, height: number): Labels {
  const total = width * height;
  const luma = new Uint8Array(total);
  const histogram = new Float64Array(256);
  let opaque = 0;
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] < 128) continue;
    const y = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    luma[i] = y;
    histogram[y]++;
    opaque++;
  }
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * histogram[t];
  let sumBack = 0;
  let weightBack = 0;
  let best = 0;
  let cut = 128;
  for (let t = 0; t < 256; t++) {
    weightBack += histogram[t];
    if (!weightBack) continue;
    const weightFore = opaque - weightBack;
    if (!weightFore) break;
    sumBack += t * histogram[t];
    const between = weightBack * weightFore * (sumBack / weightBack - (sumAll - sumBack) / weightFore) ** 2;
    if (between > best) {
      best = between;
      cut = t;
    }
  }
  const labels = new Int16Array(total).fill(-1);
  for (let i = 0; i < total; i++) if (data[i * 4 + 3] >= 128 && luma[i] <= cut) labels[i] = 0;
  return { labels, palette: [[0, 0, 0]] };
}

/** One pass of a 3x3 majority filter: a pixel takes the most common label around it when that label has 5 or more votes. */
export function despeckle(labels: Int16Array, width: number, height: number): Int16Array {
  const out = labels.slice();
  const counts = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      counts.clear();
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const label = labels[yy * width + xx];
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
      }
      let top = labels[y * width + x];
      let topCount = 0;
      for (const [label, count] of counts) {
        if (count > topCount) {
          topCount = count;
          top = label;
        }
      }
      if (topCount >= 5) out[y * width + x] = top;
    }
  }
  return out;
}

type Point = [number, number];

/** Closed outlines of every pixel with `label`, along pixel edges, clockwise around filled areas. */
export function outline(labels: Int16Array, width: number, height: number, label: number): Point[][] {
  const stride = width + 1;
  const outA = new Int32Array(stride * (height + 1)).fill(-1);
  const outB = new Int32Array(stride * (height + 1)).fill(-1);
  const starts: number[] = [];
  const add = (from: number, to: number) => {
    if (outA[from] < 0) {
      outA[from] = to;
      starts.push(from);
    } else outB[from] = to;
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === label;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (labels[y * width + x] !== label) continue;
      const v = y * stride + x;
      if (!inside(x, y - 1)) add(v, v + 1); // top, left to right
      if (!inside(x + 1, y)) add(v + 1, v + 1 + stride); // right, downward
      if (!inside(x, y + 1)) add(v + 1 + stride, v + stride); // bottom, right to left
      if (!inside(x - 1, y)) add(v + stride, v); // left, upward
    }
  }
  const take = (v: number) => {
    let to = outA[v];
    if (to >= 0) outA[v] = -1;
    else {
      to = outB[v];
      outB[v] = -1;
    }
    return to;
  };
  const loops: Point[][] = [];
  for (const start of starts) {
    while (outA[start] >= 0 || outB[start] >= 0) {
      const loop: Point[] = [];
      let v = start;
      do {
        loop.push([v % stride, Math.floor(v / stride)]);
        v = take(v);
      } while (v >= 0 && v !== start);
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

/** Drop points that sit on a straight line between their neighbours. */
function dropCollinear(loop: Point[]): Point[] {
  const out: Point[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = loop[(i + n - 1) % n];
    const [bx, by] = loop[i];
    const [cx, cy] = loop[(i + 1) % n];
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) out.push(loop[i]);
  }
  return out.length >= 3 ? out : loop;
}

function rdp(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let far = 0;
  let farDist = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / length;
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  if (farDist <= tolerance) return [points[0], points[points.length - 1]];
  return [...rdp(points.slice(0, far + 1), tolerance).slice(0, -1), ...rdp(points.slice(far), tolerance)];
}

/** Simplify a closed loop: split it at its farthest point pair so RDP works on two open halves. */
export function simplify(loop: Point[], tolerance: number): Point[] {
  const corners = dropCollinear(loop);
  if (corners.length <= 4 || tolerance <= 0) return corners;
  let far = 0;
  let farDist = 0;
  for (let i = 1; i < corners.length; i++) {
    const d = (corners[i][0] - corners[0][0]) ** 2 + (corners[i][1] - corners[0][1]) ** 2;
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const first = rdp(corners.slice(0, far + 1), tolerance);
  const second = rdp([...corners.slice(far), corners[0]], tolerance);
  const result = [...first.slice(0, -1), ...second.slice(0, -1)];
  return result.length >= 3 ? result : corners;
}

const num = (value: number) => String(Math.round(value * 100) / 100);

/** Path data for one loop, scaled by `scale`: straight segments, or quadratic curves through edge midpoints. */
export function loopPath(points: Point[], scale: number, smooth: boolean): string {
  const p = (point: Point) => `${num(point[0] * scale)} ${num(point[1] * scale)}`;
  if (!smooth || points.length < 4) return `M${p(points[0])}${points.slice(1).map((point) => `L${p(point)}`).join("")}Z`;
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = points.length;
  let d = `M${p(mid(points[n - 1], points[0]))}`;
  for (let i = 0; i < n; i++) d += `Q${p(points[i])} ${p(mid(points[i], points[(i + 1) % n]))}`;
  return `${d}Z`;
}

/**
 * Trace an RGBA image to SVG. `outWidth` × `outHeight` is the size written into the
 * SVG (the original image size); the pixels may be a smaller, downscaled copy.
 */
export function traceToSvg(data: Uint8ClampedArray, width: number, height: number, outWidth: number, outHeight: number, options: TraceOptions): TraceResult {
  const raw = options.mode === "bw" ? threshold(data, width, height) : quantize(data, width, height, Math.min(16, Math.max(2, Math.round(options.colors))));
  const labels = despeckle(raw.labels, width, height);
  const palette = raw.palette;

  // Area of each colour, and which one covers most of the border.
  const area = new Float64Array(palette.length);
  const border = new Float64Array(palette.length);
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label < 0) continue;
    area[label]++;
    const x = i % width;
    const y = Math.floor(i / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border[label]++;
  }
  let background = -1;
  if (options.removeBackground && options.mode === "color") {
    const perimeter = 2 * (width + height);
    const top = border.reduce((best, value, i) => (value > border[best] ? i : best), 0);
    if (border[top] > perimeter * 0.5) background = top;
  }

  const scale = outWidth / width;
  const order = palette.map((_, i) => i).filter((i) => area[i] > 0 && i !== background).sort((a, b) => area[b] - area[a]);
  // A hairline stroke in the fill colour hides the anti-aliasing seams between neighbouring colours.
  const seam = options.mode === "color" ? ` stroke-width="${num(scale * 0.6)}" stroke-linejoin="round"` : "";
  let paths = 0;
  const body = order
    .map((label) => {
      const loops = outline(labels, width, height, label);
      const d = loops.map((loop) => loopPath(simplify(loop, options.tolerance), scale, options.smooth)).join("");
      if (!d) return "";
      paths++;
      const color = hex(palette[label]);
      return `<path fill="${color}"${seam ? ` stroke="${color}"${seam}` : ""} fill-rule="evenodd" d="${d}"/>`;
    })
    .filter(Boolean)
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}">\n${body}\n</svg>\n`;
  return { svg, colors: order.map((label) => hex(palette[label])), paths };
}
