/**
 * Tool 26: EXIF & Metadata Remover.
 *
 * Default method: remove the metadata blocks straight from the file bytes. The pixels are
 * copied untouched, so quality is exactly the same. The one exception is a photo that is
 * rotated only by an EXIF tag (most phone portraits): removing the tag would turn it
 * sideways, so those are re-drawn upright and saved again at high quality.
 */
import { extensionFor, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas } from "@/lib/image-utils";
import { describeMetadata, hasAnyMetadata, readMetadata, stripMetadata } from "@/lib/image-metadata";
import { KreaError, type Tool } from "../types";

export const stripMetadataTool: Tool = {
  id: 26,
  slug: "exif-remover",
  name: "EXIF & Metadata Remover",
  verb: "Remove metadata",
  category: "image",
  description: "Strip GPS location, camera and device info from photos before you share them.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "EXIF Remover: delete GPS location and metadata from photos",
  seoDescription:
    "See what your photo reveals (GPS location, phone model, date) and remove it in your browser. JPG, PNG and WebP, batch to ZIP. Nothing is uploaded.",
  howTo: [
    "Drop one or more photos on the Stage.",
    "Press Remove metadata. You see what each file was carrying before it is cleaned.",
    "Download the clean photos, or the ZIP when there are several.",
  ],
  faqs: [
    { q: "What does a photo reveal about me?", a: "Phone photos often carry the GPS spot where it was taken, the phone model, the date and time, and the editing app. Krea shows exactly what each file contains before it removes it." },
    { q: "Does removing metadata reduce quality?", a: "Usually not. Krea deletes the metadata blocks from the file itself and leaves the pixels untouched. The exception is a photo that is rotated only by a hidden tag: that photo is turned upright and saved again at high quality, and Krea tells you when this happens." },
    { q: "Is the photo uploaded?", a: "No. The file is read and rewritten inside your browser. Krea has no server to receive it." },
    { q: "Does it remove the little preview image inside a photo?", a: "Yes. Many cameras store a small thumbnail in the metadata, which can still show the original before cropping. It is removed with the rest." },
    { q: "Do screenshots and WhatsApp or Messenger photos have metadata?", a: "Screenshots usually have little, and chat apps often strip location already. Krea tells you what it found, so you do not have to guess." },
  ],
  icon: "metadata",
  worker: "image",
  input: "each",
  fields: [
    {
      key: "method",
      label: "Method",
      type: "select",
      default: "lossless",
      options: [
        { value: "lossless", label: "Remove metadata only (no quality loss)" },
        { value: "redraw", label: "Redraw the pixels (removes everything)" },
      ],
      hint: "Redraw decodes the photo and saves it again. It also drops the colour profile, and the file is compressed once more.",
    },
    {
      key: "keepProfile",
      label: "Keep colour profile",
      type: "toggle",
      default: true,
      hint: "The profile keeps colours accurate and holds no personal data.",
      showIf: (values) => values.method === "lossless",
    },
  ],

  async run([file], options, ctx) {
    ctx.progress(0.1, "Reading metadata");
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const before = readMetadata(bytes);
    const report = describeMetadata(file.name, before);
    const keepProfile = Boolean(options.keepProfile);

    let blob: Blob | null = null;
    let note: string;
    const redraw = options.method === "redraw" || before.orientation > 1;
    if (!redraw) {
      const stripped = stripMetadata(bytes, { keepProfile });
      if (stripped) {
        blob = stripped.blob;
        note = stripped.removed.length
          ? `Removed: ${stripped.removed.join(", ")}. The pixels were not touched, so quality is unchanged.`
          : "There was no metadata to remove. The file was saved as it is.";
      } else note = "";
    } else note = "";

    if (!blob) {
      // Redraw: decode (applies the rotation tag), paint to a clean canvas, save again.
      ctx.progress(0.4, "Redrawing pixels");
      const bitmap = await decodeImage(file);
      const { canvas, ctx: draw } = createCanvas(bitmap.width, bitmap.height);
      draw.drawImage(bitmap, 0, 0);
      bitmap.close();
      blob = await encodeCanvas(canvas, file.type, 0.95);
      note =
        options.method === "redraw"
          ? "All metadata is gone. The photo was redrawn and saved again at 95% quality."
          : `This photo was rotated by a hidden tag, which cannot be removed without turning it sideways. Krea turned it upright and saved it again at 95% quality; all metadata is gone.`;
    }

    // Verify: never hand back a file that still carries what we promised to remove.
    const after = readMetadata(new Uint8Array(await blob.arrayBuffer()));
    if (after.hasGps || after.rows.length || after.hasThumbnail) {
      throw new KreaError("failed", `Hindi nabura ang lahat ng metadata sa "${file.name}". Try the "Redraw the pixels" method.`);
    }

    const name = renameFile(file.name, extensionFor(file.type), "-clean");
    const found = hasAnyMetadata(before);
    return {
      files: [{ name, type: file.type, blob }],
      note,
      view: { type: "text", text: report, label: found ? "Metadata found before cleaning" : "Metadata check", keepSize: true },
    };
  },
};
