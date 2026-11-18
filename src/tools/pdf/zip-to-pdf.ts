/**
 * Tool 48: ZIP to PDF. Opens a ZIP and combines the photos (JPG, PNG, WebP)
 * and PDFs inside into one PDF, in file-name order (page2 before page10).
 * Built for the folders phones and scanner apps export, and for school and
 * government submissions that want one file.
 *
 * Safety: entries are read one at a time and the total unpacked size is
 * capped, so a ZIP bomb stops with a message instead of exhausting memory.
 */
import { detectFileType, PDF_MIME, renameFile, ZIP_MIME } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas } from "@/lib/image-utils";
import { PAGE_SIZE_OPTIONS, PAGE_SIZES } from "@/lib/pdf-text";
import { pdfBlob } from "@/lib/pdf-utils";
import { KreaError, type Tool } from "../types";

const MAX_ENTRIES = 1000;
const MAX_UNPACKED = 500 * 1024 * 1024;
const MAX_PAGES = 2000;

/** Natural order: "scan2.jpg" before "scan10.jpg", folders kept together. */
const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

/** Folders and files that are not content: macOS resource forks, hidden files, thumbnails. */
export function isJunk(path: string): boolean {
  return path.split("/").some((part) => part === "__MACOSX" || part.startsWith(".") || part === "Thumbs.db" || part === "desktop.ini");
}

export const zipToPdf: Tool = {
  id: 48,
  slug: "zip-to-pdf",
  name: "ZIP to PDF",
  verb: "ZIP to PDF",
  category: "pdf",
  description: "Turn a ZIP of photos, scans and PDFs into one PDF, in file-name order.",
  accepts: [ZIP_MIME],
  output: "pdf",
  seoTitle: "ZIP to PDF: combine the images and PDFs in a ZIP into one PDF",
  seoDescription:
    "Convert a ZIP file of JPG, PNG and WebP photos and PDF files into a single PDF, sorted by file name. Fits images to A4, Letter or Legal. Works offline, no upload.",
  howTo: [
    "Drop a .zip file on the Stage.",
    "Choose the page size for photos and the order.",
    "Convert. Krea lists anything it skipped, such as Word files or locked PDFs.",
  ],
  faqs: [
    { q: "What goes into the PDF?", a: "JPG, PNG and WebP images and PDF files, including those in folders inside the ZIP. Other files (Word, videos, nested ZIPs) are skipped and Krea tells you how many." },
    { q: "In what order are the pages?", a: "By file name, the way people expect: page2 comes before page10. Choose As stored in the ZIP to keep the order of the archive instead." },
    { q: "What happens to password-protected PDFs inside?", a: "They are skipped and named in the result, because Krea cannot open them without the password. Unlock them first with Protect / Unlock PDF." },
    { q: "Is there a size limit?", a: "Up to 1,000 files and 500 MB once unpacked, so a phone does not run out of memory. Split bigger archives into a few ZIPs." },
    { q: "Is the ZIP uploaded?", a: "No. It is opened and converted inside your browser." },
  ],
  icon: "zip-pdf",
  worker: "pdf",
  input: "each",
  fields: [
    { key: "pageSize", label: "Page size for photos", type: "select", default: "a4", options: [...PAGE_SIZE_OPTIONS, { value: "fit", label: "Same as each photo" }] },
    {
      key: "margin",
      label: "Margin",
      type: "select",
      default: "18",
      showIf: (v) => v.pageSize !== "fit",
      options: [
        { value: "0", label: "None" },
        { value: "18", label: "Small (0.25 in)" },
        { value: "36", label: "Medium (0.5 in)" },
      ],
    },
    {
      key: "order",
      label: "Order",
      type: "select",
      default: "name",
      options: [
        { value: "name", label: "By file name (2 before 10)" },
        { value: "zip", label: "As stored in the ZIP" },
      ],
    },
  ],

  async run([file], options, ctx) {
    const { default: JSZip } = await import("jszip");
    const { PDFDocument } = await import("pdf-lib");
    let zip;
    try {
      zip = await JSZip.loadAsync(file.blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/encrypt/i.test(message)) throw new KreaError("password", `"${file.name}" is a password-protected ZIP. Extract it on your device first, then zip it again without a password.`);
      throw new KreaError("corrupted", `Hindi mabuksan ang "${file.name}". The ZIP looks damaged or incomplete.`);
    }

    let entries = Object.values(zip.files).filter((entry) => !entry.dir && !isJunk(entry.name));
    if (!entries.length) throw new KreaError("failed", `Walang laman ang "${file.name}". There are no files inside.`);
    if (entries.length > MAX_ENTRIES) throw new KreaError("too-large", `"${file.name}" has ${entries.length} files. Krea handles up to ${MAX_ENTRIES}: split it into smaller ZIPs.`);
    // Check the sizes the ZIP declares before unpacking anything: one entry can claim gigabytes.
    // (JSZip keeps them on a private field; the running total below still guards if it is missing.)
    const declared = entries.reduce((sum, entry) => sum + ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
    if (declared > MAX_UNPACKED) throw new KreaError("too-large", `"${file.name}" unpacks to more than 500 MB. Split it into smaller ZIPs.`);
    if (options.order !== "zip") entries = [...entries].sort((a, b) => naturalCompare(a.name, b.name));

    const pdf = await PDFDocument.create();
    const skipped: string[] = [];
    const locked: string[] = [];
    let unpacked = 0;
    let images = 0;
    let pdfs = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const shortName = entry.name.split("/").pop() || entry.name;
      ctx.progress((0.9 * i) / entries.length, `Adding ${shortName}`);
      let blob: Blob;
      try {
        blob = await entry.async("blob");
      } catch {
        skipped.push(shortName);
        continue;
      }
      unpacked += blob.size;
      if (unpacked > MAX_UNPACKED) throw new KreaError("too-large", `"${file.name}" unpacks to more than 500 MB. Split it into smaller ZIPs.`);

      const detected = await detectFileType(blob, shortName);
      if (detected.kind === "pdf") {
        try {
          const source = await PDFDocument.load(await blob.arrayBuffer());
          const pages = await pdf.copyPages(source, source.getPageIndices());
          pages.forEach((page) => pdf.addPage(page));
          pdfs++;
        } catch (error) {
          (error instanceof Error && /encrypted/i.test(error.message) ? locked : skipped).push(shortName);
        }
      } else if (detected.kind === "image" && ["image/jpeg", "image/png", "image/webp"].includes(detected.mime)) {
        try {
          await addImage(pdf, { name: shortName, type: detected.mime, blob }, String(options.pageSize), Number(options.margin));
          images++;
        } catch {
          skipped.push(shortName);
        }
      } else {
        skipped.push(shortName);
      }
      if (pdf.getPageCount() > MAX_PAGES) throw new KreaError("too-large", `The combined PDF would pass ${MAX_PAGES} pages. Split the ZIP into smaller ones.`);
    }

    if (!pdf.getPageCount()) {
      throw new KreaError(
        "unsupported",
        locked.length
          ? `Naka-password ang mga PDF sa loob (${locked.slice(0, 5).join(", ")}) and there are no images. Unlock them first with Protect / Unlock PDF.`
          : `Walang larawan o PDF sa "${file.name}". Krea combines JPG, PNG and WebP images and PDF files.`,
      );
    }

    ctx.progress(0.95, "Saving");
    const list = (names: string[]) => (names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", "));
    const parts = [`${pdf.getPageCount()} ${pdf.getPageCount() === 1 ? "page" : "pages"} from ${images} ${images === 1 ? "image" : "images"} and ${pdfs} ${pdfs === 1 ? "PDF" : "PDFs"}.`];
    if (locked.length) parts.push(`Skipped password-protected: ${list(locked)}.`);
    if (skipped.length) parts.push(`Skipped ${skipped.length} other ${skipped.length === 1 ? "file" : "files"}: ${list(skipped)}.`);
    return {
      files: [{ name: renameFile(file.name, "pdf"), type: PDF_MIME, blob: pdfBlob(await pdf.save()) }],
      note: parts.join(" "),
    };
  },
};

