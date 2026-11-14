/** Tool 10: Collage Maker. Grid layouts with spacing, rounded corners and a background colour. */
import { IMAGE_MIMES } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas, roundedRect, scaleToCanvas } from "@/lib/image-utils";
import type { OptionValues, Tool } from "../types";

/** Cell shapes as width / height. */
const SHAPES: Record<string, number> = { square: 1, landscape: 4 / 3, portrait: 3 / 4, wide: 16 / 9 };

export interface CollageLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  radius: number;
  /** One rectangle per photo, in output pixels. */
  cells: { x: number; y: number; w: number; h: number }[];
}

/**
 * Grid geometry for a collage. Shared by the renderer and the Stage overlay that
 * lets you drag one photo onto another to swap them, so both always agree.
 */
export function collageLayout(count: number, options: OptionValues): CollageLayout {
  const columns = Math.max(1, options.columns === "auto" ? Math.ceil(Math.sqrt(count)) : Math.min(count, Number(options.columns)));
  const rows = Math.ceil(count / columns);
  const width = Number(options.width);
  // Spacing and radius are given at a 2000px reference, so they look the same at any export width.
  const unit = width / 2000;
  const gap = Number(options.spacing) * unit;
  const cellW = (width - gap * (columns + 1)) / columns;
  const cellH = cellW / (SHAPES[String(options.shape)] ?? 1);
  const cells = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns);
    const inRow = row === rows - 1 ? count - row * columns : columns;
    // Centre a short last row.
    const offset = ((columns - inRow) * (cellW + gap)) / 2;
    return { x: gap + offset + (i % columns) * (cellW + gap), y: gap + row * (cellH + gap), w: cellW, h: cellH };
  });
  return { width, height: rows * cellH + gap * (rows + 1), columns, rows, radius: Number(options.radius) * unit, cells };
}

export const collage: Tool = {
  id: 10,
  slug: "collage-maker",
  name: "Collage Maker",
  verb: "Make Collage",
  category: "image",
  description: "Arrange photos in a grid. Adjust spacing, corner radius and background, then export a PNG.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "Collage Maker: photo grid collages in your browser",
  seoDescription:
    "Make a photo collage on your device. Choose a grid, spacing, rounded corners and background colour, drag to reorder, export PNG. No upload.",
  howTo: [
    "Drop two or more photos on the Stage.",
    "Drag the photos in the list to swap their places. Pick the grid, spacing and corners; the preview follows.",
    "Download the collage as a PNG.",
  ],
  faqs: [
    { q: "Is my file uploaded anywhere?", a: "No. The file is opened and processed inside your browser tab. Krea has no server to receive it, and it is cleared when you press Wipe session or close the tab." },
    { q: "How do I change the order of the photos?", a: "Drag a photo on the collage preview onto another photo to swap them, or reorder the files in the list above it." },
    { q: "What size is the finished collage?", a: "Choose 1200, 2000 or 3000 pixels wide. The height follows from the number of rows and the cell shape." },
    { q: "Can I make rounded corners and a coloured background?", a: "Yes. Corner radius and spacing are sliders, and the background can be any colour." },
  ],
  icon: "collage",
  worker: "image",
  input: "all",
  minFiles: 2,
  live: true,
  fields: [
    {
      key: "columns",
      label: "Columns",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Auto" },
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
    },
    {
      key: "shape",
      label: "Cell shape",
      type: "select",
      default: "square",
      options: [
        { value: "square", label: "Square" },
        { value: "landscape", label: "Landscape 4:3" },
        { value: "portrait", label: "Portrait 3:4" },
        { value: "wide", label: "Wide 16:9" },
      ],
    },
    { key: "spacing", label: "Spacing", type: "slider", min: 0, max: 80, step: 2, unit: "px", default: 24 },
    { key: "radius", label: "Corner radius", type: "slider", min: 0, max: 120, step: 4, unit: "px", default: 24 },
    { key: "background", label: "Background", type: "color", default: "#ffffff" },
    {
      key: "width",
      label: "Export width",
      type: "select",
      default: "2000",
      options: [
        { value: "1200", label: "1200 px" },
        { value: "2000", label: "2000 px" },
        { value: "3000", label: "3000 px" },
      ],
    },
  ],

  async run(inputs, options, ctx) {
    const count = inputs.length;
    const layout = collageLayout(count, options);
    const { width, height, cells } = layout;

    const { canvas, ctx: draw } = createCanvas(width, height);
    draw.fillStyle = String(options.background);
    draw.fillRect(0, 0, width, height);

    for (let i = 0; i < count; i++) {
      ctx.progress(i / count, `Placing photo ${i + 1} of ${count}`);
      const { x, y, w: cellW, h: cellH } = cells[i];
      const radius = layout.radius;

      // One photo decoded at a time keeps memory flat however many are added.
      const bitmap = await decodeImage(inputs[i]);
      const ratio = cellW / cellH;
      const cropW = Math.min(bitmap.width, bitmap.height * ratio);
      const cropH = cropW / ratio;
      const cell = scaleToCanvas(bitmap, cellW, cellH, {
        x: (bitmap.width - cropW) / 2,
        y: (bitmap.height - cropH) / 2,
        w: cropW,
        h: cropH,
      });
      bitmap.close();

      draw.save();
      roundedRect(draw, x, y, cellW, cellH, radius);
      draw.clip();
      draw.drawImage(cell.canvas, x, y, cellW, cellH);
      draw.restore();
    }

    return {
      files: [{ name: "collage.png", type: "image/png", blob: await encodeCanvas(canvas, "image/png") }],
      note: `${count} photos in a ${layout.columns} x ${layout.rows} grid, ${canvas.width} x ${canvas.height} px.`,
    };
  },
};
