/**
 * Tool 45: Crop PDF. Trims margins off pages by setting their page boxes
 * (MediaBox, CropBox, TrimBox, BleedBox, ArtBox), so every reader and printer
 * shows the same smaller page. Margins are given as the page looks on screen,
 * so rotated pages are handled. The trimmed content is hidden, not deleted:
 * Redact PDF removes content for real.
 */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { loadPdf, parsePageList, pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

const MM = 72 / 25.4;
/** Smallest page Krea will leave behind, in points (about 1.3 cm). */
const MIN_SIDE = 36;

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Margins as seen on screen to margins on the unrotated page. Readers turn a
 * page clockwise by its /Rotate, so for 90° the visible top is the page's left edge.
 */
export function unrotateMargins(visible: Margins, rotation: number): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const { top, right, bottom, left } = visible;
  switch (rotation) {
    case 90:
      return { xMin: top, yMax: right, xMax: bottom, yMin: left };
    case 180:
      return { yMin: top, xMin: right, yMax: bottom, xMax: left };
    case 270:
      return { xMax: top, yMin: right, xMin: bottom, yMax: left };
    default:
      return { xMin: left, xMax: right, yMax: top, yMin: bottom };
  }
}

export const cropPdf: Tool = {
  id: 45,
  slug: "crop-pdf",
  name: "Crop PDF",
  verb: "Crop PDF",
  category: "pdf",
  description: "Trim white margins, headers or scanner borders off PDF pages.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Crop PDF: trim margins off PDF pages in your browser",
  seoDescription:
    "Crop PDF pages by trimming the top, bottom and side margins in millimetres or percent, on every page or only some. Works offline, no upload.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Enter how much to trim from each side, in millimetres or percent of the page. Optionally choose only some pages.",
    "Crop and download. Rotated pages are trimmed as they look on screen.",
  ],
  faqs: [
    { q: "Is the cropped part deleted?", a: "No. Cropping changes the page size that readers and printers show, but the text and images outside it are still inside the file and can be recovered. To remove something for good, use Redact PDF." },
    { q: "Millimetres or percent?", a: "Millimetres trim the same amount from every page. Percent follows each page's size, which is handy when a PDF mixes A4 and Legal pages." },
    { q: "Can I crop only some pages?", a: "Yes. Type the pages, for example 1-3, 7. Leave it empty to crop every page." },
    { q: "Is my PDF uploaded?", a: "No. Krea changes the page boxes inside your browser." },
  ],
  icon: "pdfcrop",
  worker: "pdf",
  input: "each",
  fields: [
    {
      key: "unit",
      label: "Unit",
      type: "select",
      default: "mm",
      options: [
        { value: "mm", label: "Millimetres" },
        { value: "percent", label: "Percent of the page" },
      ],
    },
    { key: "top", label: "Top", type: "number", min: 0, max: 500, step: 1, default: 10 },
    { key: "bottom", label: "Bottom", type: "number", min: 0, max: 500, step: 1, default: 10 },
    { key: "left", label: "Left", type: "number", min: 0, max: 500, step: 1, default: 10 },
    { key: "right", label: "Right", type: "number", min: 0, max: 500, step: 1, default: 10 },
    { key: "pages", label: "Pages", type: "pages", default: "", hint: "Leave empty to crop every page." },
  ],
  presets: [
    { id: "trim5", label: "Trim 5 mm", hint: "Thin scanner border", values: { unit: "mm", top: 5, bottom: 5, left: 5, right: 5 } },
    { id: "trim15", label: "Trim 15 mm", hint: "Wide white margins", values: { unit: "mm", top: 15, bottom: 15, left: 15, right: 15 } },
    { id: "band", label: "Cut header and footer", hint: "8% off top and bottom", values: { unit: "percent", top: 8, bottom: 8, left: 0, right: 0 } },
  ],

  async run([file], options, ctx) {
    const { PDFName, PDFNumber } = await import("pdf-lib");
    const asked = { top: Number(options.top), right: Number(options.right), bottom: Number(options.bottom), left: Number(options.left) };
    if (Object.values(asked).some((value) => !Number.isFinite(value) || value < 0)) throw new KreaError("failed", "Margins must be zero or more.");
    if (Object.values(asked).every((value) => value === 0)) throw new KreaError("failed", "Walang ita-trim: all four margins are 0. Enter how much to cut from at least one side.");
    const percent = options.unit === "percent";
    if (percent && (asked.top + asked.bottom >= 95 || asked.left + asked.right >= 95)) {
      throw new KreaError("failed", "Opposite margins add up to almost the whole page. Keep them under 95% together.");
    }

    const pdf = await loadPdf(file);
    const targets = parsePageList(String(options.pages), pdf.getPageCount());

    // Check every page first, so a refusal never leaves a half-cropped file.
    const plans = targets.map((index) => {
      const page = pdf.getPage(index);
      const label = `Page ${index + 1}`;
      const rotation = ((page.getRotation().angle % 360) + 360) % 360;
      if (rotation % 90 !== 0) throw new KreaError("failed", `${label} is rotated by ${rotation}°, not a quarter turn, so Krea cannot tell which side is the top.`);
      const unit = page.node.get(PDFName.of("UserUnit"));
      if (unit instanceof PDFNumber && unit.asNumber() !== 1) throw new KreaError("failed", `${label} uses a custom page unit (UserUnit ${unit.asNumber()}), so millimetres would not match. Use percent instead.`);
      const media = page.getMediaBox();
      const crop = page.getCropBox();
      const x = Math.max(media.x, crop.x);
      const y = Math.max(media.y, crop.y);
      const w = Math.min(media.x + media.width, crop.x + crop.width) - x;
      const h = Math.min(media.y + media.height, crop.y + crop.height) - y;
      if (!(w > 0 && h > 0)) throw new KreaError("corrupted", `${label} has a visible area that does not overlap its page size, so it cannot be cropped.`);
      // Percent is of the page as seen: for a page turned a quarter, the visible width is the page's height.
      const visibleW = rotation % 180 === 0 ? w : h;
      const visibleH = rotation % 180 === 0 ? h : w;
      const toPt = (value: number, along: number) => (percent ? (value / 100) * along : value * MM);
      const visible = { top: toPt(asked.top, visibleH), bottom: toPt(asked.bottom, visibleH), left: toPt(asked.left, visibleW), right: toPt(asked.right, visibleW) };
      const m = unrotateMargins(visible, rotation);
      const box = { x: x + m.xMin, y: y + m.yMin, width: w - m.xMin - m.xMax, height: h - m.yMin - m.yMax };
      if (box.width < MIN_SIDE || box.height < MIN_SIDE) {
        throw new KreaError("failed", `${label} is ${Math.round(visibleW / MM)} × ${Math.round(visibleH / MM)} mm, so these margins would leave almost nothing. Use smaller margins.`);
      }
      return { page, box };
    });

    plans.forEach(({ page, box }, done) => {
      ctx.progress(done / plans.length, "Cropping");
      const { x, y, width, height } = box;
      page.setMediaBox(x, y, width, height);
      page.setCropBox(x, y, width, height);
      page.setTrimBox(x, y, width, height);
      page.setBleedBox(x, y, width, height);
      page.setArtBox(x, y, width, height);
    });

    ctx.progress(0.95, "Saving");
    const all = targets.length === pdf.getPageCount();
    return {
      files: [{ name: renameFile(file.name, "pdf", "-cropped"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `${all ? "All" : targets.length} ${targets.length === 1 ? "page" : "pages"} cropped. The trimmed part is hidden, not deleted: use Redact PDF to remove content for good.`,
    };
  },
};