/** One image per page, re-encoded through a canvas so EXIF rotation is applied and WebP becomes JPG (as Image to PDF does). */
async function addImage(pdf: import("pdf-lib").PDFDocument, file: { name: string; type: string; blob: Blob }, pageSize: string, margin: number) {
  const bitmap = await decodeImage(file);
  const { canvas, ctx: draw } = createCanvas(bitmap.width, bitmap.height);
  const lossless = file.type === "image/png";
  if (!lossless) {
    draw.fillStyle = "#ffffff";
    draw.fillRect(0, 0, canvas.width, canvas.height);
  }
  draw.drawImage(bitmap, 0, 0);
  bitmap.close();
  const bytes = await (await encodeCanvas(canvas, lossless ? "image/png" : "image/jpeg", 0.92)).arrayBuffer();
  const image = lossless ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  if (pageSize === "fit") {
    pdf.addPage([image.width, image.height]).drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return;
  }
  let [pageW, pageH] = PAGE_SIZES[pageSize] ?? PAGE_SIZES.a4;
  if (image.width > image.height) [pageW, pageH] = [pageH, pageW];
  const scale = Math.min((pageW - margin * 2) / image.width, (pageH - margin * 2) / image.height, 1.5);
  const width = image.width * scale;
  const height = image.height * scale;
  pdf.addPage([pageW, pageH]).drawImage(image, { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height });
}
