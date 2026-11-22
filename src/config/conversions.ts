/**
 * Conversion landing pages (/convert/[pair]): one page per common search such as
 * "webp to png" or "heic to jpg". Each page embeds the tool that does the job with
 * the right output already chosen, so there is one tool per job and many entry points.
 * Add a page here; the route, sitemap and tool-page links read this list.
 */

export interface Conversion {
  /** URL segment, e.g. "webp-to-png". */
  slug: string;
  from: string;
  to: string;
  /** Tool that does the conversion (its registry slug). */
  tool: string;
  /** Settings to start with: Stage tool fields, or the editor's `format`. */
  preset: Record<string, string>;
  /** One or two sentences under the heading. */
  intro: string;
  faqs: { q: string; a: string }[];
}

const PRIVATE = { q: "Are my files uploaded?", a: "No. The conversion runs inside your browser, so your images never leave your phone or computer. It also works offline once the page has loaded." };

export const CONVERSIONS: Conversion[] = [
  {
    slug: "webp-to-png",
    from: "WEBP",
    to: "PNG",
    tool: "format-converter",
    preset: { format: "image/png" },
    intro: "Turn WebP images saved from websites into PNG that every app, editor and upload form accepts. Transparency is kept.",
    faqs: [
      { q: "Why do images download as WebP?", a: "Websites use WebP because the files are small. Many older apps, Windows tools and upload forms still do not open it, so PNG or JPG is safer." },
      { q: "Is the transparency kept?", a: "Yes. PNG supports transparency, so see-through parts of the WebP stay see-through." },
      PRIVATE,
    ],
  },
  {
    slug: "webp-to-jpg",
    from: "WEBP",
    to: "JPG",
    tool: "format-converter",
    preset: { format: "image/jpeg" },
    intro: "Convert WebP images to JPG for uploads, printing and apps that do not read WebP. Choose the quality, batch convert to a ZIP.",
    faqs: [
      { q: "What happens to transparent parts?", a: "JPG has no transparency, so they are filled with a background colour you choose (white by default)." },
      { q: "Can I convert many at once?", a: "Yes. Drop all the WebP files; they are converted together and downloaded as a ZIP." },
      PRIVATE,
    ],
  },
  {
    slug: "jfif-to-png",
    from: "JFIF",
    to: "PNG",
    tool: "format-converter",
    preset: { format: "image/png" },
    intro: "A .jfif file is a JPEG with an unusual extension, often from saving images on Windows. Convert it to PNG so it opens and uploads everywhere.",
    faqs: [
      { q: "What is a JFIF file?", a: "JFIF is the format inside ordinary JPEG photos. Windows sometimes saves downloaded images with the .jfif extension, which some sites and apps reject even though the picture is a normal JPEG." },
      { q: "Should I pick PNG or JPG?", a: "JPG keeps the file small, and is enough for photos. PNG is best for screenshots, graphics and text, or when you will edit the image further." },
      PRIVATE,
    ],
  },
  {
    slug: "jfif-to-jpg",
    from: "JFIF",
    to: "JPG",
    tool: "format-converter",
    preset: { format: "image/jpeg" },
    intro: "Save .jfif images as standard .jpg files so upload forms and apps accept them. Batch convert to a ZIP.",
    faqs: [
      { q: "Can I just rename .jfif to .jpg?", a: "Often yes, since the picture inside is already JPEG. Converting is the sure way: it writes a clean, standard JPG file that every app reads." },
      { q: "Does it lose quality?", a: "Very little at the default 90% quality. Raise the quality slider to 100% to keep it as close as possible." },
      PRIVATE,
    ],
  },
  {
    slug: "png-to-jpg",
    from: "PNG",
    to: "JPG",
    tool: "format-converter",
    preset: { format: "image/jpeg" },
    intro: "Make PNG screenshots and images much smaller by saving them as JPG, with the quality and background colour you choose.",
    faqs: [
      { q: "Why is my PNG so large?", a: "PNG keeps every pixel exactly, which suits screenshots and graphics but makes photos large. JPG is usually several times smaller." },
      { q: "What happens to transparency?", a: "It is filled with the background colour you pick, white by default." },
      PRIVATE,
    ],
  },
  {
    slug: "jpg-to-png",
    from: "JPG",
    to: "PNG",
    tool: "format-converter",
    preset: { format: "image/png" },
    intro: "Convert JPG photos to PNG for editing, design apps and forms that ask for PNG.",
    faqs: [
      { q: "Will PNG make my photo better?", a: "No. It keeps the photo exactly as it is now and stops further loss when you edit and save again. The file is usually larger." },
      { q: "Does it make the background transparent?", a: "No. To remove a background, use the Background Remover; it saves a transparent PNG." },
      PRIVATE,
    ],
  },
  {
    slug: "png-to-webp",
    from: "PNG",
    to: "WEBP",
    tool: "format-converter",
    preset: { format: "image/webp" },
    intro: "Shrink PNG images for websites by converting them to WebP, keeping transparency.",
    faqs: [
      { q: "How much smaller is WebP?", a: "Usually a quarter to a half of the PNG size, depending on the image and quality." },
      { q: "Do all browsers show WebP?", a: "Yes, every current browser does. Some older desktop apps do not, so keep the PNG for those." },
      PRIVATE,
    ],
  },
  {
    slug: "jpg-to-webp",
    from: "JPG",
    to: "WEBP",
    tool: "format-converter",
    preset: { format: "image/webp" },
    intro: "Convert JPG photos to WebP for faster websites and smaller uploads.",
    faqs: [
      { q: "Is WebP better than JPG?", a: "For the web, usually: similar quality at a smaller size. For printing or sharing with older apps, JPG is the safer choice." },
      { q: "Can I convert a batch?", a: "Yes. Drop all the photos and download a ZIP." },
      PRIVATE,
    ],
  },
  {
    slug: "heic-to-jpg",
    from: "HEIC",
    to: "JPG",
    tool: "heic-converter",
    preset: { format: "image/jpeg" },
    intro: "Convert iPhone HEIC photos to JPG for Windows, websites and government upload forms. Batch convert, choose the quality, no upload.",
    faqs: [
      { q: "Why does my iPhone save HEIC?", a: "HEIC keeps the same quality in about half the space of JPG. Many apps and sites still do not accept it, so convert before uploading." },
      { q: "Is the GPS location removed?", a: "Yes. The converted JPG has no metadata, so the location and camera details of the original are not copied." },
      PRIVATE,
    ],
  },
  {
    slug: "heic-to-png",
    from: "HEIC",
    to: "PNG",
    tool: "heic-converter",
    preset: { format: "image/png" },
    intro: "Convert iPhone HEIC photos straight to full-quality PNG for editing and printing, with no JPG step in between.",
    faqs: [
      { q: "Why are the PNG files so big?", a: "PNG keeps every pixel without compression loss, so a 12 MP photo can be 15 to 25 MB. Choose JPG for sharing." },
      { q: "Does it keep the photo's quality?", a: "Yes. The HEIC is decoded directly to PNG, so nothing is lost to JPG compression along the way." },
      PRIVATE,
    ],
  },
  {
    slug: "svg-to-png",
    from: "SVG",
    to: "PNG",
    tool: "svg-converter",
    preset: { format: "image/png" },
    intro: "Turn SVG logos and icons into sharp PNG at 1x, 2x, 4x or an exact width, with a transparent background.",
    faqs: [
      { q: "What size should I export?", a: "2x is sharp on most phone screens. For print or large banners, enter the exact width you need, up to 8,192 pixels." },
      { q: "Is it safe to open an SVG from someone else?", a: "Yes. Krea draws the SVG the way a browser shows a picture, where scripts inside it never run." },
      PRIVATE,
    ],
  },
  {
    slug: "svg-to-jpg",
    from: "SVG",
    to: "JPG",
    tool: "svg-converter",
    preset: { format: "image/jpeg" },
    intro: "Convert SVG graphics to JPG at the size you need, on a white or custom background.",
    faqs: [
      { q: "What happens to the transparent background?", a: "JPG cannot be transparent, so it is filled with the background colour you choose, white by default." },
      { q: "Can I convert several SVGs?", a: "Yes. Open them together and download a ZIP." },
      PRIVATE,
    ],
  },
  {
    slug: "png-to-svg",
    from: "PNG",
    to: "SVG",
    tool: "image-to-svg",
    preset: {},
    intro: "Trace a PNG logo, icon, drawing or signature into a real vector SVG that stays sharp at any size and can be edited in design apps.",
    faqs: [
      { q: "Is the SVG a real vector?", a: "Yes. Shapes and colours are traced into paths; the picture is not just wrapped inside an SVG file." },
      { q: "Does it work for photos?", a: "Not well. Photos turn into thousands of small shapes and a huge file. Tracing is meant for logos, icons, line art and signatures." },
      PRIVATE,
    ],
  },
  {
    slug: "jpg-to-svg",
    from: "JPG",
    to: "SVG",
    tool: "image-to-svg",
    preset: {},
    intro: "Trace a JPG of a logo, drawing or signature into a scalable vector SVG, in colour or black and white.",
    faqs: [
      { q: "My JPG has a white background. Can I remove it?", a: "Yes. In colour mode turn on Remove background, or use black and white, which keeps only the dark shapes." },
      { q: "What about a photo of a signature on paper?", a: "Use black and white. For a cleaner result, run it through Signature Extractor first, then trace the PNG it saves." },
      PRIVATE,
    ],
  },
];

export const getConversion = (slug: string) => CONVERSIONS.find((entry) => entry.slug === slug);
export const conversionsFor = (toolSlug: string) => CONVERSIONS.filter((entry) => entry.tool === toolSlug);
