"use client";

import { Copy, Download, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { useSession } from "@/lib/session";
import { formatPeso } from "@/tools/text/invoice";
import { computeLoan, type LoanMethod, type TermUnit } from "@/tools/text/loan";
import { scheduleCsv } from "@/tools/text/ph-pay";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

const finite = (value: number) => (Number.isFinite(value) ? value : 0);
const methodLabel = (method: LoanMethod) => (method === "diminishing" ? "diminishing balance" : "add-on (flat)");

export default function LoanEditor() {
  // Loan details stay in this tab only: nothing is saved, nothing leaves the device.
  const [principal, setPrincipal] = useState(100_000);
  const [rate, setRate] = useState(12);
  const [term, setTerm] = useState(12);
  const [unit, setUnit] = useState<TermUnit>("months");
  const [method, setMethod] = useState<LoanMethod>("diminishing");
  const { setNotice } = useSession();

  const result = useMemo(() => computeLoan({ principal: finite(principal), rate: finite(rate), term: finite(term), unit, method }), [principal, rate, term, unit, method]);
  const problem = "problem" in result ? result.problem : null;
  const ok = "problem" in result ? null : result;

  const changeUnit = (next: TermUnit) => {
    // Keep the same length of loan when switching units, when it converts cleanly.
    if (next !== unit) {
      const converted = next === "years" ? term / 12 : term * 12;
      setTerm(Number.isFinite(converted) ? Math.round(converted * 100) / 100 : term);
    }
    setUnit(next);
  };

  const copy = async () => {
    if (!ok) return;
    const text = [
      `Monthly payment: ${formatPeso(ok.payment)}`,
      `${formatPeso(finite(principal))} at ${rate}% a year, ${methodLabel(method)}, ${ok.months} months`,
      `Total interest: ${formatPeso(ok.totalInterest)}`,
      `Total paid: ${formatPeso(ok.totalPaid)}`,
      ...(ok.equivalentRate ? [`Equivalent diminishing rate: about ${ok.equivalentRate}% a year`] : []),
      "Estimate only. Fees, insurance and taxes are not included; the lender's disclosure statement is official.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Na-copy ang breakdown.");
    } catch {
      setNotice("Hindi ma-copy. Select the result and copy it by hand.");
    }
  };

  const downloadCsv = () => {
    if (!ok) return;
    downloadBlob(new Blob([scheduleCsv(ok.rows)], { type: "text/csv;charset=utf-8" }), `loan-schedule-${ok.months}-months.csv`);
    setNotice("Na-download ang schedule.");
  };

  const form = (
    <>
      <Group title="Loan">
        <NumberInput label="Loan amount" unit="₱" value={principal} onChange={setPrincipal} step={1000} />
        <NumberInput label="Interest per year" unit="%" value={rate} onChange={setRate} step={0.25} hint="Monthly rate × 12. A 1.5% monthly rate is 18% a year." />
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <NumberInput label="Term" unit={unit} value={term} onChange={setTerm} step={unit === "years" ? 0.5 : 1} />
          <Segmented
            label="In"
            value={unit}
            onChange={changeUnit}
            options={[
              { value: "months", label: "Months" },
              { value: "years", label: "Years" },
            ]}
          />
        </div>
        <Segmented
          label="How interest is charged"
          value={method}
          onChange={setMethod}
          options={[
            { value: "diminishing", label: "Diminishing balance" },
            { value: "addon", label: "Add-on (flat)" },
          ]}
        />
        {problem && (
          <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
            {problem}
          </p>
        )}
      </Group>
      <p className="text-xs leading-relaxed text-muted">Hindi sine-save: your loan details stay in this tab only.</p>
      <section className="rounded-xl border border-signal/60 bg-panel p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
          Gabay lang ito
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Nag-iiba ang aktuwal na bayad ayon sa lender. Banks, cooperatives, SSS, Pag-IBIG and lending apps may add processing fees, insurance, documentary stamp tax or penalties, deduct them from the
          amount you receive, or round and count days differently. Interest only is computed here. The official numbers are in your loan disclosure statement, so compare before you sign.
        </p>
      </section>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="text-sm text-muted">Monthly payment</p>
      <p className="mt-1 font-mono text-4xl font-semibold text-accent" aria-live="polite">
        {ok ? formatPeso(ok.payment) : "—"}
      </p>
      {ok && (
        <p className="mt-1 font-mono text-sm text-muted">
          {ok.months} {ok.months === 1 ? "month" : "months"} · {methodLabel(method)}
        </p>
      )}
      {ok && (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-line p-3">
              <dt className="text-xs text-muted">Total interest</dt>
              <dd className="mt-1 font-mono text-fg">{formatPeso(ok.totalInterest)}</dd>
            </div>
            <div className="rounded-lg border border-line p-3">
              <dt className="text-xs text-muted">Total paid</dt>
              <dd className="mt-1 font-mono text-fg">{formatPeso(ok.totalPaid)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {method === "addon" ? (
              <>
                At {rate}% add-on, this costs the same as about <span className="font-mono text-fg">{ok.equivalentRate}%</span> a year on a diminishing balance. The same {rate}% on a diminishing balance
                would cost <span className="font-mono text-fg">{formatPeso(ok.other.totalInterest)}</span> in interest.
              </>
            ) : (
              <>
                The same {rate}% as add-on (flat) interest would cost <span className="font-mono text-fg">{formatPeso(ok.other.totalInterest)}</span> in interest.
              </>
            )}
          </p>
          <div className="mt-5 max-h-96 overflow-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label="Amortization schedule">
            <table className="w-full text-sm">
              <caption className="sr-only">Amortization schedule</caption>
              <thead className="sticky top-0 bg-panel">
                <tr className="text-xs text-muted">
                  <th scope="col" className="px-2 py-2 text-left font-normal">Month</th>
                  <th scope="col" className="px-2 py-2 text-right font-normal">Payment</th>
                  <th scope="col" className="px-2 py-2 text-right font-normal">Interest</th>
                  <th scope="col" className="px-2 py-2 text-right font-normal">Principal</th>
                  <th scope="col" className="px-2 py-2 text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {ok.rows.map((row) => (
                  <tr key={row.period} className="border-t border-line">
                    <th scope="row" className="px-2 py-1.5 text-left font-normal text-fg">{row.period}</th>
                    <td className="px-2 py-1.5 text-right text-fg">{row.payment.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right text-muted">{row.interest.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right text-muted">{row.principal.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right text-fg">{row.balance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">Estimate only. Fees, insurance and taxes are not included.</p>
        </>
      )}
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={copy} disabled={!ok}>
        <Copy aria-hidden className="size-4" strokeWidth={2} />
        Copy breakdown
      </Button>
      <Button onClick={downloadCsv} disabled={!ok}>
        <Download aria-hidden className="size-4" strokeWidth={1.75} />
        Download CSV
      </Button>
    </>
  );

  return <EditorShell label="Loan and amortization calculator" form={form} preview={preview} actions={actions} previewLabel="Result" />;
}
