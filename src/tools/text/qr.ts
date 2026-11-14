/**
 * Tool 24: QR Code Generator. Text, URL, Wi-Fi and payment details.
 *
 * Honest labelling: the payment option makes a plain-text QR code with your
 * account details. It is NOT an official QR Ph / EMVCo payment code, so
 * scanning it in a bank or e-wallet app will not start a payment; the person
 * scanning sees the text and enters the details themselves.
 */
import { editorTool } from "./editor-tool";

export const qr = editorTool({
  id: 24,
  slug: "qr-code-generator",
  name: "QR Code Generator",
  verb: "Make QR",
  description: "QR codes for text, links, Wi-Fi and payment details. Pick colours, size and error correction; export PNG or SVG.",
  seoTitle: "QR Code Generator: URL, Wi-Fi and payment details, PNG and SVG",
  seoDescription:
    "Make QR codes for links, text, Wi-Fi logins and GCash or bank details in your browser. Custom colours and size, PNG and SVG download. No sign-up, no tracking.",
  howTo: [
    "Choose what the QR code holds: text, a link, Wi-Fi login or payment details.",
    "Fill in the details and adjust colours, size and error correction.",
    "Download PNG for sharing or SVG for printing at any size. Test it with your phone camera first.",
  ],
  faqs: [
    { q: "Do these QR codes expire or track scans?", a: "No. The code holds your data directly. There is no redirect, no tracking and no expiry." },
    {
      q: "Is the GCash or bank QR an official payment code?",
      a: "No. It is a plain-text QR with your account details. Scanning it shows the text; it does not open a payment screen. For a scan-to-pay code, use the QR Ph code from your bank or e-wallet app.",
    },
    { q: "Which error correction level should I use?", a: "M is a good default. Use Q or H if the code will be printed small, may get dirty, or has a logo over it; the code becomes denser." },
    { q: "PNG or SVG?", a: "PNG for messaging and social media. SVG for printing, because it stays sharp at any size." },
  ],
  icon: "qr",
});

export type QrKind = "text" | "url" | "wifi" | "payment";
export type ErrorLevel = "L" | "M" | "Q" | "H";

export interface QrData {
  kind: QrKind;
  text: string;
  url: string;
  wifi: { ssid: string; password: string; security: "WPA" | "WEP" | "nopass"; hidden: boolean };
  payment: { provider: string; accountName: string; accountNumber: string; amount: string; note: string };
  style: { foreground: string; background: string; size: number; margin: number; level: ErrorLevel };
}

export const QR_DEFAULTS: QrData = {
  kind: "url",
  text: "",
  url: "https://",
  wifi: { ssid: "", password: "", security: "WPA", hidden: false },
  payment: { provider: "GCash", accountName: "", accountNumber: "", amount: "", note: "" },
  style: { foreground: "#111111", background: "#ffffff", size: 512, margin: 2, level: "M" },
};

/** Escape Wi-Fi field values: backslash, semicolon, comma, colon and quote are special. */
const wifiEscape = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");

/**
 * The text encoded in the QR code. Wi-Fi uses the widely supported
 * "WIFI:T:...;S:...;P:...;;" format that phone cameras recognise.
 * Returns an empty string when there is nothing to encode yet.
 */
export function qrPayload(data: QrData): string {
  switch (data.kind) {
    case "text":
      return data.text;
    case "url": {
      const url = data.url.trim();
      return url === "https://" || url === "http://" ? "" : url;
    }
    case "wifi": {
      const { ssid, password, security, hidden } = data.wifi;
      if (!ssid.trim()) return "";
      const parts = [`T:${security}`, `S:${wifiEscape(ssid)}`];
      if (security !== "nopass") parts.push(`P:${wifiEscape(password)}`);
      if (hidden) parts.push("H:true");
      return `WIFI:${parts.join(";")};;`;
    }
    case "payment": {
      const { provider, accountName, accountNumber, amount, note } = data.payment;
      if (!accountNumber.trim() && !accountName.trim()) return "";
      const lines = [
        `${provider.trim() || "Payment"} details`,
        accountName.trim() && `Name: ${accountName.trim()}`,
        accountNumber.trim() && `Account: ${accountNumber.trim()}`,
        amount.trim() && `Amount: PHP ${amount.trim()}`,
        note.trim() && `Note: ${note.trim()}`,
      ];
      return lines.filter(Boolean).join("\n");
    }
  }
}

/** Relative luminance contrast between two hex colours (WCAG formula). */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = (hex.replace("#", "").match(/\w\w/g) ?? ["00", "00", "00"]).map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
