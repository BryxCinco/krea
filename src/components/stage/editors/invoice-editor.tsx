"use client";

import { ImagePlus, Plus, Printer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printDocument } from "@/lib/print";
import { useSession } from "@/lib/session";
import { usePersistentState } from "@/lib/use-persistent-state";
import { formatPeso, invoiceDocument, invoiceTotals, newInvoice, type InvoiceData, type LineItem } from "@/tools/text/invoice";
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

export default function InvoiceEditor() {
  const { value: data, setValue: setData, saved, clear } = usePersistentState("krea.invoice", newInvoice, restore);
  const { setNotice } = useSession();
  const set = (patch: Partial<InvoiceData>) => setData((current) => ({ ...current, ...patch }));
  const setItem = (id: string, patch: Partial<LineItem>) => set({ items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const totals = invoiceTotals(data);
  const html = invoiceDocument(data);

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
                <span className="font-mono text-sm text-fg">{formatPeso(totals.lines[index])}</span>
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
              <NumberInput label="Rate" unit="₱" value={item.rate} onChange={(rate) => setItem(item.id, { rate })} />
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
          <NumberInput label="Tax rate" unit="%" value={data.taxRate} onChange={(taxRate) => set({ taxRate })} hint="12 for VAT. Leave 0 if not VAT-registered." />
          <Segmented
            label="Discount as"
            value={data.discountMode}
            onChange={(discountMode) => set({ discountMode })}
            options={[
              { value: "amount", label: "Amount" },
              { value: "percent", label: "Percent" },
            ]}
          />
          <NumberInput label="Discount" unit={data.discountMode === "percent" ? "%" : "₱"} value={data.discount} onChange={(discount) => set({ discount })} />
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-ink p-3 font-mono text-sm">
          <dt className="text-muted">Subtotal</dt>
          <dd className="text-right text-fg">{formatPeso(totals.subtotal)}</dd>
          {totals.discount > 0 && (
            <>
              <dt className="text-muted">Discount</dt>
              <dd className="text-right text-fg">-{formatPeso(totals.discount)}</dd>
            </>
          )}
          {totals.tax > 0 && (
            <>
              <dt className="text-muted">{data.taxLabel || "Tax"}</dt>
              <dd className="text-right text-fg">{formatPeso(totals.tax)}</dd>
            </>
          )}
          <dt className="font-semibold text-fg">Total</dt>
          <dd className="text-right font-semibold text-accent">{formatPeso(totals.total)}</dd>
        </dl>
      </Group>

      <Group title="Notes and paper">
        <TextArea label="Notes and payment details" value={data.notes} onChange={(notes) => set({ notes })} rows={3} />
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
    </>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={() => printDocument(html)} title="Opens the print dialog: choose Save as PDF">
        <Printer aria-hidden className="size-4" strokeWidth={2} />
        Save as PDF
      </Button>
      <Button
        onClick={() => {
          // Next invoice for the same sender: keep "From", logo, tax and notes; clear client and items.
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
