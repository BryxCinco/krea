/** Tool 5: Background Remover. In-browser segmentation model, optional replacement colour. */
import { cutOutSubject, type CutoutModel } from "@/lib/bg-removal";
import { IMAGE_MIMES, renameFile } from "@/lib/file-type";
import { createCanvas, decodeImage, encodeCanvas } from "@/lib/image-utils";
import type { Tool } from "../types";

export const removeBackground: Tool = {
  id: 5,
  slug: "background-remover",
  name: "Background Remover",
  verb: "Remove Background",
  category: "image",
  description: "Cut out the subject with an AI model that runs on your device. Keep it transparent or add a colour.",
  accepts: IMAGE_MIMES,
  output: "image",
  seoTitle: "Background Remover: on-device AI, no upload",
  seoDescription:
    "Remove image backgrounds privately. The AI model runs in your browser, so your photo is never uploaded. Export transparent PNG or a solid colour.",
  howTo: [
    "Drop a photo on the Stage.",
    "The first run downloads the AI model once (about 40 to 80 MB). After that it works offline.",
    "Keep the background transparent or pick a replacement colour, then download the PNG.",
  ],
  faqs: [
    { q: "Is my photo sent to an AI service?", a: "No. The AI model is downloaded from this site once and runs inside your browser. Your photo never leaves your device." },
    { q: "Why is the first run slow?", a: "The first time, your browser loads the AI model (about 44 MB for Fast). After that it is cached, so later runs start in a few seconds and also work offline." },
    { q: "Which model should I use?", a: "Fast works well for most portraits and products. Detailed is twice the download and handles hair and fine edges better." },
    { q: "Can I put a white background instead of transparent?", a: "Yes. Under New background choose Solid colour and pick any colour, for example white for an ID photo." },
  ],
  icon: "cutout",
  worker: "image",
  input: "each",
  compare: true,
  fields: [
    {
      key: "model",
      label: "Model",
      type: "select",
      default: "isnet_quint8",
      hint: "Fast is a smaller download and good for most photos. Detailed handles hair and edges better.",
      options: [
        { value: "isnet_quint8", label: "Fast (about 40 MB)" },
        { value: "isnet_fp16", label: "Detailed (about 80 MB)" },
      ],
    },
    {
      key: "fill",
      label: "New background",
      type: "select",
      default: "transparent",
      options: [
        { value: "transparent", label: "Transparent" },
        { value: "color", label: "Solid colour" },
      ],
    },
    { key: "color", label: "Colour", type: "color", default: "#ffffff", showIf: (v) => v.fill === "color" },
  ],

  async run([file], options, ctx) {
    // Decode first so corrupt or oversized files fail with our own clear errors.
    (await decodeImage(file)).close();
    let blob = await cutOutSubject(file.blob, options.model as CutoutModel, ctx);

    if (options.fill === "color") {
      const cutout = await createImageBitmap(blob);
      const { canvas, ctx: draw } = createCanvas(cutout.width, cutout.height);
      draw.fillStyle = String(options.color);
      draw.fillRect(0, 0, canvas.width, canvas.height);
      draw.drawImage(cutout, 0, 0);
      cutout.close();
      blob = await encodeCanvas(canvas, "image/png");
    }
    return { files: [{ name: renameFile(file.name, "png", "-no-bg"), type: "image/png", blob }] };
  },
};
