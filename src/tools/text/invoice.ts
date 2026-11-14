/** Tool 23: Invoice Generator. Line items, tax, discount, peso totals, PDF export. */
import { esc, htmlDocument, safeImageSrc, type PaperSize } from "./doc-utils";
import { editorTool } from "./editor-tool";

export const invoice = editorTool({
  id: 23,
  slug: "invoice-generator",
  name: "Invoice Generator",
  verb: "Make Invoice",
  description: "Invoices with line items, tax, discount and peso totals. Add your logo, then save as PDF. Data stays on this device.",
  seoTitle: "Invoice Generator Philippines: peso invoices as PDF, no sign-up",
  seoDescription:
    "Create a clean invoice in pesos with line items, VAT or tax, discount and totals. Add your logo and save as PDF. Free, private and stored only in your browser.",
  howTo: [
    "Fill in your details, your client's details, the invoice number and dates.",
    "Add line items with quantity and rate. Set tax and discount; totals update as you type.",
    "Press Save as PDF and choose Save as PDF in the print dialog.",
  ],
  faqs: [
    { q: "Where is my invoice data stored?", a: "Only in this browser's local storage on your device. Nothing is uploaded. Use Clear data to remove it." },
    {
      q: "Is this a BIR-registered official receipt or invoice?",
      a: "No. It is a document for billing clients. If you are VAT-registered or need BIR-registered invoices, follow your BIR registration requirements.",
    },
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

export interface InvoiceData {
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

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: number) => (Number.isFinite(value) ? value : 0);

export function invoiceTotals(data: InvoiceData): InvoiceTotals {
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

export function newInvoice(): InvoiceData {
  return {
    number: "INV-0001",
    issueDate: todayIso(),
    dueDate: todayIso(15),
    from: { name: "", details: "" },
    to: { name: "", details: "" },
    items: [{ id: "item-1", description: "", quantity: 1, rate: 0 }],
    taxRate: 0,
    taxLabel: "VAT",
    discountMode: "amount",
    discount: 0,
    notes: "Salamat po! Payment via bank transfer or GCash.",
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
`;

/** The invoice as a standalone HTML document (preview and print). */
export function invoiceDocument(data: InvoiceData): string {
  const totals = invoiceTotals(data);
  const logo = safeImageSrc(data.logo);
  const rows = data.items
    .map(
      (item, index) => `<tr>
        <td>${multiline(item.description) || '<span class="empty">Item description</span>'}</td>
        <td class="num">${esc(num(item.quantity))}</td>
        <td class="num">${formatPeso(item.rate)}</td>
        <td class="num">${formatPeso(totals.lines[index])}</td>
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
      <h1>INVOICE</h1>
      <dl>
        <dt>Invoice no.</dt><dd>${esc(data.number)}</dd>
        <dt>Date</dt><dd>${esc(longDate(data.issueDate))}</dd>
        ${data.dueDate ? `<dt>Due</dt><dd>${esc(longDate(data.dueDate))}</dd>` : ""}
      </dl>
    </div>
  </header>
  <section class="parties">
    <div>
      <div class="label">Bill to</div>
      <div class="name">${esc(data.to.name) || '<span class="empty">Client name</span>'}</div>
      <div>${multiline(data.to.details)}</div>
    </div>
  </section>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${formatPeso(totals.subtotal)}</span></div>
    ${totals.discount ? `<div><span>${discountLabel}</span><span>-${formatPeso(totals.discount)}</span></div>` : ""}
    ${num(data.taxRate) ? `<div><span>${esc(data.taxLabel || "Tax")} (${esc(num(data.taxRate))}%)</span><span>${formatPeso(totals.tax)}</span></div>` : ""}
    <div class="grand"><span>Total</span><span>${formatPeso(totals.total)}</span></div>
  </div>
  ${data.notes.trim() ? `<div class="notes">${esc(data.notes)}</div>` : ""}
</div>`;
  return htmlDocument({ title: `Invoice ${data.number}`, css: CSS, body, paper: data.paper });
}
