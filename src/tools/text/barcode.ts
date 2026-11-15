/**
 * Tool 31: Barcode Generator + QR / Barcode Scanner. The UI is an editor
 * (components/stage/editors/barcode-editor.tsx); validation is in barcode-logic.ts.
 * Libraries: JsBarcode (MIT) draws barcodes; scanning uses the browser's BarcodeDetector
 * or barcode-detector / zxing-wasm (MIT, ZXing-C++ is Apache-2.0).
 */
import { editorTool } from "./editor-tool";

export const barcode = editorTool(
  {
    id: 31,
    slug: "barcode-generator-scanner",
    name: "Barcode Generator & QR Scanner",
    verb: "Barcode",
    description: "Make Code 128, Code 39, EAN and UPC barcodes, and scan QR codes and barcodes from a photo or the camera.",
    seoTitle: "Barcode Generator and QR Code Scanner: Code 128, EAN-13, UPC-A, from image or camera",
    seoDescription:
      "Create Code 128, Code 39, EAN-13, EAN-8 and UPC-A barcodes with check digits as PNG or SVG, and scan QR codes and barcodes from an image or your camera. Everything runs on your device.",
    howTo: [
      "To make a barcode, pick the type, type the number or text, and download the PNG or SVG.",
      "To scan, open the Scan tab and choose an image, or press Use camera and allow access.",
      "Copy what was read. Links are never opened automatically.",
    ],
    faqs: [
      { q: "Is the camera image uploaded?", a: "No. The video stays in your browser and is read on your device. The camera starts only when you press Use camera, and it is switched off as soon as a code is found or you stop it." },
      { q: "Which barcode types can I make?", a: "Code 128, Code 39, EAN-13, EAN-8 and UPC-A. For the EAN and UPC types Krea adds the check digit for you, or tells you if the one you typed is wrong." },
      { q: "Can I use these barcodes on products in stores?", a: "A retail EAN or UPC number must be issued to your company (in the Philippines, through GS1 Philippines). Krea draws a valid barcode for any number, but a made-up number may clash with someone else's product. For your own labels, shelves or tickets, Code 128 is the safe choice." },
      { q: "Why does my scanner not read the barcode?", a: "Use dark bars on a light background with enough contrast, keep the white margin around the code, and print it big enough (at least about 2 cm wide for short codes). Light bars on a dark background often fail." },
      { q: "Which scanner does Krea use?", a: "If your browser has the built-in BarcodeDetector that reads both QR codes and barcodes, Krea uses it. Otherwise it loads its own scanner library, which runs on your device. The Scan tab tells you which one is active." },
    ],
    icon: "barcode",
  },
  "code",
);
