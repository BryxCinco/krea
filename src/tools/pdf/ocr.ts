/** Tool 20: OCR. Image and PDF to text with local Tesseract, in English and Filipino. */
import { IMAGE_MIMES, PDF_MIME, renameFile } from "@/lib/file-type";
import { startOcr, type OcrLanguage } from "@/lib/ocr";
import { openPdf, renderPage } from "@/lib/pdf-render";
import { parsePageList } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

export const ocr: Tool = {
  id: 20,
  slug: "ocr",
  name: "OCR: Image and PDF to Text",
  verb: "Extract Text",
  category: "pdf",
  description: "Read the text in photos, screenshots and scanned PDFs. English and Filipino, recognized on your device.",
  accepts: [...IMAGE_MIMES, PDF_MIME],
  output: "text",
  seoTitle: "OCR: image and PDF to text in English and Filipino, offline",
  seoDescription:
    "Extract text from images and scanned PDFs with OCR that runs in your browser. Supports English and Filipino. Copy the text or download a TXT file. No upload.",
  howTo: [
    "Drop an image or a scanned PDF on the Stage.",
    "Choose the language of the document. For PDFs you can pick specific pages.",
    "Extract, then copy the text or download it as a TXT file.",
  ],
  icon: "ocr",
  // Tesseract runs in its own worker and PDF pages are rendered by pdf.js, so
  // this tool is coordinated from the page (see lib/ocr.ts).
  worker: "ocr",
  input: "each",
  fields: [
    {
      key: "language",
      label: "Language",
      type: "select",
      default: "eng+fil",
      hint: "The language data (about 3 MB each) loads the first time, then stays on your device.",
      options: [
        { value: "eng+fil", label: "English + Filipino" },
        { value: "eng", label: "English" },
        { value: "fil", label: "Filipino" },
      ],
    },
    {
      key: "pages",
      label: "Pages (PDF only)",
      type: "pages",
      default: "",
      hint: "Leave empty to read every page. Ignored for images.",
    },
  ],

  async run([file], options, ctx) {
    // Progress for the page being read, mapped onto the whole job below.
    let pageIndex = 0;
    let pageTotal = 1;
    const session = await startOcr(
      options.language as OcrLanguage,
      (value) => ctx.progress((pageIndex + value) / pageTotal, pageTotal > 1 ? `Reading page ${pageIndex + 1} of ${pageTotal}` : "Reading text"),
      ctx.signal,
    );

    let text: string;
    try {
      if (file.type === PDF_MIME) {
        const { pdf, close } = await openPdf(file);
        try {
          const pages = parsePageList(String(options.pages), pdf.numPages);
          pageTotal = pages.length;
          const parts: string[] = [];
          for (pageIndex = 0; pageIndex < pages.length; pageIndex++) {
            if (ctx.signal?.aborted) throw new KreaError("failed", "Cancelled.");
            // 200 DPI is the sweet spot for Tesseract: sharp enough for small print, still fast.
            const { blob } = await renderPage(pdf, pages[pageIndex], 200 / 72, "image/png");
            const pageText = (await session.recognize(blob)).trim();
            parts.push(pages.length > 1 ? `--- Page ${pages[pageIndex] + 1} ---\n${pageText}` : pageText);
          }
          text = parts.join("\n\n");
        } finally {
          await close();
        }
      } else {
        text = (await session.recognize(file.blob)).trim();
      }
    } finally {
      await session.close();
    }

    return {
      files: [{ name: renameFile(file.name, "txt"), type: "text/plain", blob: new Blob([text], { type: "text/plain;charset=utf-8" }) }],
      view: { type: "text", text },
      note: text ? undefined : "Walang nabasang text. Try a sharper, straighter image with good contrast.",
    };
  },
};
