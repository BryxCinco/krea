/** Tool 17: Sign PDF. Draw, type or upload a signature, then place and size it on a page. */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { dataUrlToBlob } from "@/lib/image-utils";
import { loadPdf, pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

export const signPdf: Tool = {
  id: 17,
  slug: "sign-pdf",
  name: "Sign PDF",
  verb: "Sign",
  category: "pdf",
  description: "Draw, type or upload your signature, then drag it into place on any page.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Sign PDF: draw or type a signature, no upload",
  seoDescription:
    "Sign a PDF in your browser. Draw with your finger or mouse, type, or upload a signature image, then place and resize it on any page. Your document stays on your device.",
  howTo: [
    "Drop a PDF on the Stage.",
    "Make your signature: draw it, type it, or upload a photo of it.",
    "Pick the page, drag the signature into place and resize it, then sign and download.",
  ],
  icon: "sign",
  worker: "pdf",
  input: "each",
  notChainable: "Signing needs you to place the signature by hand.",
  fields: [
    { key: "signature", label: "Signature", type: "signature", hint: "Stays in this tab only. Hindi sine-save kahit saan." },
    { key: "page", label: "Page", type: "number", min: 1, step: 1, default: 1, showIf: (v) => !v.allPages },
    { key: "allPages", label: "Sign every page in the same spot", type: "toggle", default: false },
    {
      key: "place",
      label: "Placement",
      type: "placement",
      pageKey: "page",
      imageKey: "signature",
      hint: "Drag the signature on the page preview. Drag a corner to resize.",
    },
  ],

  async run([file], options, ctx) {
    if (!options.signature) throw new KreaError("failed", "Gumawa muna ng signature: draw, type, or upload one.");
    const pdf = await loadPdf(file);
    const image = await pdf.embedPng(await (await dataUrlToBlob(String(options.signature))).arrayBuffer());

    const pageCount = pdf.getPageCount();
    const chosen = Math.round(Number(options.page));
    if (!options.allPages && !(chosen >= 1 && chosen <= pageCount)) {
      throw new KreaError("failed", `Page ${options.page} does not exist. This PDF has ${pageCount} pages.`);
    }
    const targets = options.allPages ? pdf.getPageIndices() : [chosen - 1];

    targets.forEach((index, done) => {
      ctx.progress(done / targets.length, `Signing page ${index + 1}`);
      const page = pdf.getPage(index);
      if (page.getRotation().angle % 360 !== 0) {
        throw new KreaError(
          "failed",
          `Page ${index + 1} is stored rotated, and Krea cannot place a signature accurately on rotated pages yet.`,
        );
      }
      const { width, height } = page.getSize();
      // The box is stored from the top-left, normalized; PDF coordinates start at the bottom-left.
      const boxW = Number(options.placeW) * width;
      const boxH = Number(options.placeH) * height;
      const boxX = Number(options.placeX) * width;
      const boxY = height - Number(options.placeY) * height - boxH;
      // Fit the signature inside the box without distorting it.
      const scale = Math.min(boxW / image.width, boxH / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      page.drawImage(image, { x: boxX + (boxW - drawW) / 2, y: boxY + (boxH - drawH) / 2, width: drawW, height: drawH });
    });

    return {
      files: [{ name: renameFile(file.name, "pdf", "-signed"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: `Signature placed on ${targets.length === 1 ? `page ${targets[0] + 1}` : `${targets.length} pages`}. This is a visual signature, not a certificate-based digital signature.`,
    };
  },
};
