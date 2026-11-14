"use client";

import { Copy, Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ASSUMPTIONS, LAST_UPDATED, SOURCES, VERIFICATION_STATUS } from "@/config/ph-contributions";
import { useSession } from "@/lib/session";
import { computePay, type PayFrequency, type PayInput } from "@/tools/text/payroll";
import { formatPeso } from "@/tools/text/invoice";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

const percent = (rate: number) => `${+(rate * 100).toFixed(2)}%`;

export default function PayrollEditor() {
  // Salary details are not saved anywhere; they disappear when the tab closes.
  const [input, setInput] = useState<PayInput>({ basic: 25_000, taxableAllowances: 0, nonTaxableAllowances: 0, frequency: "semiMonthly" });
  const { setNotice } = useSession();
  const set = (patch: Partial<PayInput>) => setInput((current) => ({ ...current, ...patch }));
  const result = computePay(input);
  const { monthly, period } = result;
  const perPeriod = period.count === 2 ? "per cutoff" : "per month";

  const rows: [string, number, string?][] = [
    ["Gross pay", period.gross],
    [`SSS (MSC ${formatPeso(monthly.sss.msc)})`, -monthly.sss.employee / period.count, "5% of the monthly salary credit"],
    ["PhilHealth", -monthly.philhealth.employee / period.count, "2.5% of basic salary (₱10,000 floor, ₱100,000 ceiling)"],
    ["Pag-IBIG", -monthly.pagibig.employee / period.count, "2% of up to ₱10,000"],
    ["Withholding tax", -period.tax, `Bracket over ${formatPeso(period.bracket.over)}: ${formatPeso(period.bracket.base)} + ${percent(period.bracket.rate)} of the excess`],
  ];

  const summary = [
    `Take-home pay ${perPeriod}: ${formatPeso(period.net)}`,
    ...rows.map(([label, value]) => `${label}: ${formatPeso(value)}`),
    `Monthly take-home: ${formatPeso(monthly.net)}`,
    `Estimate by Krea. Rates last updated ${LAST_UPDATED}; verify with SSS, PhilHealth, Pag-IBIG and BIR.`,
  ].join("\n");

  const form = (
    <>
      <Group title="Your pay">
        <Segmented<PayFrequency>
          label="Pay schedule"
          value={input.frequency}
          onChange={(frequency) => set({ frequency })}
          options={[
            { value: "semiMonthly", label: "Semi-monthly (15/30)" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
        <NumberInput label="Basic monthly salary" unit="₱" value={input.basic} onChange={(basic) => set({ basic })} step={100} />
        <NumberInput label="Taxable allowances per month" unit="₱" value={input.taxableAllowances} onChange={(taxableAllowances) => set({ taxableAllowances })} step={100} hint="Allowances your payslip taxes. Leave 0 if unsure." />
        <NumberInput
          label="Non-taxable allowances per month"
          unit="₱"
          value={input.nonTaxableAllowances}
          onChange={(nonTaxableAllowances) => set({ nonTaxableAllowances })}
          step={100}
          hint="De minimis benefits like rice or laundry allowance within the BIR limits."
        />
        <p className="text-xs leading-relaxed text-muted">Hindi sine-save: your salary stays in this tab only.</p>
      </Group>

      <section aria-labelledby="rates-heading" className="rounded-xl border border-signal/60 bg-panel p-4">
        <h2 id="rates-heading" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
          Verify before relying on this
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Rates last updated <span className="font-mono text-fg">{LAST_UPDATED}</span>
          {VERIFICATION_STATUS === "verify" && ", taken from published 2026 schedules but not yet checked against each agency's own circular"}. Check the
          official sources below or ask your HR. This is an estimate, not tax advice.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {SOURCES.map((source) => (
            <li key={source.agency} className="leading-relaxed text-muted">
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

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="text-sm text-muted">Take-home pay {perPeriod}</p>
      <p className="mt-1 font-mono text-4xl font-semibold text-accent" aria-live="polite">
        {formatPeso(period.net)}
      </p>
      {period.count === 2 && <p className="mt-1 font-mono text-sm text-muted">{formatPeso(monthly.net)} per month</p>}

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Breakdown {perPeriod}</caption>
        <tbody>
          {rows.map(([label, value, note]) => (
            <tr key={label} className="border-t border-line">
              <th scope="row" className="py-2.5 pr-3 text-left font-normal text-fg">
                {label}
                {note && <span className="block text-xs text-muted">{note}</span>}
              </th>
              <td className={`py-2.5 text-right font-mono ${value < 0 ? "text-fg" : "text-fg"}`}>{formatPeso(value)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-accent">
            <th scope="row" className="py-3 text-left font-semibold text-fg">
              Net pay
            </th>
            <td className="py-3 text-right font-mono font-semibold text-accent">{formatPeso(period.net)}</td>
          </tr>
        </tbody>
      </table>

      <details className="mt-4">
        <summary className="min-h-9 text-sm text-fg">Monthly totals and employer share</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="py-1.5 text-left font-normal">Per month</th>
              <th scope="col" className="py-1.5 text-right font-normal">You</th>
              <th scope="col" className="py-1.5 text-right font-normal">Employer</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(
              [
                ["SSS", monthly.sss.employee, monthly.sss.employer + monthly.sss.ec],
                ["PhilHealth", monthly.philhealth.employee, monthly.philhealth.employer],
                ["Pag-IBIG", monthly.pagibig.employee, monthly.pagibig.employer],
              ] as const
            ).map(([label, you, employer]) => (
              <tr key={label} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-sans font-normal text-fg">{label}</th>
                <td className="py-1.5 text-right text-fg">{formatPeso(you)}</td>
                <td className="py-1.5 text-right text-muted">{formatPeso(employer)}</td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <th scope="row" className="py-1.5 text-left font-sans font-normal text-fg">Withholding tax</th>
              <td className="py-1.5 text-right text-fg">{formatPeso(monthly.tax)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs leading-relaxed text-muted">Employer SSS includes Employees&apos; Compensation (EC).</p>
      </details>
    </div>
  );

  const actions = (
    <Button
      variant="primary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(summary);
          setNotice("Copied the breakdown.");
        } catch {
          setNotice("Hindi ma-copy: the browser blocked clipboard access.");
        }
      }}
    >
      <Copy aria-hidden className="size-4" strokeWidth={2} />
      Copy breakdown
    </Button>
  );

  return <EditorShell label="PH take-home pay calculator" form={form} preview={preview} actions={actions} previewLabel="Result" />;
}
