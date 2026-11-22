"use client";

import { Copy, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ASSUMPTIONS, LAST_UPDATED, SOURCES, VERIFICATION_STATUS } from "@/config/ph-income-tax";
import { useSession } from "@/lib/session";
import { computeFreelancerTax, type IncomeKind, type Period, type TaxOption } from "@/tools/text/freelancer-tax";
import { formatPeso } from "@/tools/text/invoice";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function FreelancerTaxEditor() {
  // Income figures stay in this tab only: nothing is saved, nothing leaves the device.
  const [kind, setKind] = useState<IncomeKind>("pure");
  const [period, setPeriod] = useState<Period>("year");
  const [gross, setGross] = useState(600_000);
  const [otherIncome, setOtherIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [compensation, setCompensation] = useState(0);
  const [compensationWithheld, setCompensationWithheld] = useState(0);
  const [creditable, setCreditable] = useState(0);
  const { setNotice } = useSession();

  const result = useMemo(
    () => computeFreelancerTax({ kind, period, gross, otherIncome, expenses, compensation, compensationWithheld, creditable }),
    [kind, period, gross, otherIncome, expenses, compensation, compensationWithheld, creditable],
  );
  const problem = "problem" in result ? result.problem : null;
  const ok = "problem" in result ? null : result;
  const best = ok?.options.find((option) => option.id === ok.best) ?? null;

  const copy = async () => {
    if (!ok) return;
    const lines = [
      `Freelancer tax estimate (${kind === "mixed" ? "mixed income" : "self-employed"}), per year`,
      `Gross receipts: ${formatPeso(ok.annual.gross)}`,
      ...ok.options.map((option) => `${option.label}: ${option.allowed ? `${formatPeso(option.total)} total tax (${percent(option.effectiveRate)})` : option.reason}`),
      ...(best ? [`Lowest: ${best.label}`] : []),
      `Estimate by Krea. Rates last updated ${LAST_UPDATED}; verify with the BIR or an accountant.`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setNotice("Na-copy ang comparison.");
    } catch {
      setNotice("Hindi ma-copy. Select the result and copy it by hand.");
    }
  };

  const form = (
    <>
      <Group title="You">
        <Segmented
          label="Income"
          value={kind}
          onChange={setKind}
          options={[
            { value: "pure", label: "Self-employed only" },
            { value: "mixed", label: "Also employed (mixed)" },
          ]}
        />
        <Segmented
          label="Amounts are"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "year", label: "Per year" },
            { value: "month", label: "Per month" },
          ]}
        />
      </Group>
      <Group title="Freelance or business income">
        <NumberInput label="Gross receipts" unit="₱" value={gross} onChange={setGross} step={1000} hint="Everything clients paid you, before expenses and before withholding." />
        <NumberInput label="Business expenses" unit="₱" value={expenses} onChange={setExpenses} step={1000} hint="Only for the itemized option: rent, internet, equipment, software, backed by receipts." />
        <NumberInput label="Other non-operating income" unit="₱" value={otherIncome} onChange={setOtherIncome} step={1000} hint="Optional. Income not from your main work and not already subject to final tax." />
        <NumberInput label="Tax withheld by clients (Form 2307)" unit="₱" value={creditable} onChange={setCreditable} step={100} hint="Usually 5% or 10% of fees from companies. Subtracted from what you still owe." />
      </Group>
      {kind === "mixed" && (
        <Group title="Salary">
          <NumberInput label="Taxable compensation" unit="₱" value={compensation} onChange={setCompensation} step={1000} hint="From your BIR Form 2316: salary after SSS, PhilHealth, Pag-IBIG and tax-free 13th month." />
          <NumberInput label="Tax withheld by employer" unit="₱" value={compensationWithheld} onChange={setCompensationWithheld} step={100} />
        </Group>
      )}
      {problem && (
        <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
          {problem}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted">Hindi sine-save: your income stays in this tab only.</p>
      <section aria-labelledby="tax-rates-heading" className="rounded-xl border border-signal/60 bg-panel p-4">
        <h2 id="tax-rates-heading" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
          Verify before relying on this
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Rules last updated <span className="font-mono text-fg">{LAST_UPDATED}</span>
          {VERIFICATION_STATUS === "verify" && ", taken from the TRAIN and CREATE laws as published but not yet checked against a BIR page"}. This is an estimate for planning, not tax advice: confirm
          with your RDO or an accountant before you file.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {SOURCES.map((source) => (
            <li key={source.document} className="leading-relaxed text-muted">
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">
                {source.agency}
              </a>
              : {source.document}
            </li>
          ))}
        </ul>
        <details className="mt-3">
          <summary className="min-h-9 text-sm text-fg">Assumptions in this calculator</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted">
            {ASSUMPTIONS.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );

  const card = (option: TaxOption) => {
    const lowest = option.id === ok?.best;
    return (
      <li key={option.id} className={`rounded-lg border p-4 ${lowest ? "border-accent" : "border-line"}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-fg">{option.label}</h3>
          {lowest && <span className="font-mono text-xs text-accent">Lowest</span>}
        </div>
        {option.allowed ? (
          <>
            <p className="mt-2 font-mono text-2xl font-semibold text-fg">{formatPeso(option.total)}</p>
            <p className="font-mono text-xs text-muted">
              {percent(option.effectiveRate)} of income{period === "month" && ` · about ${formatPeso(option.total / 12)} a month`}
            </p>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Taxable income</dt>
              <dd className="text-right font-mono text-fg">{formatPeso(option.taxableIncome)}</dd>
              <dt className="text-muted">Income tax</dt>
              <dd className="text-right font-mono text-fg">{formatPeso(option.incomeTax)}</dd>
              <dt className="text-muted">Percentage tax (3%)</dt>
              <dd className="text-right font-mono text-fg">{option.percentageTax ? formatPeso(option.percentageTax) : "none"}</dd>
              <dt className="text-muted">{option.payable < 0 ? "Overpaid (refund or carry over)" : "Still to pay after credits"}</dt>
              <dd className={`text-right font-mono ${option.payable < 0 ? "text-accent" : "text-fg"}`}>{formatPeso(Math.abs(option.payable))}</dd>
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{option.reason}</p>
        )}
      </li>
    );
  };

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="text-sm text-muted">Lowest total tax for the year</p>
      <p className="mt-1 font-mono text-4xl font-semibold text-accent" aria-live="polite">
        {best ? formatPeso(best.total) : "—"}
      </p>
      {best && <p className="mt-1 text-sm text-muted">with {best.label}</p>}
      {ok && (
        <>
          <ul className="mt-5 flex flex-col gap-3">{ok.options.map(card)}</ul>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Totals are income tax plus percentage tax for the whole year. The 8% option replaces both the graduated rates and the 3% percentage tax on your freelance income; elect it on your first
            quarterly return (1701Q) or when you register, otherwise the graduated rates apply.
          </p>
        </>
      )}
    </div>
  );

  const actions = (
    <Button variant="primary" onClick={copy} disabled={!ok}>
      <Copy aria-hidden className="size-4" strokeWidth={2} />
      Copy comparison
    </Button>
  );

  return <EditorShell label="Freelancer tax calculator" form={form} preview={preview} actions={actions} previewLabel="Result" />;
}
