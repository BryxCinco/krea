/**
 * Tool 27: Signature Maker. Draw or type a signature and export a tightly cropped
 * transparent PNG. The UI is an editor (components/stage/editors/signature-editor.tsx).
 */
import { editorTool } from "../text/editor-tool";

export const signatureMaker = editorTool(
  {
    id: 27,
    slug: "signature-maker",
    name: "Signature Maker",
    verb: "Make signature",
    description: "Draw or type your signature and download it as a transparent PNG.",
    seoTitle: "Signature Maker: draw or type a signature, transparent PNG",
    seoDescription:
      "Make an e-signature in your browser: draw with a finger or mouse, or type your name in handwriting fonts. Download a transparent PNG. Nothing is uploaded.",
    howTo: [
      "Draw your signature, or switch to Type and write your name.",
      "Pick the ink colour and thickness. The preview shows exactly what the PNG will look like.",
      "Download the transparent PNG, or save it in this browser to reuse in Sign PDF.",
    ],
    faqs: [
      { q: "Is my signature uploaded?", a: "No. It is drawn and exported inside your browser. Krea has no server to receive it." },
      { q: "Is the PNG really transparent?", a: "Yes. Only the ink is saved, with a transparent background, cropped tightly around the signature, so you can place it on any document." },
      { q: "Where is a saved signature stored?", a: "Only if you press Save, and only in this browser on this device. Anyone who uses this browser profile could see it, so on a shared computer press Delete when you are done." },
      { q: "Is this a legally binding digital signature?", a: "It is an image of your signature, like signing on paper and scanning it. It is not a certificate-based digital signature. Whether an image is accepted depends on the office or contract asking for it." },
      { q: "Can I use it in Sign PDF?", a: "Yes. Signatures you save here appear in the Sign PDF signature box on this device, ready to place on a page." },
    ],
    icon: "sign",
  },
  "image",
);
