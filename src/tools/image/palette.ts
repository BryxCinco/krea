/** Tool 9: Color Palette Extractor. Dominant colours via median cut, with HEX, RGB and HSL. */
import { IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas, scaleToCanvas } from "@/lib/image-utils";
import type { PaletteColor, Tool } from "../types";

type Pixel = [number, number, number];

/** Median cut: repeatedly split the box of pixels with the widest colour range at its median. */
function medianCut(pixels: Pixel[], count: number): { color: Pixel; size: number }[] {
  let boxes: Pixel[][] = [pixels];
  while (boxes.length < count) {
    // Pick the box with the largest spread on any channel.
    let pick = -1;
    let pickChannel = 0;
    let widest = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let channel = 0; channel < 3; channel++) {
        let min = 255;
        let max = 0;
        for (const pixel of box) {
          if (pixel[channel] < min) min = pixel[channel];
          if (pixel[channel] > max) max = pixel[channel];
        }
        if (max - min > widest) {
          widest = max - min;
          pick = index;
          pickChannel = channel;
        }
      }
    });
    if (pick < 0) break; // every box is a single colour
    const box = boxes[pick].sort((a, b) => a[pickChannel] - b[pickChannel]);
    const half = box.length >> 1;
    boxes = [...boxes.slice(0, pick), box.slice(0, half), box.slice(half), ...boxes.slice(pick + 1)];
  }
  return boxes
    .map((box) => {
      const sum = [0, 0, 0];
      for (const pixel of box) for (let c = 0; c < 3; c++) sum[c] += pixel[c];
      return { color: sum.map((value) => Math.round(value / box.length)) as Pixel, size: box.length };
    })
    .sort((a, b) => b.size - a.size);
}

const toHex = ([r, g, b]: Pixel) => `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

function toHsl([r, g, b]: Pixel): string {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
  return `hsl(${Math.round((hue * 60 + 360) % 360)}, ${Math.round(saturation * 100)}%, ${Math.round(light * 100)}%)`;
}

export const palette: Tool = {
  id: 9,
  slug: "color-palette-extractor",
  name: "Color Palette Extractor",
  verb: "Extract Palette",
  category: "image",
  description: "Pull the dominant colours out of any image. Copy HEX, RGB or HSL, or export the palette.",
  accepts: IMAGE_MIMES,
  output: "data",
  seoTitle: "Color Palette Extractor: get HEX, RGB and HSL from an image",
  seoDescription:
    "Extract the dominant colours from a photo in your browser. Click to copy HEX, RGB or HSL and export the palette as PNG or JSON. No upload.",
  howTo: [
    "Drop an image on the Stage.",
    "Choose how many colours you want. The palette updates right away.",
    "Tap a swatch to copy its code, or download the palette as an image or JSON.",
  ],
  faqs: [
    { q: "Is my file uploaded anywhere?", a: "No. The file is opened and processed inside your browser tab. Krea has no server to receive it, and it is cleared when you press Wipe session or close the tab." },
    { q: "How are the colours chosen?", a: "Krea groups similar pixels together (median cut) and shows the main colour of each group, sorted by how much of the image it covers." },
    { q: "How do I copy a colour code?", a: "Tap a swatch to copy its HEX code, or use the HEX, RGB and HSL buttons under it." },
    { q: "Can I save the palette?", a: "Yes. The download includes a PNG of the swatches and a JSON file with every colour in all three formats." },
  ],
  icon: "palette",
  worker: "image",
  input: "each",
  live: true,
  fields: [{ key: "count", label: "Colours", type: "slider", min: 3, max: 12, step: 1, default: 6 }],

  async run([file], options) {
    const bitmap = await decodeImage(file);
    // A small copy is plenty for colour statistics and keeps this instant.
    const factor = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
    const small = scaleToCanvas(bitmap, bitmap.width * factor, bitmap.height * factor);
    bitmap.close();
    const { data } = small.ctx.getImageData(0, 0, small.canvas.width, small.canvas.height);

    const pixels: Pixel[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 127) pixels.push([data[i], data[i + 1], data[i + 2]]); // skip transparent pixels
    }
    if (pixels.length === 0) pixels.push([0, 0, 0]);

    const total = pixels.length;
    const colors: PaletteColor[] = medianCut(pixels, Number(options.count)).map(({ color, size }) => ({
      hex: toHex(color),
      rgb: `rgb(${color.join(", ")})`,
      hsl: toHsl(color),
      share: size / total,
    }));

    // Palette image: one tall swatch per colour with its HEX code underneath.
    const swatchW = 220;
    const swatchH = 280;
    const label = 64;
    const sheet = createCanvas(swatchW * colors.length, swatchH + label);
    sheet.ctx.fillStyle = "#ffffff";
    sheet.ctx.fillRect(0, 0, sheet.canvas.width, sheet.canvas.height);
    sheet.ctx.font = "600 26px ui-monospace, Consolas, monospace";
    sheet.ctx.textAlign = "center";
    sheet.ctx.textBaseline = "middle";
    colors.forEach((color, index) => {
      sheet.ctx.fillStyle = color.hex;
      sheet.ctx.fillRect(index * swatchW, 0, swatchW, swatchH);
      sheet.ctx.fillStyle = "#111111";
      sheet.ctx.fillText(color.hex, index * swatchW + swatchW / 2, swatchH + label / 2);
    });

    const json = JSON.stringify({ source: file.name, colors }, null, 2);
    return {
      files: [
        { name: renameFile(file.name, "png", "-palette"), type: "image/png", blob: await encodeCanvas(sheet.canvas, "image/png") },
        { name: renameFile(file.name, "json", "-palette"), type: "application/json", blob: new Blob([json], { type: "application/json" }) },
      ],
      view: { type: "palette", colors },
    };
  },
};
