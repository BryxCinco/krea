"use client";

/** Quotation & Receipt Maker (tool 57): the invoice editor with quotation and receipt layouts, saved separately. */
import { BillingEditor } from "./invoice-editor";

export default function QuoteEditor() {
  return <BillingEditor kinds={["quotation", "receipt"]} storageKey="krea.quote" label="Quotation and receipt maker" />;
}
