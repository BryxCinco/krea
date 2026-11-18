"use client";

import { Copy, Info, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { DAILY_RATE_FACTORS, FINAL_PAY, FINAL_PAY_ASSUMPTIONS, LAST_UPDATED, SEPARATION_REASONS, SOURCES, VERIFICATION_STATUS, type SeparationReason } from "@/config/ph-labor";
import { useSession } from "@/lib/session";
import { formatPeso } from "@/tools/text/invoice";
import { computeFinalPay, type Deduction } from "@/tools/text/final-pay";
import { Group, NumberInput, Segmented, TextInput } from "./form";
import { EditorShell } from "./editor-shell";

const selectClass = "min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted";
const finite = (value: number) => (Number.isFinite(value) ? value : 0);
const longDate = (date: Date) => date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default function FinalPayEditor() {
  // Salary details stay in this tab only: nothing is saved, nothing leaves the device.
  const [salaryMode, setSalaryMode] = useState<"monthly" | "total">("monthly");
  const [monthlySalary, setMonthlySalary] = useState(25000);
  const [totalBasic, setTotalBasic] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [factor, setFactor] = useState<number>(DAILY_RATE_FACTORS[2].factor);
  const [unpaidDays, setUnpaidDays] = useState(0);
  const [leaveDays, setLeaveDays] = useState(0);
  const [reason, setReason] = useState<SeparationReason>("resigned");
  const [other, setOther] = useState(0);
  const [deductions, setDeductions] = useState<Deduction[]>([{ label: "Loans and cash advances", amount: 0 }]);
  const { setNotice } = useSession();
  const factorId = useId();
  const reasonId = useId();

  const result = computeFinalPay({
    salaryMode,
    monthlySalary: finite(monthlySalary),
    totalBasicThisYear: finite(totalBasic),
    start,
    end,
    factor,
    unpaidDays: finite(unpaidDays),
    unusedLeaveDays: finite(leaveDays),
    reason,
    otherEarnings: finite(other),
    deductions,
  });
  const problem = "problem" in result ? result.problem : null;
  const ok = "problem" in result ? null : result;

  const copy = async () => {
    if (!ok) return;
    const text = [
      `Final pay estimate: ${formatPeso(ok.net)}`,
      ...ok.lines.map((line) => `+ ${line.label}: ${formatPeso(line.amount)} (${line.detail})`),
      ...ok.deductions.map((line) => `- ${line.label}: ${formatPeso(line.amount)}`),
      `Service: ${ok.service.label}. Release by ${longDate(ok.releaseBy)}.`,
      "Estimate only, not legal or payroll advice.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Na-copy ang breakdown.");
    } catch {
      setNotice("Hindi ma-copy. Select the breakdown and copy it by hand.");
    }
  };

  const form = (
    <>
      <Group title="Salary">
        <Segmented
          label="I know my"
          value={salaryMode}
          onChange={setSalaryMode}
          options={[
            { value: "monthly", label: "Monthly basic salary" },
            { value: "total", label: "Total basic this year" },
          ]}
        />
        <NumberInput label="Monthly basic salary" unit="₱" value={monthlySalary} onChange={setMonthlySalary} step={100} hint="Without overtime and allowances. Used for the daily rate and separation pay." />
        {salaryMode === "total" && (
          <NumberInput label="Total basic salary earned this year" unit="₱" value={totalBasic} onChange={setTotalBasic} step={100} hint="From January 1 (or your start date) to your last day, for the 13th month pay. Use your payslips." />
        )}
        <div>
          <label htmlFor={factorId} className="mb-1.5 block text-sm text-fg">
            Work week (for the daily rate)
          </label>
          <select id={factorId} value={factor} onChange={(event) => setFactor(Number(event.target.value))} className={selectClass}>
            {DAILY_RATE_FACTORS.map((entry) => (
              <option key={entry.id} value={entry.factor}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
      </Group>
      <Group title="Employment">
        <TextInput label="Start date" type="date" value={start} onChange={setStart} />
        <TextInput label="Last day of work" type="date" value={end} onChange={setEnd} />
        <div>
          <label htmlFor={reasonId} className="mb-1.5 block text-sm text-fg">
            Reason for leaving
          </label>
          <select id={reasonId} value={reason} onChange={(event) => setReason(event.target.value as SeparationReason)} className={selectClass}>
            {SEPARATION_REASONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
      </Group>
      <Group title="Still owed to you">
        <NumberInput label="Unpaid days worked" unit="days" value={unpaidDays} onChange={setUnpaidDays} step={0.5} hint="Days worked since your last payday." />
        <NumberInput label="Unused leave days" unit="days" value={leaveDays} onChange={setLeaveDays} step={0.5} hint="Service incentive leave, and vacation leave if your company converts it to cash." />
        <NumberInput label="Other amounts owed to you" unit="₱" value={other} onChange={setOther} step={100} hint="Optional: unpaid commissions, allowances or refunds." />
      </Group>
      <Group
        title="Deductions"
        actions={
          <Button onClick={() => setDeductions((list) => [...list, { label: "", amount: 0 }])} className="min-h-9" disabled={deductions.length >= 10}>
            <Plus aria-hidden className="size-4" strokeWidth={1.75} />
            Add
          </Button>
        }
      >
        {deductions.map((entry, index) => (
          <div key={index} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
            <TextInput label={index === 0 ? "What for" : `Deduction ${index + 1}`} value={entry.label} onChange={(label) => setDeductions((list) => list.map((item, i) => (i === index ? { ...item, label } : item)))} placeholder="e.g. SSS loan, unreturned laptop" />
            <NumberInput label="Amount" unit="₱" value={entry.amount} onChange={(amount) => setDeductions((list) => list.map((item, i) => (i === index ? { ...item, amount } : item)))} step={100} />
            <Button icon aria-label={`Remove deduction ${index + 1}`} onClick={() => setDeductions((list) => list.filter((_, i) => i !== index))} disabled={deductions.length === 1}>
              <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            </Button>
          </div>
        ))}
      </Group>
      <p className="text-xs leading-relaxed text-muted">Hindi sine-save: your salary and dates stay in this tab only.</p>
      <section className="rounded-xl border border-signal/60 bg-panel p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
          Gabay lang ito, hindi legal o payroll advice
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This is an estimate from DOLE rules, last checked <span className="font-mono text-fg">{LAST_UPDATED}</span>
          {VERIFICATION_STATUS === "verify" && " and not yet confirmed against the newest DOLE advisories"}. Your employer&apos;s records, contract, policy or CBA decide the actual amounts. Questions? Ask your HR first, then DOLE (hotline 1349).
        </p>
        <details className="mt-3">
          <summary className="min-h-9 text-sm text-fg">Assumptions</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted">
            {FINAL_PAY_ASSUMPTIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
        <details className="mt-1">
          <summary className="min-h-9 text-sm text-fg">Sources</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted">
            {SOURCES.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="text-sm text-muted">Estimated final pay</p>
      <p className={`mt-1 font-mono text-4xl font-semibold ${ok && ok.net < 0 ? "text-signal" : "text-accent"}`} aria-live="polite">
        {ok ? formatPeso(ok.net) : "—"}
      </p>
      {ok && (
        <p className="mt-1 font-mono text-sm text-muted">
          Release by {longDate(ok.releaseBy)} ({FINAL_PAY.releaseDays} days) · {ok.service.label} of service
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-4 rounded-md border border-signal/60 p-3 text-sm text-signal">
          {problem}
        </p>
      )}
      {ok && (
        <>
          <table className="mt-5 w-full text-sm">
            <caption className="sr-only">Final pay breakdown</caption>
            <tbody>
              {ok.lines.map((line) => (
                <tr key={line.label} className="border-t border-line">
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal text-fg">
                    {line.label}
                    <span className="block text-xs text-muted">{line.detail}</span>
                  </th>
                  <td className="py-2.5 text-right font-mono text-fg">{formatPeso(line.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-line">
                <th scope="row" className="py-2.5 text-left font-semibold text-fg">
                  Total owed to you
                </th>
                <td className="py-2.5 text-right font-mono font-semibold text-fg">{formatPeso(ok.gross)}</td>
              </tr>
              {ok.deductions.map((line, index) => (
                <tr key={`${line.label}-${index}`} className="border-t border-line">
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal text-fg">
                    Less: {line.label}
                  </th>
                  <td className="py-2.5 text-right font-mono text-fg">−{formatPeso(line.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-accent">
                <th scope="row" className="py-3 text-left font-semibold text-fg">
                  Final pay
                </th>
                <td className={`py-3 text-right font-mono font-semibold ${ok.net < 0 ? "text-signal" : "text-accent"}`}>{formatPeso(ok.net)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 font-mono text-xs text-muted">Daily rate used: {formatPeso(ok.dailyRate)}</p>
          {ok.notes.length > 0 && (
            <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-xs leading-relaxed text-muted">
              {ok.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted">Estimate only. Taxes are not computed. Your employer&apos;s payroll may differ.</p>
        </>
      )}
    </div>
  );

  const actions = (
    <Button onClick={copy} disabled={!ok}>
      <Copy aria-hidden className="size-4" strokeWidth={1.75} />
      Copy breakdown
    </Button>
  );
  return <EditorShell label="Final pay calculator" form={form} preview={preview} actions={actions} previewLabel="Breakdown" />;
}
