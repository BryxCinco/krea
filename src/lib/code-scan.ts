/**
 * QR and barcode scanning. Uses the browser's own BarcodeDetector when it can read both
 * QR codes and common barcodes; otherwise it loads the barcode-detector ponyfill
 * (ZXing-C++ compiled to WebAssembly, MIT), self-hosted in /vendor/zxing. Main thread only.
 */

export interface ScanHit {
  text: string;
  /** Format id such as "qr_code" or "ean_13". */
  format: string;
}

export type ScanEngine = "native" | "fallback";

interface DetectorLike {
  detect(source: ImageBitmapSource | HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
}
interface NativeDetectorStatic {
  new (options?: { formats?: string[] }): DetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

export interface Scanner {
  engine: ScanEngine;
  detect(source: ImageBitmapSource | HTMLVideoElement): Promise<ScanHit[]>;
}

let cached: Promise<Scanner> | null = null;

/**
 * UPC-A is an EAN-13 with a leading zero, and ZXing reports it as EAN-13. Show it the way it is
 * printed on the product: 12 digits, named UPC-A.
 */
function normalize(hit: { rawValue: string; format: string }): ScanHit {
  if (hit.format === "ean_13" && /^0\d{12}$/.test(hit.rawValue)) return { text: hit.rawValue.slice(1), format: "upc_a" };
  return { text: hit.rawValue, format: hit.format };
}

/** The scanner for this browser. The fallback library is only downloaded when it is needed. */
export function getScanner(): Promise<Scanner> {
  cached ??= (async () => {
    const native = (globalThis as { BarcodeDetector?: NativeDetectorStatic }).BarcodeDetector;
    if (native) {
      try {
        const formats = await native.getSupportedFormats();
        // A native detector that only reads some formats would miss codes: use it only if it covers both families.
        if (formats.includes("qr_code") && formats.includes("code_128") && formats.includes("ean_13")) {
          const detector = new native({ formats });
          return { engine: "native", detect: async (source: ImageBitmapSource | HTMLVideoElement) => (await detector.detect(source)).map(normalize) } satisfies Scanner;
        }
      } catch {
        // Fall through to the library.
      }
    }
    const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");
    // Serve the WebAssembly file from this site instead of the library's default CDN.
    setZXingModuleOverrides({ locateFile: (path: string) => `/vendor/zxing/${path}` });
    const detector = new BarcodeDetector();
    return {
      engine: "fallback",
      detect: async (source: ImageBitmapSource | HTMLVideoElement) => (await detector.detect(source as ImageBitmapSource)).map(normalize),
    } satisfies Scanner;
  })().catch((error) => {
    cached = null;
    throw error;
  });
  return cached;
}

export const ENGINE_LABEL: Record<ScanEngine, string> = {
  native: "Your browser's built-in BarcodeDetector",
  fallback: "Krea's scanner library (ZXing, running on this device)",
};

/** A friendly message for the ways getUserMedia fails. */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (!window.isSecureContext) return "Camera needs a secure (HTTPS) page. Open Krea from its https address, or use Scan from image.";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Hindi pinayagan ang camera. Allow camera access for this site in your browser settings (the lock icon next to the address), then try again. You can still use Scan from image.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Walang nakitang camera sa device na ito. Use Scan from image instead.";
    case "NotReadableError":
    case "AbortError":
      return "Hindi ma-open ang camera: another app or tab may be using it. Close it and try again.";
    default:
      return "Hindi ma-start ang camera. Use Scan from image instead.";
  }
}
