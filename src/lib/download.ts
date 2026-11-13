/** Download and ZIP helpers (main thread). JSZip is loaded only when a batch is downloaded. */
import type { WorkFile } from "@/tools/types";

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Make names unique inside a ZIP: "a.jpg", "a (2).jpg", ... */
function uniqueNames(files: WorkFile[]): string[] {
  const seen = new Map<string, number>();
  return files.map((file) => {
    const count = (seen.get(file.name) ?? 0) + 1;
    seen.set(file.name, count);
    return count === 1 ? file.name : file.name.replace(/(\.[^.]+)?$/, ` (${count})$1`);
  });
}

export async function downloadZip(files: WorkFile[], zipName: string): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = uniqueNames(files);
  files.forEach((file, i) => zip.file(names[i], file.blob));
  // Outputs are already compressed formats, so STORE avoids wasting CPU.
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  downloadBlob(blob, zipName);
}
