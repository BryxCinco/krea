/**
 * Tool 23: Invoice Generator. Line items, tax, discount and totals in pesos or another
 * currency. Two exports: Download PDF (pdf-lib, real text, built in invoice-pdf.ts) and
 * Print (the HTML document below through the browser's print dialog).
 * Drafts and sender details are kept in localStorage on this device only.
 */
import { esc, htmlDocument, safeImageSrc, type PaperSize } from "./doc-utils";
import { editorTool } from "./editor-tool";

export const invoice = editorTool({
  id: 23,
  slug: "invoice-generator",
  name: "Invoice Generator",
  verb: "Make Invoice",
  description: "Invoices with line items, tax, discount and totals in pesos, dollars and more. Add your logo and download a PDF. Data stays on this device.",
  seoTitle: "Invoice Generator Philippines: free PDF invoices in PHP, USD and more",
  seoDescription:
    "Create a clean invoice in pesos, US dollars, euros or other currencies with line items, tax, discount, payment details and your logo, then download an A4 PDF. Free, no sign-up, saved only in your browser.",
  howTo: [
    "Fill in your details, your client's details, the invoice number, dates and currency.",
    "Add line items with quantity and rate, then tax and discount if any. Totals update as you type.",
    "Add how to pay you, then press Download PDF. Print is there too.",
  ],
  faqs: [
    { q: "Where is my invoice data stored?", a: "Only in this browser's local storage on your device, so your draft and your sender details are there next time. Nothing is uploaded. Use Clear data to remove it." },
    {
      q: "Is this an official BIR receipt or invoice?",
      a: "No. It is a guide and a billing document for your clients, not an official receipt. BIR-registered businesses must issue the official receipts or invoices registered with the BIR.",
    },
    { q: "Can I bill in US dollars or another currency?", a: "Yes. Pick PHP, USD, EUR, SGD, JPY and others; amounts are formatted for that currency. In the PDF the peso sign is written as PHP, because standard PDF fonts do not include it." },
    { q: "How are tax and discount computed?", a: "The discount is taken off the subtotal first, then tax is added on the discounted amount. Each line is rounded to the centavo." },
    { q: "Can I add my logo?", a: "Yes. Pick an image from your device; it is stored with the invoice data in your browser only." },
  ],
  icon: "invoice",
});

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

/** The billing documents the invoice editor makes. Quotation and receipt belong to tool 57. */
export type DocKind = "invoice" | "quotation" | "receipt";

export interface DocLabels {
  name: string;
  title: string;
  number: string;
  /** Label of the second date, or null when the document has none. */
  due: string | null;
  party: string;
  total: string;
  prefix: string;
  /** File name stem for downloads. */
  file: string;
}

export const DOC_LABELS: Record<DocKind, DocLabels> = {
  invoice: { name: "Invoice", title: "INVOICE", number: "Invoice no.", due: "Due", party: "Bill to", total: "Total", prefix: "INV", file: "invoice" },
  quotation: { name: "Quotation", title: "QUOTATION", number: "Quote no.", due: "Valid until", party: "Prepared for", total: "Total", prefix: "QUO", file: "quotation" },
  receipt: { name: "Acknowledgement receipt", title: "ACKNOWLEDGEMENT RECEIPT", number: "Receipt no.", due: null, party: "Received from", total: "Amount received", prefix: "AR", file: "receipt" },
};

export const DEFAULT_NOTES: Record<DocKind, string> = {
  invoice: "Salamat po!",
  quotation: "Prices are valid until the date above. 50% down payment to start, balance upon completion.",
  receipt: "Salamat po sa bayad!",
};

/** Printed at the bottom of every acknowledgement receipt. */
export const RECEIPT_DISCLAIMER = "This acknowledgement receipt is not a BIR-registered invoice or official receipt.";

/** Labels for a document, falling back to the invoice for unknown data. */
export const labelsFor = (kind: DocKind | undefined): DocLabels => DOC_LABELS[kind ?? "invoice"] ?? DOC_LABELS.invoice;

export interface InvoiceData {
  kind: DocKind;
  number: string;
  issueDate: string;
  dueDate: string;
  from: { name: string; details: string };
  to: { name: string; details: string };
  items: LineItem[];
  /** Tax rate in percent, e.g. 12 for VAT. */
  taxRate: number;
  taxLabel: string;
  discountMode: "amount" | "percent";
  discount: number;
  notes: string;
  /** How to pay: bank account, GCash or Maya number. Not shown on receipts. */
  payment: string;
  /** How the client paid (receipts only), e.g. "GCash, ref. 1234". */
  paymentMethod: string;
  /** Who signs: "Prepared by" on a quotation, "Received by" on a receipt. */
  signer: string;
  /** ISO 4217 code, e.g. "PHP". */
  currency: string;
  /** Logo as a data URL, "" when none. */
  logo: string;
  paper: PaperSize;
}

