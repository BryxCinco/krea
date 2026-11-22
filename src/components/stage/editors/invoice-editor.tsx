"use client";

import { Download, ImagePlus, Info, Plus, Printer, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { replacedNote, safeStem } from "@/lib/pdf-text";
import { printDocument } from "@/lib/print";
import { useSession } from "@/lib/session";
import { usePersistentState } from "@/lib/use-persistent-state";
import { CURRENCIES, currencySymbol, formatMoney, invoiceDocument, invoiceTotals, newInvoice, type InvoiceData, type LineItem } from "@/tools/text/invoice";
import type { PdfLogo } from "@/tools/text/invoice-pdf";
import { DocPreview } from "./doc-preview";
import { ConfirmButton, Group, NumberInput, Segmented, TextArea, TextInput } from "./form";
import { EditorShell } from "./editor-shell";

/** Logos are stored with the invoice in localStorage, so keep them small. */
const MAX_LOGO_BYTES = 400 * 1024;

function restore(stored: unknown): InvoiceData | null {
  const data = stored as InvoiceData;
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) return null;
  return { ...newInvoice(), ...data };
}

/** "INV-0007" -> "INV-0008": increments the trailing number, keeping its width. */
function nextNumber(number: string): string {
  const match = /(\d+)(\D*)$/.exec(number);
  if (!match) return `${number}-2`;
  const next = String(Number(match[1]) + 1).padStart(match[1].length, "0");
  return number.slice(0, match.index) + next + match[2];
}

let itemCounter = 0;

const selectClass = "min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted";

/** The stored logo (a data URL) as PNG or JPEG bytes for pdf-lib. WebP is redrawn as PNG. */
async function logoForPdf(dataUrl: string): Promise<PdfLogo | null> {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  if (match[1] !== "image/webp") {
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { bytes, kind: match[1] === "image/png" ? "png" : "jpg" };
  }
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), kind: "png" } : null;
}

