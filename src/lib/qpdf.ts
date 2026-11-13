/**
 * qpdf compiled to WebAssembly (worker-side). pdf-lib cannot encrypt or decrypt
 * PDFs, so Protect / Unlock uses qpdf, which implements real AES-256 PDF
 * encryption. The .wasm file is served from /vendor/qpdf (copied by copy-assets.mjs).
 */

interface QpdfInstance {
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
  };
}

/** qpdf ran and reported a problem with the file (wrong password, damaged PDF, ...). */
export class QpdfError extends Error {
  /** Everything qpdf printed to stderr, used to tell a wrong password from a damaged file. */
  stderr: string;
  constructor(stderr: string) {
    super(stderr || "qpdf failed");
    this.name = "QpdfError";
    this.stderr = stderr;
  }
}

/**
 * Run qpdf on one input file and return the output file.
 * `args` are qpdf command-line arguments; use "/in.pdf" and "/out.pdf" as the paths.
 * If the engine itself cannot load (e.g. offline before it was cached) this
 * rejects with a plain Error, not a QpdfError.
 */
export async function runQpdf(input: Uint8Array, args: string[]): Promise<Uint8Array> {
  const { default: createModule } = await import("@neslinesli93/qpdf-wasm");
  const messages: string[] = [];

  // This build ignores the `printErr` option and binds console.error when the
  // module instance is created, so swap console.error before creating it and
  // restore it afterwards. Safe: this runs alone inside a worker.
  const consoleError = console.error;
  console.error = (...parts: unknown[]) => messages.push(parts.join(" "));
  try {
    // A fresh instance per run: Emscripten programs are not designed to have main() called twice.
    const qpdf = await (createModule as unknown as (options: object) => Promise<QpdfInstance>)({
      locateFile: () => "/vendor/qpdf/qpdf.wasm",
      print: () => {},
      printErr: (line: string) => messages.push(line),
    });
    qpdf.FS.writeFile("/in.pdf", input);

    let code: number;
    try {
      code = qpdf.callMain(args);
    } catch (error) {
      // Emscripten signals exit() with an exception carrying the status code.
      const status = (error as { status?: unknown })?.status;
      code = typeof status === "number" ? status : 2;
    }
    // Exit code 3 means "succeeded with warnings": the output is still valid.
    if (code !== 0 && code !== 3) throw new QpdfError(messages.join("\n"));
    try {
      return qpdf.FS.readFile("/out.pdf");
    } catch {
      throw new QpdfError(messages.join("\n"));
    }
  } finally {
    console.error = consoleError;
  }
}
