/**
 * Tool 18: Protect / Unlock PDF.
 * Real AES-256 encryption and decryption through qpdf (WebAssembly). Unlocking
 * requires the correct password: Krea does not crack or bypass passwords.
 */
import { PDF_MIME, renameFile } from "@/lib/file-type";
import { pdfBlob } from "@/lib/pdf-utils";
import { QpdfError, runQpdf } from "@/lib/qpdf";
import { KreaError, type Tool } from "../types";

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}

export const protectPdf: Tool = {
  id: 18,
  slug: "protect-pdf",
  name: "Protect / Unlock PDF",
  verb: "Protect / Unlock",
  category: "pdf",
  description: "Add a password with AES-256 encryption, or remove the password from a PDF you can already open.",
  accepts: [PDF_MIME],
  output: "pdf",
  seoTitle: "Protect or Unlock PDF: AES-256 password, offline",
  seoDescription:
    "Password-protect a PDF with real AES-256 encryption, or remove a password you know, all in your browser. The password and the file never leave your device.",
  howTo: [
    "Drop a PDF on the Stage.",
    "To protect: type a password and choose what readers may do. To unlock: type the current password.",
    "Download the new PDF. Tandaan ang password: Krea cannot recover it for you.",
  ],
  icon: "lock",
  worker: "pdf",
  input: "each",
  acceptsLocked: true,
  notChainable: "Passwords are never stored, so this Move cannot be saved in a chain.",
  fields: [
    {
      key: "mode",
      label: "Action",
      type: "select",
      default: "protect",
      options: [
        { value: "protect", label: "Add password" },
        { value: "unlock", label: "Remove password" },
      ],
    },
    {
      key: "password",
      label: "Password",
      type: "text",
      secret: true,
      default: "",
      hint: "Never stored or sent. For unlocking, this must be the PDF's current password.",
    },
    { key: "allowPrint", label: "Allow printing", type: "toggle", default: true, showIf: (v) => v.mode === "protect" },
    { key: "allowCopy", label: "Allow copying text", type: "toggle", default: true, showIf: (v) => v.mode === "protect" },
    { key: "allowEdit", label: "Allow editing", type: "toggle", default: false, showIf: (v) => v.mode === "protect" },
  ],

  async run([file], options, ctx) {
    const password = String(options.password);
    if (!password) {
      throw new KreaError("failed", options.mode === "unlock" ? "I-type ang current password ng PDF." : "I-type muna ang password na gusto mo.");
    }
    const input = new Uint8Array(await file.blob.arrayBuffer());
    ctx.progress(0.2, options.mode === "unlock" ? "Decrypting" : "Encrypting");

    try {
      if (options.mode === "unlock") {
        const output = await runQpdf(input, [`--password=${password}`, "--decrypt", "/in.pdf", "/out.pdf"]);
        return {
          files: [{ name: renameFile(file.name, "pdf", "-unlocked"), type: PDF_MIME, blob: pdfBlob(output) }],
          note: "Password removed. Anyone can open this copy now.",
        };
      }

      const restricted = !options.allowPrint || !options.allowCopy || !options.allowEdit;
      // Restrictions only hold if the owner password differs from the open password,
      // so use a random one that nobody (including Krea) keeps.
      const owner = restricted ? randomPassword() : password;
      const output = await runQpdf(input, [
        "--encrypt",
        password,
        owner,
        "256",
        `--print=${options.allowPrint ? "full" : "none"}`,
        `--extract=${options.allowCopy ? "y" : "n"}`,
        `--modify=${options.allowEdit ? "all" : "none"}`,
        "--",
        "/in.pdf",
        "/out.pdf",
      ]);
      return {
        files: [{ name: renameFile(file.name, "pdf", "-protected"), type: PDF_MIME, blob: pdfBlob(output) }],
        note: `Encrypted with AES-256. Itago ang password, hindi ito mare-recover.${
          restricted ? " Print, copy and edit limits are honoured by PDF readers but are not strong protection on their own." : ""
        }`,
      };
    } catch (error) {
      if (!(error instanceof QpdfError)) throw error;
      if (/invalid password/i.test(error.stderr)) {
        throw new KreaError(
          "password",
          options.mode === "unlock"
            ? `Mali ang password for "${file.name}". Check it and try again.`
            : `"${file.name}" is already password-protected. Remove its password first, then add a new one.`,
        );
      }
      throw new KreaError("corrupted", `Hindi ma-process ang "${file.name}". The PDF looks damaged.`);
    }
  },
};
