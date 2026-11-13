/** Tool 16: PDF Watermark. A text stamp with opacity, rotation, size and page selection. */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { loadPdf, parsePageList, pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

export const watermarkPdf: Tool = {
  id: 16,
  slug: "pdf-watermark",
  name: "PDF Watermark",
  verb: "Stamp PDF",
  category: "pdf",
  description: "Stamp text such as CONFIDENTIAL or your name across PDF pages.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "PDF Watermark: stamp text on PDF pages, offline",
  seoDescription:
    "Add a text watermark to a PDF in your browser. Set opacity, rotation, font size and which pages to stamp. The document never leaves your device.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Type the stamp text and set its size, opacity and angle. Pick pages, or leave it empty for all.",
    "Stamp and download the PDF.",
  ],
  icon: "stamp",
  worker: "pdf",
  input: "each",
  fields: [
    { key: "text", label: "Stamp text", type: "text", placeholder: "CONFIDENTIAL", default: "CONFIDENTIAL", hint: "Latin letters, numbers and common symbols." },
    { key: "fontSize", label: "Font size", type: "slider", min: 12, max: 160, step: 2, unit: "pt", default: 64 },
    { key: "color", label: "Colour", type: "color", default: "#c81e1e" },
    { key: "opacity", label: "Opacity", type: "slider", min: 5, max: 100, step: 5, unit: "%", default: 25 },
    { key: "rotation", label: "Rotation", type: "slider", min: -90, max: 90, step: 5, unit: "°", default: 45 },
    {
      key: "position",
      label: "Position",
      type: "select",
      default: "center",
      options: [
        { value: "center", label: "Center" },
        { value: "top", label: "Top" },
        { value: "bottom", label: "Bottom" },
        { value: "tile", label: "Tile across the page" },
      ],
    },
    { key: "pages", label: "Pages", type: "pages", default: "", hint: "Leave empty to stamp every page." },
  ],
  presets: [
    { id: "confidential", label: "CONFIDENTIAL", values: { text: "CONFIDENTIAL", rotation: 45, position: "center" } },
    { id: "draft", label: "DRAFT", values: { text: "DRAFT", rotation: 45, position: "center" } },
    { id: "copy", label: "FOR SUBMISSION ONLY", hint: "Common on ID photocopies", values: { text: "FOR SUBMISSION ONLY", rotation: 30, position: "tile", fontSize: 28 } },
  ],

  async run([file], options, ctx) {
    const { StandardFonts, rgb, degrees } = await import("pdf-lib");
    const text = String(options.text).trim();
    if (!text) throw new KreaError("failed", "I-type muna ang stamp text.");

    const pdf = await loadPdf(file);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const size = Number(options.fontSize);
    let textWidth: number;
    try {
      textWidth = font.widthOfTextAtSize(text, size);
    } catch {
      // The built-in PDF fonts only cover Latin text.
      throw new KreaError("failed", "The stamp can only use Latin letters, numbers and common symbols. Tanggalin ang special characters.");
    }
    const textHeight = font.heightAtSize(size) * 0.7;

    const hex = String(options.color).replace("#", "");
    const color = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
    const angle = Number(options.rotation);
    const radians = (angle * Math.PI) / 180;
    const opacity = Number(options.opacity) / 100;

    const pages = parsePageList(String(options.pages), pdf.getPageCount());
    pages.forEach((index, done) => {
      ctx.progress(done / pages.length, `Stamping page ${index + 1}`);
      const page = pdf.getPage(index);
      const { width, height } = page.getSize();

      /** Draw the text so its centre lands on (cx, cy); pdf-lib rotates around the text origin. */
      const stamp = (cx: number, cy: number) =>
        page.drawText(text, {
          x: cx - (textWidth / 2) * Math.cos(radians) + (textHeight / 2) * Math.sin(radians),
          y: cy - (textWidth / 2) * Math.sin(radians) - (textHeight / 2) * Math.cos(radians),
          size,
          font,
          color,
          opacity,
          rotate: degrees(angle),
        });

      if (options.position === "tile") {
        const stepX = textWidth + size * 2;
        const stepY = size * 4;
        for (let y = -height * 0.2, row = 0; y < height * 1.2; y += stepY, row++) {
          for (let x = -width * 0.2 + (row % 2) * (stepX / 2); x < width * 1.2; x += stepX) stamp(x, y);
        }
      } else {
        const cy = options.position === "top" ? height - size * 1.5 : options.position === "bottom" ? size * 1.5 : height / 2;
        stamp(width / 2, cy);
      }
    });

    return {
      files: [{ name: renameFile(file.name, "pdf", "-stamped"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `Stamped ${pages.length} of ${pdf.getPageCount()} pages.`,
    };
  },
};
