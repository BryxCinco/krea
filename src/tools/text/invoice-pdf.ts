/**
 * Invoice Generator (tool 23): the invoice as a real PDF with selectable text, built with
 * pdf-lib's standard fonts. Loaded only when Download PDF is pressed (pdf-lib is imported
 * inside the function). Standard fonts are WinAnsi only, so every string goes through
 * fontSanitizer: the peso sign prints as "PHP", and a currency whose symbol the font lacks
 * (won, for example) is written with its code instead ("KRW 1,000").
 */
import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { fontSanitizer, PAGE_SIZES, wrapLine } from "@/lib/pdf-text";
import { KreaError } from "../types";
import { formatMoney, invoiceTotals, type InvoiceData } from "./invoice";

export interface PdfLogo {
  bytes: Uint8Array;
  kind: "png" | "jpg";
}

export interface InvoicePdfResult {
  bytes: Uint8Array;
  /** Characters the font could not print, written as "?". */
  replaced: number;
  /** The logo could not be read and was left out. */
  logoSkipped: boolean;
}

const MARGIN = 48;
const FOOTER = 36;

const longDate = (iso: string) => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
};

export async function invoicePdf(data: InvoiceData, logo: PdfLogo | null): Promise<InvoicePdfResult> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.36, 0.37, 0.4);
  const accent = rgb(0.176, 0.227, 0.063);
  const rule = rgb(0.89, 0.89, 0.9);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${data.number}`.trim());
  pdf.setProducer("Krea");
  pdf.setCreator("Krea");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const plain = fontSanitizer(regular);
  const strong = fontSanitizer(bold);
  const clean = (font: PDFFont, text: string) => (font === bold ? strong : plain).clean(text);

  // Money: the currency symbol when the font has it (₱ becomes "PHP " via the sanitizer), else the ISO code.
  const supported = new Set(regular.getCharacterSet());
  const symbolOk = [...formatMoney(1, data.currency)].every((char) => char === "₱" || supported.has(char.codePointAt(0) ?? 0) || /\s/.test(char));
  const money = (value: number) => formatMoney(value, data.currency, symbolOk ? "symbol" : "code");

  let image: PDFImage | null = null;
  let logoSkipped = false;
  if (logo) {
    try {
      image = logo.kind === "png" ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
    } catch {
      logoSkipped = true;
    }
  }

  const [width, height] = PAGE_SIZES[data.paper] ?? PAGE_SIZES.a4;
  const right = width - MARGIN;
  const contentWidth = width - MARGIN * 2;
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([width, height]);
    pages.push(page);
    y = height - MARGIN;
  };
  const draw = (text: string, x: number, top: number, size: number, font: PDFFont = regular, color = ink) => {
    const value = clean(font, text);
    if (value) page.drawText(value, { x, y: top, size, font, color });
  };
  const drawRight = (text: string, x: number, top: number, size: number, font: PDFFont = regular, color = ink) => {
    const value = clean(font, text);
    if (value) page.drawText(value, { x: x - font.widthOfTextAtSize(value, size), y: top, size, font, color });
  };
  const wrap = (text: string, font: PDFFont, size: number, maxWidth: number) =>
    text.split("\n").flatMap((line) => wrapLine(clean(font, line), font, size, maxWidth));
  const line = (x1: number, x2: number, at: number, thickness: number, color = rule) => page.drawLine({ start: { x: x1, y: at }, end: { x: x2, y: at }, thickness, color });
  /** Start a new page when `needed` points do not fit above the footer. */
  const room = (needed: number) => {
    if (y - needed < MARGIN + FOOTER) newPage();
  };

  newPage();
  const totals = invoiceTotals(data);

  // ---------------------------------------------------------------- header
  const leftWidth = contentWidth * 0.55;
  let left = y;
  if (image) {
    const scale = Math.min(170 / image.width, 56 / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: MARGIN, y: left - h, width: w, height: h });
    left -= h + 14;
  }
  draw(data.from.name || "Your name or business", MARGIN, left - 12, 13, bold, data.from.name ? ink : muted);
  left -= 18;
  for (const text of wrap(data.from.details, regular, 9.5, leftWidth)) {
    left -= 13;
    draw(text, MARGIN, left, 9.5, regular, muted);
  }

  let top = y;
  drawRight("INVOICE", right, top - 24, 24, bold, accent);
  top -= 40;
  const meta: [string, string][] = [
    ["Invoice no.", data.number],
    ["Date", longDate(data.issueDate)],
    ...(data.dueDate ? ([["Due", longDate(data.dueDate)]] as [string, string][]) : []),
  ];
  for (const [label, value] of meta) {
    top -= 14;
    drawRight(label, right - 130, top, 9.5, regular, muted);
    drawRight(value, right, top, 9.5, bold);
  }
  y = Math.min(left, top) - 30;

  // ---------------------------------------------------------------- bill to
  draw("BILL TO", MARGIN, y, 8, bold, muted);
  y -= 16;
  draw(data.to.name || "Client name", MARGIN, y, 12, bold, data.to.name ? ink : muted);
  for (const text of wrap(data.to.details, regular, 9.5, leftWidth)) {
    y -= 13;
    draw(text, MARGIN, y, 9.5, regular, muted);
  }
  y -= 30;

  // ---------------------------------------------------------------- items
  const amountX = right;
  const rateX = right - 100;
  const qtyX = right - 205;
  const descWidth = qtyX - 60 - MARGIN;
  const tableHeader = () => {
    draw("DESCRIPTION", MARGIN, y, 8, bold, muted);
    drawRight("QTY", qtyX, y, 8, bold, muted);
    drawRight("RATE", rateX, y, 8, bold, muted);
    drawRight("AMOUNT", amountX, y, 8, bold, muted);
    y -= 7;
    line(MARGIN, right, y, 1.5, accent);
    y -= 15;
  };
  room(60);
  tableHeader();
  data.items.forEach((item, index) => {
    const lines = wrap(item.description, regular, 9.5, descWidth);
    const rowHeight = Math.max(1, lines.length) * 13 + 9;
    if (y - rowHeight < MARGIN + FOOTER) {
      newPage();
      tableHeader();
    }
    const first = y;
    if (item.description.trim()) lines.forEach((text, i) => draw(text, MARGIN, first - i * 13, 9.5));
    else draw("Item description", MARGIN, first, 9.5, regular, muted);
    drawRight(String(Number.isFinite(item.quantity) ? item.quantity : 0), qtyX, first, 9.5);
    drawRight(money(item.rate), rateX, first, 9.5);
    drawRight(money(totals.lines[index]), amountX, first, 9.5);
    y = first - rowHeight + 13;
    line(MARGIN, right, y + 4, 0.5);
    y -= 13;
  });

  // ---------------------------------------------------------------- totals
  const rows: [string, string][] = [["Subtotal", money(totals.subtotal)]];
  if (totals.discount) rows.push([data.discountMode === "percent" ? `Discount (${data.discount}%)` : "Discount", `-${money(totals.discount)}`]);
  if (data.taxRate) rows.push([`${data.taxLabel || "Tax"} (${data.taxRate}%)`, money(totals.tax)]);
  room(rows.length * 16 + 40);
  const labelX = right - 220;
  y -= 4;
  for (const [label, value] of rows) {
    draw(label, labelX, y, 9.5, regular, muted);
    drawRight(value, right, y, 9.5);
    y -= 16;
  }
  y += 6;
  line(labelX, right, y, 1.5, accent);
  y -= 18;
  draw("Total", labelX, y, 13, bold);
  drawRight(money(totals.total), right, y, 13, bold, accent);
  y -= 34;

  // ---------------------------------------------------------------- payment details and notes
  const block = (label: string, text: string) => {
    if (!text.trim()) return;
    room(40);
    draw(label, MARGIN, y, 8, bold, muted);
    y -= 15;
    for (const entry of wrap(text, regular, 9.5, contentWidth)) {
      room(13);
      draw(entry, MARGIN, y, 9.5);
      y -= 13;
    }
    y -= 14;
  };
  block("PAYMENT DETAILS", data.payment);
  block("NOTES", data.notes);

  // ---------------------------------------------------------------- footer on every page
  pages.forEach((entry, index) => {
    const footer = clean(regular, `${data.number ? `Invoice ${data.number} · ` : ""}Page ${index + 1} of ${pages.length}`);
    entry.drawText(footer, { x: (width - regular.widthOfTextAtSize(footer, 8)) / 2, y: MARGIN - 20, size: 8, font: regular, color: muted });
  });

  let bytes: Uint8Array;
  try {
    bytes = await pdf.save();
  } catch {
    throw new KreaError("failed", "Hindi nagawa ang PDF. Try again, or use Print and choose Save as PDF.");
  }
  return { bytes, replaced: plain.state.replaced + strong.state.replaced, logoSkipped };
}
