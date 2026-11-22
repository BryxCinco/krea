/**
 * Tool 57: Quotation & Receipt Maker. Price quotations with a Conforme line for the
 * client, and acknowledgement receipts for payments received. Shares the document,
 * totals, currencies, PDF and editor of Invoice Generator (23) through `DocKind` in
 * invoice.ts; UI: components/stage/editors/quote-editor.tsx, saved under its own key.
 */
import { editorTool } from "./editor-tool";

export const quotation = editorTool({
  id: 57,
  slug: "quotation-receipt-maker",
  name: "Quotation & Receipt Maker",
  verb: "Make Quote",
  description: "Price quotations with a Conforme line, and acknowledgement receipts for payments received. Download as PDF.",
  seoTitle: "Quotation & Acknowledgement Receipt Maker Philippines: free PDF",
  seoDescription:
    "Make a price quotation with line items, a validity date and a Conforme line for your client, or an acknowledgement receipt for a payment received. Pesos or other currencies, your logo, PDF download. Free, private, stored only in your browser.",
  howTo: [
    "Choose Quotation or Receipt.",
    "Fill in your details, the client, and the items with quantity and price. Totals update as you type.",
    "Press Download PDF (or Print). Use Next for the following number.",
  ],
  faqs: [
    {
      q: "Is an acknowledgement receipt the same as an official receipt?",
      a: "No. It confirms that you received a payment, which is fine between individuals and for many small transactions, but it is not a BIR-registered invoice or official receipt and cannot be used to claim expenses or input VAT. Each receipt says so at the bottom. If you are a registered business, issue your BIR-registered invoices.",
    },
    { q: "What is the Conforme line on a quotation?", a: "It is where the client signs to accept the quoted prices and terms, a common practice in the Philippines before work starts. Krea prints it with the client's name." },
    { q: "Where is my data stored?", a: "Only in this browser's storage on your device, separately from the Invoice Generator. Nothing is uploaded. Use Clear data to remove it." },
    { q: "Can I turn a quotation into a receipt?", a: "Yes. Switch the document to Receipt: the client, items and totals stay, and the layout, number prefix and signature line change." },
    { q: "Can I quote in US dollars?", a: "Yes. Pick PHP, USD, EUR, SGD, JPY or another currency. In the PDF the peso sign is written as PHP, because standard PDF fonts do not include it." },
  ],
  icon: "quote",
});
