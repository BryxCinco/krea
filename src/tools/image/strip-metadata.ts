/**
 * Tool 26: EXIF & Metadata Remover.
 *
 * Shows what each photo carries (camera, dates, GPS location with a warning), then cleans it.
 * Default method: remove the metadata blocks straight from the file bytes. The pixels are
 * copied untouched, so quality is exactly the same. A photo rotated only by an EXIF tag (most
 * phone portraits) keeps just that tag on JPG, so it stays upright without re-encoding; PNG and
 * WebP are redrawn upright instead. "Keep photo upright" off drops the tag and keeps the pixels
 * as stored. HEIC and AVIF are converted to JPG on the Stage, which drops their metadata; the
 * Stage reads it from the original first (WorkFile.sourceMetadata) so the report still shows it.
 */
import { extensionFor, IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas } from "@/lib/image-utils";
import { describeMetadata, hasAnyMetadata, isJpegBytes, readMetadata, stripMetadata } from "@/lib/image-metadata";
import { KreaError, type Tool } from "../types";

export const stripMetadataTool: Tool = {
  id: 26,
  slug: "exif-remover",
  name: "EXIF & Metadata Remover",
  verb: "Remove metadata",
  category: "image",
  description: "See and strip GPS location, camera and date info from photos (JPG, PNG, WebP, HEIC) before you share them.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "EXIF Remover: delete GPS location and metadata from photos",
  seoDescription:
    "See what your photo reveals (GPS location, phone model, date taken) and remove it in your browser. JPG, PNG, WebP and iPhone HEIC, batch to ZIP. Nothing is uploaded.",
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
    { q: "Does it work with iPhone HEIC photos?", a: "Yes. Krea reads the camera, date and location of the original HEIC, shows them, then converts the photo to JPG on your device. The converted JPG has none of that metadata." },
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
    {
      key: "keepOrientation",
      label: "Keep photo upright",
      type: "toggle",
      default: true,
      hint: "Phone portraits are often turned by a hidden tag. On JPG only that tag is kept, with no re-encoding. Turn off to keep the pixels exactly as stored, even if the photo shows sideways.",
    },
  ],

  async run([file], options, ctx) {
    ctx.progress(0.1, "Reading metadata");
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const before = readMetadata(bytes);
    const keepProfile = Boolean(options.keepProfile);
    const keepUpright = options.keepOrientation !== false;
    const rotated = before.orientation > 1;
    // A HEIC or AVIF photo was converted to JPG on the Stage, which already dropped its metadata.
    const source = file.sourceMetadata;
    const report = source
      ? `${describeMetadata(`${file.name} (original HEIC/AVIF, before it was converted to JPG)`, source)}

${describeMetadata(`${file.name} (the converted JPG)`, before)}`
      : describeMetadata(file.name, before);

    let blob: Blob | null = null;
    let note = "";
    // On JPG the rotation tag can be kept on its own (lossless). Other formats are redrawn upright.
    const redraw = options.method === "redraw" || (rotated && keepUpright && !isJpegBytes(bytes));
    if (!redraw) {
      const stripped = stripMetadata(bytes, { keepProfile, keepOrientation: rotated && keepUpright ? before.orientation : undefined });
      if (stripped) {
        blob = stripped.blob;
        note = stripped.removed.length
          ? `Removed: ${stripped.removed.join(", ")}. The pixels were not touched, so quality is unchanged.`
          : "There was no metadata to remove. The file was saved as it is.";
        if (rotated && keepUpright) note += " Only the rotation tag was kept so the photo stays upright. It holds no personal data.";
        else if (rotated) note += " The rotation tag was removed too, so this photo may now show sideways. Turn on Keep photo upright to avoid that.";
      }
    }

    if (!blob) {
      // Redraw: decode (applying the rotation tag unless asked not to), paint to a clean canvas, save again.
      ctx.progress(0.4, "Redrawing pixels");
      const bitmap = await decodeImage(file, keepUpright ? "from-image" : "none");
      const { canvas, ctx: draw } = createCanvas(bitmap.width, bitmap.height);
      draw.drawImage(bitmap, 0, 0);
      bitmap.close();
      blob = await encodeCanvas(canvas, file.type, 0.95);
      note =
        options.method === "redraw"
          ? `All metadata is gone. The photo was redrawn and saved again at 95% quality${rotated && !keepUpright ? ", with the pixels as stored (it may show sideways)" : ""}.`
          : "This photo was rotated by a hidden tag. Krea turned it upright and saved it again at 95% quality; all metadata is gone.";
    }

    // Verify: never hand back a file that still carries what we promised to remove.
    const after = readMetadata(new Uint8Array(await blob.arrayBuffer()));
    if (after.hasGps || after.rows.length || after.hasThumbnail) {
      throw new KreaError("failed", `Hindi nabura ang lahat ng metadata sa "${file.name}". Try the "Redraw the pixels" method.`);
    }

    if (before.hasGps || source?.hasGps) {
      note = `May GPS location ang ${source?.hasGps && !before.hasGps ? "original na photo" : "photo na ito"}: anyone with the file could see where it was taken. Wala na ito sa malinis na kopya. ${note}`;
    }
    if (source) note += " The original HEIC/AVIF had metadata, and converting it to JPG on your device already removed it.";

    const name = renameFile(file.name, extensionFor(file.type), "-clean");
    const found = hasAnyMetadata(before) || Boolean(source && hasAnyMetadata(source));
    return {
      files: [{ name, type: file.type, blob }],
      note,
      view: { type: "text", text: report, label: found ? "Metadata found before cleaning" : "Metadata check", keepSize: true },
    };
  },
};
