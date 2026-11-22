/**
 * Tool 63: HEIC Converter. Converts iPhone HEIC/HEIF (and AVIF) photos straight to
 * PNG or JPG, one or many. The Stage already turns HEIC into JPEG on arrival; this
 * tool decodes the original directly, so PNG keeps full quality with no JPEG step in
 * between. Decoding is src/lib/heic.ts; UI: components/stage/editors/heic-convert-editor.tsx.
 */
import { editorTool } from "../text/editor-tool";

export const heicConvert = editorTool(
  {
    id: 63,
    slug: "heic-converter",
    name: "HEIC Converter",
    verb: "Convert HEIC",
    description: "Convert iPhone HEIC photos to JPG or PNG, a whole batch at once, right on your device.",
    seoTitle: "HEIC to JPG and HEIC to PNG converter: iPhone photos, offline",
    seoDescription:
      "Convert iPhone HEIC and HEIF photos to JPG or PNG in your browser. Batch convert to a ZIP, choose JPG quality or lossless PNG, and strip location data in the process. No upload, works offline.",
    howTo: [
      "Open or drop your HEIC photos (AVIF works too).",
      "Choose JPG (smaller, with a quality setting) or PNG (full quality).",
      "Convert and download the photo, or a ZIP when there are several.",
    ],
    faqs: [
      { q: "Why can I not open HEIC files?", a: "iPhones save photos as HEIC to save space, but many Windows apps, websites and government upload forms only accept JPG or PNG. Converting fixes that." },
      { q: "JPG or PNG?", a: "JPG for sharing and uploads: much smaller, with quality you can set. PNG keeps every pixel the decoder produces, for editing or printing, but the files are several times larger." },
      { q: "Are my photos uploaded?", a: "No. The photos are decoded inside your browser with a built-in converter. They never leave your phone or computer." },
      { q: "Is the location kept?", a: "No. The converted photo has no metadata, so the GPS location, camera and date details of the original are not copied. Use the EXIF & Metadata Remover first if you want to see what the original carried." },
      { q: "Can I stop my iPhone from saving HEIC?", a: "Yes: Settings, Camera, Formats, Most Compatible. New photos are then saved as JPG. Photos you already took stay HEIC." },
    ],
    icon: "heic",
  },
  "image",
);

/** HEIC photos are big; past this many at once a phone may run out of memory. */
export const MAX_HEIC_FILES = 60;
export const MAX_HEIC_BYTES = 80 * 1024 * 1024;
