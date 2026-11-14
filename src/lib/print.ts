/**
 * "Save as PDF" for the document editors.
 *
 * Krea prints a standalone HTML document from a hidden iframe. The browser's
 * print dialog then offers "Save as PDF", which produces a real vector PDF
 * with selectable text, exactly matching the preview, fully offline and with no
 * extra library. The trade-off: the user picks "Save as PDF" in the dialog
 * instead of getting a direct download.
 */
export function printDocument(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    // Off-screen but laid out (display: none would skip layout in some browsers).
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0" });
    document.body.appendChild(frame);

    const cleanup = () => {
      setTimeout(() => frame.remove(), 1000);
      resolve();
    };
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // Exposed for automated tests, which cannot see the native print dialog.
    (window as unknown as { __kreaLastPrint?: string }).__kreaLastPrint = html;

    const win = frame.contentWindow!;
    const images = Array.from(doc.images).map((image) => (image.complete ? Promise.resolve() : new Promise((done) => image.addEventListener("load", done, { once: true }))));
    Promise.all([...images, doc.fonts?.ready]).then(() => {
      win.addEventListener("afterprint", cleanup, { once: true });
      win.focus();
      win.print();
      // Some browsers never fire afterprint; clean up anyway.
      setTimeout(cleanup, 60_000);
    });
  });
}
