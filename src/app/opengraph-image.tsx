import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Krea: private image, PDF and document tools that run on your device";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    eyebrow: "54 tools, zero uploads",
    title: "Your files never leave your device.",
    subtitle: "Compress, convert, sign and protect images and PDFs, plus resumes, invoices and QR codes. Free, private, works offline.",
  });
}
