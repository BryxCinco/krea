"use client";

import { FileCode2, FileImage, Info, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { contrastRatio, QR_DEFAULTS, qrPayload, type ErrorLevel, type QrData, type QrKind } from "@/tools/text/qr";
import { ColorInput, Group, Segmented, TextArea, TextInput } from "./form";
import { EditorShell } from "./editor-shell";

interface Rendered {
  payload: string;
  svg: string;
  error?: string;
}

const KINDS: { value: QrKind; label: string }[] = [
  { value: "url", label: "Link" },
  { value: "text", label: "Text" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "payment", label: "Payment" },
];

export default function QrEditor() {
  // Not saved anywhere: Wi-Fi passwords and account numbers stay in memory only.
  const [data, setData] = useState<QrData>(QR_DEFAULTS);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const set = (patch: Partial<QrData>) => setData((current) => ({ ...current, ...patch }));
  const style = data.style;
  const setStyle = (patch: Partial<QrData["style"]>) => set({ style: { ...style, ...patch } });

  const payload = qrPayload(data);
  const lowContrast = contrastRatio(style.foreground, style.background) < 4;
  const inverted = contrastRatio(style.foreground, "#000000") > contrastRatio(style.background, "#000000");

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    import("qrcode").then(async (QRCode) => {
      try {
        const svg = await QRCode.toString(payload, {
          type: "svg",
          errorCorrectionLevel: style.level,
          margin: style.margin,
          color: { dark: style.foreground, light: style.background },
        });
        if (!cancelled) setRendered({ payload, svg });
      } catch {
        if (!cancelled) setRendered({ payload, svg: "", error: "Masyadong mahaba ang laman for a QR code. Shorten the text or choose a lower error correction level." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [payload, style.level, style.margin, style.foreground, style.background]);

  const current = payload && rendered?.payload === payload ? rendered : null;

  const downloadPng = async () => {
    const QRCode = await import("qrcode");
    const url = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: style.level,
      margin: style.margin,
      width: style.size,
      color: { dark: style.foreground, light: style.background },
    });
    downloadBlob(await (await fetch(url)).blob(), `qr-${data.kind}.png`);
  };

  const form = (
    <>
      <Group title="What goes in the code">
        <Segmented label="Type" value={data.kind} onChange={(kind) => set({ kind })} options={KINDS} />
        {data.kind === "url" && <TextInput label="Link" type="url" value={data.url} onChange={(url) => set({ url })} placeholder="https://example.ph" />}
        {data.kind === "text" && <TextArea label="Text" value={data.text} onChange={(text) => set({ text })} rows={4} />}
        {data.kind === "wifi" && (
          <>
            <TextInput label="Network name (SSID)" value={data.wifi.ssid} onChange={(ssid) => set({ wifi: { ...data.wifi, ssid } })} />
            <Segmented
              label="Security"
              value={data.wifi.security}
              onChange={(security) => set({ wifi: { ...data.wifi, security } })}
              options={[
                { value: "WPA", label: "WPA/WPA2/WPA3" },
                { value: "WEP", label: "WEP" },
                { value: "nopass", label: "None" },
              ]}
            />
            {data.wifi.security !== "nopass" && (
              <TextInput label="Password" value={data.wifi.password} onChange={(password) => set({ wifi: { ...data.wifi, password } })} hint="Kept in this tab only. Not saved." />
            )}
            <label className="flex min-h-10 items-center gap-3 text-sm text-fg">
              <input type="checkbox" checked={data.wifi.hidden} onChange={(event) => set({ wifi: { ...data.wifi, hidden: event.target.checked } })} className="size-5 accent-[var(--accent)]" />
              Hidden network
            </label>
          </>
        )}
        {data.kind === "payment" && (
          <>
            <p className="flex gap-2 rounded-md border border-line bg-ink p-3 text-sm leading-relaxed text-fg">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
              <span>
                This makes a plain-text QR code with your details. It is <strong>not</strong> an official QR Ph payment code: scanning it shows the
                text, and the payer types the details into their app. For scan-to-pay, use the QR from your GCash, Maya or bank app.
              </span>
            </p>
            <TextInput label="Provider" value={data.payment.provider} onChange={(provider) => set({ payment: { ...data.payment, provider } })} placeholder="GCash, Maya, BPI, BDO" />
            <TextInput label="Account name" value={data.payment.accountName} onChange={(accountName) => set({ payment: { ...data.payment, accountName } })} />
            <TextInput label="Account or mobile number" value={data.payment.accountNumber} onChange={(accountNumber) => set({ payment: { ...data.payment, accountNumber } })} />
            <TextInput label="Amount (optional)" value={data.payment.amount} onChange={(amount) => set({ payment: { ...data.payment, amount } })} placeholder="1,500.00" />
            <TextInput label="Note (optional)" value={data.payment.note} onChange={(note) => set({ payment: { ...data.payment, note } })} placeholder="Invoice INV-0001" />
          </>
        )}
      </Group>

      <Group title="Style">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput label="Code colour" value={style.foreground} onChange={(foreground) => setStyle({ foreground })} />
          <ColorInput label="Background" value={style.background} onChange={(background) => setStyle({ background })} />
        </div>
        {(lowContrast || inverted) && (
          <p role="status" className="flex gap-2 text-sm leading-relaxed text-signal">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            {lowContrast ? "Low contrast: some phones may not scan this. Use a dark code on a light background." : "Light code on a dark background: many scanners cannot read inverted codes."}
          </p>
        )}
        <Segmented
          label="Error correction"
          value={style.level}
          onChange={(level: ErrorLevel) => setStyle({ level })}
          options={[
            { value: "L", label: "L 7%" },
            { value: "M", label: "M 15%" },
            { value: "Q", label: "Q 25%" },
            { value: "H", label: "H 30%" },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-size" className="mb-1.5 flex justify-between text-sm text-fg">
              PNG size <output htmlFor="qr-size" className="font-mono text-accent">{style.size} px</output>
            </label>
            <input id="qr-size" type="range" min={128} max={2048} step={64} value={style.size} onChange={(event) => setStyle({ size: Number(event.target.value) })} className="h-10 w-full" />
          </div>
          <div>
            <label htmlFor="qr-margin" className="mb-1.5 flex justify-between text-sm text-fg">
              Quiet zone <output htmlFor="qr-margin" className="font-mono text-accent">{style.margin}</output>
            </label>
            <input id="qr-margin" type="range" min={0} max={8} step={1} value={style.margin} onChange={(event) => setStyle({ margin: Number(event.target.value) })} className="h-10 w-full" />
          </div>
        </div>
      </Group>
    </>
  );

  const preview = (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-panel p-6">
      {!payload ? (
        <p className="py-16 text-center text-sm text-muted">Ilagay muna ang laman ng QR code.</p>
      ) : current?.error ? (
        <p role="alert" className="py-16 text-center text-sm text-signal">
          {current.error}
        </p>
      ) : current ? (
        <div
          role="img"
          aria-label={`QR code containing: ${payload}`}
          className="w-full max-w-sm [&>svg]:h-auto [&>svg]:w-full"
          // The SVG is generated locally by the qrcode library from validated colours; no user HTML is injected.
          dangerouslySetInnerHTML={{ __html: current.svg }}
        />
      ) : (
        <div className="skeleton aspect-square w-full max-w-sm rounded-md" />
      )}
      {payload && (
        <pre className="max-h-32 w-full max-w-sm overflow-auto whitespace-pre-wrap break-all rounded-md bg-ink p-3 font-mono text-xs text-muted">{payload}</pre>
      )}
      <p className="text-center text-xs text-muted">Test with your phone camera before printing.</p>
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" disabled={!current || Boolean(current.error)} onClick={downloadPng}>
        <FileImage aria-hidden className="size-4" strokeWidth={2} />
        PNG
      </Button>
      <Button disabled={!current || Boolean(current.error)} onClick={() => current && downloadBlob(new Blob([current.svg], { type: "image/svg+xml" }), `qr-${data.kind}.svg`)}>
        <FileCode2 aria-hidden className="size-4" strokeWidth={1.75} />
        SVG
      </Button>
    </>
  );

  return <EditorShell label="QR code generator" form={form} preview={preview} actions={actions} previewLabel="QR code" />;
}