export interface InvoiceTotals {
  lines: number[];
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

const num = (value: number) => (Number.isFinite(value) ? value : 0);

/** Currencies offered in the editor. Any other valid ISO code from an old draft still works. */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "PHP", label: "PHP, Philippine peso" },
  { code: "USD", label: "USD, US dollar" },
  { code: "EUR", label: "EUR, euro" },
  { code: "SGD", label: "SGD, Singapore dollar" },
  { code: "JPY", label: "JPY, Japanese yen" },
  { code: "GBP", label: "GBP, British pound" },
  { code: "AUD", label: "AUD, Australian dollar" },
  { code: "CAD", label: "CAD, Canadian dollar" },
  { code: "HKD", label: "HKD, Hong Kong dollar" },
  { code: "AED", label: "AED, UAE dirham" },
  { code: "SAR", label: "SAR, Saudi riyal" },
  { code: "KRW", label: "KRW, South Korean won" },
  { code: "CNY", label: "CNY, Chinese yuan" },
];

const formatters = new Map<string, Intl.NumberFormat>();
/** Intl formatter for a currency, falling back to PHP for an unknown code. */
function moneyFormat(currency: string, display: "symbol" | "code" = "symbol"): Intl.NumberFormat {
  const key = `${currency}:${display}`;
  let format = formatters.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat("en-PH", { style: "currency", currency, currencyDisplay: display });
    } catch {
      format = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", currencyDisplay: display });
    }
    formatters.set(key, format);
  }
  return format;
}

/** 2 for most currencies, 0 for yen and won. */
export const currencyDigits = (currency: string) => moneyFormat(currency).resolvedOptions().maximumFractionDigits ?? 2;

/** "₱1,234.50", "$1,234.50", "¥1,235". `display: "code"` gives "KRW 1,235" for fonts without the symbol. */
export function formatMoney(value: number, currency: string, display: "symbol" | "code" = "symbol"): string {
  return moneyFormat(currency, display).format(num(value));
}

