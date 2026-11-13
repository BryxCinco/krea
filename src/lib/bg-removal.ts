/**
 * Shared wrapper around @imgly/background-removal (used by the Background
 * Remover and the ID Photo Maker). The library and its ONNX model are loaded
 * only when a tool actually needs them.
 *
 * Privacy note: the photo is processed entirely on this device. The only
 * network traffic is a one-time download of the model weights from IMG.LY's
 * public CDN; the service worker caches them so later runs work offline.
 */
import { KreaError, type RunContext } from "@/tools/types";

export type CutoutModel = "isnet_quint8" | "isnet_fp16";

/** Returns a transparent-background PNG of the subject. */
export async function cutOutSubject(image: Blob, model: CutoutModel, ctx: RunContext): Promise<Blob> {
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    return await removeBackground(image, {
      model,
      output: { format: "image/png" },
      progress: (key, current, total) => {
        if (key.startsWith("fetch")) {
          // First run only: model download. Reserve the first 60% of the bar for it.
          ctx.progress(total ? (current / total) * 0.6 : 0, "Downloading the AI model (one time lang ito)");
        } else {
          ctx.progress(0.6 + (total ? (current / total) * 0.4 : 0), "Removing background");
        }
      },
    });
  } catch (error) {
    if (error instanceof KreaError) throw error;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new KreaError(
      "failed",
      offline
        ? "The background model has not been downloaded yet. Connect once to fetch it, then it works offline."
        : "Background removal failed on this device. Try the Fast model or a smaller image.",
    );
  }
}