export default function InvoiceEditor() {
  const { value: data, setValue: setData, saved, clear } = usePersistentState("krea.invoice", newInvoice, restore);
  const { setNotice } = useSession();
  const set = (patch: Partial<InvoiceData>) => setData((current) => ({ ...current, ...patch }));
  const setItem = (id: string, patch: Partial<LineItem>) => set({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const totals = invoiceTotals(data);
  const html = invoiceDocument(data);
  const money = (value: number) => formatMoney(value, data.currency);
  const symbol = currencySymbol(data.currency);
  const [busy, setBusy] = useState(false);
  const currencyId = useId();
  const hasContent = data.items.some((item) => item.description.trim() || item.rate);

  const downloadPdf = async () => {
    if (!hasContent) {
      setNotice("Walang laman ang invoice pa. Add at least one item with a description or rate.");
      return;
    }
    setBusy(true);
    try {
      const [{ invoicePdf }, logo] = await Promise.all([import("@/tools/text/invoice-pdf"), data.logo ? logoForPdf(data.logo).catch(() => null) : Promise.resolve(null)]);
      const result = await invoicePdf(data, logo);
      downloadBlob(new Blob([result.bytes as BlobPart], { type: "application/pdf" }), `${safeStem(`invoice-${data.number}`, "invoice")}.pdf`);
      const logoNote = (data.logo && !logo) || result.logoSkipped ? " Hindi nabasa ang logo, so it was left out." : "";
      setNotice(`Na-download ang PDF.${logoNote}${replacedNote(result.replaced)}`);
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "Hindi nagawa ang PDF. Try again, or use Print and choose Save as PDF.");
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setNotice("Logo is over 400 KB. I-compress muna (try the Image Compressor) so it fits in your browser storage.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const form = (
    <>
      <Group title="Invoice">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Invoice no." value={data.number} onChange={(number) => set({ number })} />
          <TextInput label="Issue date" type="date" value={data.issueDate} onChange={(issueDate) => set({ issueDate })} />
          <TextInput label="Due date" type="date" value={data.dueDate} onChange={(dueDate) => set({ dueDate })} />
        </div>
        <div>
          <label htmlFor={currencyId} className="mb-1.5 block text-sm text-fg">
            Currency
          </label>
          <select id={currencyId} value={data.currency} onChange={(event) => set({ currency: event.target.value })} className={selectClass}>
            {CURRENCIES.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="mb-1.5 block text-sm text-fg">Logo (optional)</span>
          {data.logo ? (
            <div className="flex items-center gap-3 rounded-md border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={data.logo} alt="Your logo" className="h-12 max-w-40 rounded bg-paper object-contain p-1" />
              <span className="flex-1" />
              <button type="button" aria-label="Remove logo" onClick={() => set({ logo: "" })} className="flex size-9 items-center justify-center rounded text-muted hover:text-signal">
                <X aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm text-fg hover:border-accent has-focus-visible:outline-2 has-focus-visible:outline-accent">
              <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
              Choose logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  pickLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </Group>

      <Group title="From">
        <TextInput label="Your name or business" value={data.from.name} onChange={(name) => set({ from: { ...data.from, name } })} autoComplete="organization" />
        <TextArea label="Address and contact" value={data.from.details} onChange={(details) => set({ from: { ...data.from, details } })} rows={3} placeholder={"Makati City\nhello@example.ph · 0917 000 0000\nTIN 000-000-000-000"} />
      </Group>

      <Group title="Bill to">
        <TextInput label="Client name" value={data.to.name} onChange={(name) => set({ to: { ...data.to, name } })} />
        <TextArea label="Client address and contact" value={data.to.details} onChange={(details) => set({ to: { ...data.to, details } })} rows={3} />
      </Group>

      <Group title="Items">
        {data.items.map((item, index) => (
          <div key={item.id} className="rounded-lg border border-line bg-ink p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-muted">Item {index + 1}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm text-fg">{money(totals.lines[index])}</span>
                <button
                  type="button"
                  aria-label={`Remove item ${index + 1}`}
                  disabled={data.items.length === 1}
                  onClick={() => set({ items: data.items.filter((entry) => entry.id !== item.id) })}
                  className="flex size-9 items-center justify-center rounded text-muted hover:text-signal disabled:opacity-30"
                >
                  <X aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </span>
            </div>
            <TextArea label="Description" value={item.description} onChange={(description) => setItem(item.id, { description })} rows={2} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <NumberInput label="Quantity" value={item.quantity} onChange={(quantity) => setItem(item.id, { quantity })} step={1} />
              <NumberInput label="Rate" unit={symbol} value={item.rate} onChange={(rate) => setItem(item.id, { rate })} />
            </div>
          </div>
        ))}
        <Button onClick={() => set({ items: [...data.items, { id: `item-${Date.now().toString(36)}-${itemCounter++}`, description: "", quantity: 1, rate: 0 }] })}>
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
          Add item
        </Button>
      </Group>

      <Group title="Tax and discount">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Tax label" value={data.taxLabel} onChange={(taxLabel) => set({ taxLabel })} placeholder="VAT" />
          <NumberInput label="Tax rate" unit="%" value={data.taxRate} onChange={(taxRate) => set({ taxRate })} hint="Ilagay ang rate na sinisingil mo. Leave 0 if you do not charge tax." />
          <Segmented
            label="Discount as"
            value={data.discountMode}
            onChange={(discountMode) => set({ discountMode })}
            options={[
              { value: "amount", label: "Amount" },
              { value: "percent", label: "Percent" },
            ]}
          />
          <NumberInput label="Discount" unit={data.discountMode === "percent" ? "%" : symbol} value={data.discount} onChange={(discount) => set({ discount })} />
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-ink p-3 font-mono text-sm">
          <dt className="text-muted">Subtotal</dt>
          <dd className="text-right text-fg">{money(totals.subtotal)}</dd>
          {totals.discount > 0 && (
            <>
              <dt className="text-muted">Discount</dt>
              <dd className="text-right text-fg">-{money(totals.discount)}</dd>
            </>
          )}
          {totals.tax > 0 && (
            <>
              <dt className="text-muted">{data.taxLabel || "Tax"}</dt>
              <dd className="text-right text-fg">{money(totals.tax)}</dd>
            </>
          )}
          <dt className="font-semibold text-fg">Total</dt>
          <dd className="text-right font-semibold text-accent">{money(totals.total)}</dd>
        </dl>
      </Group>

      <Group title="Payment details">
        <TextArea
          label="How to pay you"
          value={data.payment}
          onChange={(payment) => set({ payment })}
          rows={3}
          placeholder={"GCash 0917 000 0000 (Juan D.)\nBDO Savings 0000 0000 0000, Juan Dela Cruz"}
        />
      </Group>

      <Group title="Notes and paper">
        <TextArea label="Notes" value={data.notes} onChange={(notes) => set({ notes })} rows={3} placeholder="Thank you note, terms or late payment policy" />
        <Segmented
          label="Paper"
          value={data.paper}
          onChange={(paper) => set({ paper })}
          options={[
            { value: "a4", label: "A4" },
            { value: "letter", label: "Letter" },
          ]}
        />
      </Group>

      <p className="text-xs leading-relaxed text-muted">
        Naka-save lang sa device na ito: your draft, logo and sender details stay in this browser&apos;s storage so they are here next time. Nothing is uploaded. Use Clear data to delete them.
      </p>
      <section className="rounded-xl border border-signal/60 bg-panel p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
          Gabay lang ito, hindi opisyal na resibo
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This invoice is for billing your clients. It is not an official receipt. Kung BIR-registered ang negosyo mo, you must issue the official receipts or invoices registered with the BIR.
        </p>
      </section>
    </>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={downloadPdf} disabled={busy} aria-busy={busy}>
        <Download aria-hidden className="size-4" strokeWidth={2} />
        {busy ? "Making PDF…" : "Download PDF"}
      </Button>
      <Button onClick={() => printDocument(html)} title="Opens the print dialog">
        <Printer aria-hidden className="size-4" strokeWidth={1.75} />
        Print
      </Button>
      <Button
        onClick={() => {
          // Next invoice for the same sender: keep "From", logo, currency, tax, payment details and notes; clear client and items.
          const fresh = newInvoice();
          set({ number: nextNumber(data.number), issueDate: fresh.issueDate, dueDate: fresh.dueDate, to: fresh.to, items: fresh.items, discount: 0 });
          setNotice(`Bagong invoice: ${nextNumber(data.number)}. Your details and logo are kept.`);
        }}
      >
        <Plus aria-hidden className="size-4" strokeWidth={1.75} />
        Next invoice
      </Button>
      <ConfirmButton
        label={
          <>
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            Clear data
          </>
        }
        confirmLabel="Delete all invoice data?"
        onConfirm={() => clear(newInvoice())}
      />
    </>
  );

  return <EditorShell label="Invoice generator" form={form} preview={<DocPreview html={html} title="Invoice preview" />} actions={actions} saved={saved} />;
}
