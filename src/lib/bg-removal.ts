/**
 * Shared wrapper around @imgly/background-removal (used by the Background
 * Remover and the ID Photo Maker). The library and its ONNX model are loaded
 * only when a tool actually needs them.
 *
 * Privacy note: the photo is processed entirely on this device, and the model
 * is served from this site (/vendor/imgly, mirrored at build time by
 * copy-assets.mjs), so no request goes to a third party. The service worker
 * caches the model after first use, or ahead of time via "Make offline-ready".
 */
import { KreaError, type RunContext } from "@/tools/types";

export type CutoutModel = "isnet_quint8" | "isnet_fp16";

/** Returns a transparent-background PNG of the subject. */
export async function cutOutSubject(image: Blob, model: CutoutModel, ctx: RunContext): Promise<Blob> {
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    return await removeBackground(image, {
      model,
      device: "cpu",
      publicPath: `${self.location.origin}/vendor/imgly/`,
      output: { format: "image/png" },
      progress: (key, current, total) => {
        if (key.startsWith("fetch")) {
          // First run only: loading the model. Reserve the first 60% of the bar for it.
          ctx.progress(total ? (current / total) * 0.6 : 0, "Loading the AI model (first time lang ito)");
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
        ? "Offline ka, at hindi pa naka-save ang AI model. Use Make offline-ready (or run this tool once) while online."
        : "Background removal failed on this device. Try the Fast model or a smaller image.",
    );
  }
}