/** The symbol alone ("₱", "$", "¥"), for input units. */
export function currencySymbol(currency: string): string {
  return moneyFormat(currency).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

export function invoiceTotals(data: InvoiceData): InvoiceTotals {
  // Round to the currency's smallest unit (centavo, cent; whole yen and won).
  const factor = 10 ** currencyDigits(data.currency || "PHP");
  const round = (value: number) => Math.round((value + Number.EPSILON) * factor) / factor;
  const lines = data.items.map((item) => round(num(item.quantity) * num(item.rate)));
  const subtotal = round(lines.reduce((sum, line) => sum + line, 0));
  const rawDiscount = data.discountMode === "percent" ? (subtotal * num(data.discount)) / 100 : num(data.discount);
  const discount = round(Math.min(subtotal, Math.max(0, rawDiscount)));
  const taxable = round(subtotal - discount);
  const tax = round((taxable * Math.max(0, num(data.taxRate))) / 100);
  return { lines, subtotal, discount, taxable, tax, total: round(taxable + tax) };
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const formatPeso = (value: number) => peso.format(num(value));

const longDate = (iso: string) => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
};

const multiline = (text: string) => esc(text).replaceAll("\n", "<br>");

export function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function newInvoice(kind: DocKind = "invoice"): InvoiceData {
  return {
    kind,
    number: `${DOC_LABELS[kind].prefix}-0001`,
    issueDate: todayIso(),
    dueDate: kind === "receipt" ? "" : todayIso(kind === "quotation" ? 30 : 15),
    from: { name: "", details: "" },
    to: { name: "", details: "" },
    items: [{ id: "item-1", description: "", quantity: 1, rate: 0 }],
    taxRate: 0,
    taxLabel: "VAT",
    discountMode: "amount",
    discount: 0,
    notes: DEFAULT_NOTES[kind],
    payment: "",
    paymentMethod: kind === "receipt" ? "Cash" : "",
    signer: "",
    currency: "PHP",
    logo: "",
    paper: "a4",
  };
}

const CSS = `
.inv { font-size: 13px; }
.inv header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
.inv .logo { max-height: 64px; max-width: 200px; object-fit: contain; display: block; margin-bottom: 12px; }
.inv h1 { font-size: 28px; letter-spacing: 0.08em; margin: 0; color: #2d3a10; }
.inv .meta { text-align: right; }
.inv .meta dl { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 8px 0 0; }
.inv .meta dt { color: #5b5d66; }
.inv .meta dd { margin: 0; font-weight: 600; }
.inv .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 28px 0; }
.inv .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #5b5d66; margin-bottom: 4px; }
.inv .name { font-weight: 700; font-size: 15px; }
.inv table { width: 100%; border-collapse: collapse; }
.inv th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #5b5d66; border-bottom: 2px solid #2d3a10; padding: 8px 6px; }
.inv td { border-bottom: 1px solid #e4e4e7; padding: 9px 6px; vertical-align: top; }
.inv .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.inv tr { break-inside: avoid; }
.inv .totals { margin-left: auto; width: min(320px, 100%); margin-top: 16px; }
.inv .totals div { display: flex; justify-content: space-between; padding: 4px 6px; font-variant-numeric: tabular-nums; }
.inv .totals .grand { border-top: 2px solid #2d3a10; margin-top: 6px; padding-top: 10px; font-size: 18px; font-weight: 700; }
.inv .notes { margin-top: 32px; color: #3f4046; white-space: pre-line; }
.inv .empty { color: #8a8b93; }
.inv .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; break-inside: avoid; }
.inv .sign { border-top: 1px solid #16171a; padding-top: 6px; font-size: 12px; color: #3f4046; }
.inv .sign strong { display: block; color: #16171a; font-size: 13px; }
.inv .disclaimer { margin-top: 28px; font-size: 11px; color: #5b5d66; text-align: center; }
`;

/** The invoice, quotation or receipt as a standalone HTML document (preview and print). */
export function invoiceDocument(data: InvoiceData): string {
  const labels = labelsFor(data.kind);
  const totals = invoiceTotals(data);
  const money = (value: number) => formatMoney(value, data.currency);
  const logo = safeImageSrc(data.logo);
  const rows = data.items
    .map(
      (item, index) => `<tr>
        <td>${multiline(item.description) || '<span class="empty">Item description</span>'}</td>
        <td class="num">${esc(num(item.quantity))}</td>
        <td class="num">${money(item.rate)}</td>
        <td class="num">${money(totals.lines[index])}</td>
      </tr>`,
    )
    .join("");
  const discountLabel = data.discountMode === "percent" ? `Discount (${esc(num(data.discount))}%)` : "Discount";

  const body = `<div class="inv">
  <header>
    <div>
      ${logo ? `<img class="logo" src="${logo}" alt="">` : ""}
      <div class="name">${esc(data.from.name) || '<span class="empty">Your name or business</span>'}</div>
      <div>${multiline(data.from.details)}</div>
    </div>
    <div class="meta">
      <h1>${labels.title}</h1>
      <dl>
        <dt>${labels.number}</dt><dd>${esc(data.number)}</dd>
        <dt>Date</dt><dd>${esc(longDate(data.issueDate))}</dd>
        ${labels.due && data.dueDate ? `<dt>${labels.due}</dt><dd>${esc(longDate(data.dueDate))}</dd>` : ""}
        ${data.kind === "receipt" && data.paymentMethod.trim() ? `<dt>Paid by</dt><dd>${esc(data.paymentMethod)}</dd>` : ""}
      </dl>
    </div>
  </header>
  <section class="parties">
    <div>
      <div class="label">${labels.party}</div>
      <div class="name">${esc(data.to.name) || '<span class="empty">Client name</span>'}</div>
      <div>${multiline(data.to.details)}</div>
    </div>
  </section>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(totals.subtotal)}</span></div>
    ${totals.discount ? `<div><span>${discountLabel}</span><span>-${money(totals.discount)}</span></div>` : ""}
    ${num(data.taxRate) ? `<div><span>${esc(data.taxLabel || "Tax")} (${esc(num(data.taxRate))}%)</span><span>${money(totals.tax)}</span></div>` : ""}
    <div class="grand"><span>${labels.total}</span><span>${money(totals.total)}</span></div>
  </div>
  ${data.kind !== "receipt" && data.payment.trim() ? `<div class="notes"><div class="label">Payment details</div>${esc(data.payment)}</div>` : ""}
  ${data.notes.trim() ? `<div class="notes">${esc(data.notes)}</div>` : ""}
  ${signatures(data)}
  ${data.kind === "receipt" ? `<p class="disclaimer">${RECEIPT_DISCLAIMER}</p>` : ""}
</div>`;
  return htmlDocument({ title: `${labels.name} ${data.number}`, css: CSS, body, paper: data.paper });
}

/** Signature lines: "Prepared by" and the client's Conforme on quotations, "Received by" on receipts. */
function signatures(data: InvoiceData): string {
  if (data.kind !== "quotation" && data.kind !== "receipt") return "";
  const signer = esc(data.signer) || "&nbsp;";
  if (data.kind === "receipt") {
    return `<div class="signs"><div></div><div class="sign"><strong>${signer}</strong>Received by (signature over printed name)</div></div>`;
  }
  return `<div class="signs"><div class="sign"><strong>${signer}</strong>Prepared by</div><div class="sign"><strong>&nbsp;</strong>Conforme: ${esc(data.to.name) || "client"} (signature over printed name and date)</div></div>`;
}
