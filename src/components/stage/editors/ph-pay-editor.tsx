"use client";

import { Copy, Download, Info } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ASSUMPTIONS, DAILY_RATE_FACTORS, DAY_TYPES, LAST_UPDATED, NIGHT_DIFFERENTIAL, SOURCES, THIRTEENTH_MONTH, VERIFICATION_STATUS, type DayType } from "@/config/ph-labor";
import { downloadBlob } from "@/lib/download";
import { onTabListKeyDown } from "@/lib/use-focus-trap";
import { useSession } from "@/lib/session";
import { formatPeso } from "@/tools/text/invoice";
import { addOnLoan, amortize, dailyFromMonthly, dayPay, scheduleCsv, simpleMonths, thirteenthMonth } from "@/tools/text/ph-pay";
import { Group, NumberInput, Segmented } from "./form";
import { EditorShell } from "./editor-shell";

type Tab = "thirteenth" | "overtime" | "loan";
const TABS: [Tab, string][] = [
  ["thirteenth", "13th Month"],
  ["overtime", "Overtime & Holiday"],
  ["loan", "Loan"],
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MAX_LOAN_MONTHS = 600;
const MAX_DAY_HOURS = 24;

const selectClass = "min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted";
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

function Select<T extends string | number>({ label, value, options, onChange, hint }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-fg">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.target.value);
          if (match) onChange(match.value);
        }}
        className={selectClass}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-md border border-signal/60 p-3 text-sm text-signal">
      {children}
    </p>
  );
}

export default function PhPayEditor() {
  // Salary and loan details live in this tab only: nothing is saved, nothing leaves the device.
  const [tab, setTab] = useState<Tab>("thirteenth");
  const panelId = useId();
  const { setNotice } = useSession();

  // 13th month
  const [thMode, setThMode] = useState<"simple" | "monthly">("simple");
  const [salary, setSalary] = useState(20_000);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [unpaidDays, setUnpaidDays] = useState(0);
  const [thFactor, setThFactor] = useState(261);
  const [monthly, setMonthly] = useState<number[]>(() => Array(12).fill(20_000));

  // Overtime and holiday
  const [basis, setBasis] = useState<"daily" | "monthly">("daily");
  const [daily, setDaily] = useState(695);
  const [otMonthly, setOtMonthly] = useState(20_000);
  const [factor, setFactor] = useState(261);
  const [dayType, setDayType] = useState<DayType>("regular");
  const [regularHours, setRegularHours] = useState(8);
  const [overtimeHours, setOvertimeHours] = useState(2);
  const [nightRegular, setNightRegular] = useState(0);
  const [nightOvertime, setNightOvertime] = useState(0);

  // Loan
  const [principal, setPrincipal] = useState(100_000);
  const [rate, setRate] = useState(12);
  const [term, setTerm] = useState(12);
  const [method, setMethod] = useState<"diminishing" | "addon">("diminishing");

  // ------------------------------------------------ results
  const thDaily = dailyFromMonthly(finite(salary), thFactor);
  const thMonths = thMode === "simple" ? simpleMonths(finite(salary), startMonth, endMonth, finite(unpaidDays), thDaily) : monthly.map(finite);
  const th = thirteenthMonth(thMonths);
  const thProblem = thMode === "simple" && startMonth > endMonth ? "The last month must be the same as or after the first month." : "";

  const dailyRate = basis === "daily" ? finite(daily) : dailyFromMonthly(finite(otMonthly), factor);
  const hoursProblem =
    regularHours < 0 || overtimeHours < 0 || nightRegular < 0 || nightOvertime < 0
      ? "Hours cannot be negative."
      : regularHours + overtimeHours > MAX_DAY_HOURS
        ? `Regular and overtime hours add up to more than ${MAX_DAY_HOURS} in one day.`
        : regularHours > 8
          ? "Regular hours stop at 8. Put the rest under overtime."
          : nightRegular > regularHours || nightOvertime > overtimeHours
            ? "Night hours cannot be more than the hours they are part of."
            : "";
  const pay = dayPay({ dailyRate, dayType, regularHours, overtimeHours, nightRegularHours: nightRegular, nightOvertimeHours: nightOvertime });

  const loanProblem =
    !(principal > 0) ? "Enter the loan amount." : !(rate >= 0) || rate > 200 ? "Enter a yearly interest rate from 0 to 200%." : !(term >= 1) || term > MAX_LOAN_MONTHS || !Number.isInteger(term) ? `Enter a whole number of months from 1 to ${MAX_LOAN_MONTHS}.` : "";
  const loan = useMemo(() => (loanProblem ? null : method === "diminishing" ? amortize(principal, rate, term) : addOnLoan(principal, rate, term)), [loanProblem, method, principal, rate, term]);
  // Same loan the other way, for comparison.
  const other = useMemo(() => (loanProblem ? null : method === "diminishing" ? addOnLoan(principal, rate, term) : amortize(principal, rate, term)), [loanProblem, method, principal, rate, term]);

  const note = `Estimate by Krea. DOLE rules as last checked ${LAST_UPDATED}; verify with DOLE, your HR or the lender.`;
  const summary =
    tab === "thirteenth"
      ? [`13th month pay: ${formatPeso(th.amount)}`, `Total basic salary for the year: ${formatPeso(th.totalBasic)} ÷ ${THIRTEENTH_MONTH.divisor}`, `Months with pay: ${th.monthsCounted}`, note]
      : tab === "overtime"
        ? [`Pay for the day: ${formatPeso(pay.total)}`, `${DAY_TYPES.find((d) => d.id === dayType)?.label}, daily rate ${formatPeso(dailyRate)}, hourly ${formatPeso(pay.hourly)}`, ...pay.lines.map((line) => `${line.label}: ${line.formula} = ${formatPeso(line.amount)}`), note]
        : loan
          ? [`Monthly payment: ${formatPeso(loan.payment)}`, `${method === "diminishing" ? "Diminishing balance" : "Add-on (flat)"} interest, ${rate}% a year, ${term} months`, `Total interest: ${formatPeso(loan.totalInterest)}`, `Total paid: ${formatPeso(loan.totalPaid)}`, ...(loan.equivalentRate ? [`Equivalent diminishing rate: about ${loan.equivalentRate}% a year`] : []), note]
          : [note];
  const problem = tab === "thirteenth" ? thProblem : tab === "overtime" ? hoursProblem : loanProblem;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary.join("\n"));
      setNotice("Copied the breakdown.");
    } catch {
      setNotice("Hindi ma-copy: the browser blocked clipboard access.");
    }
  };

  // ------------------------------------------------ form
  const thirteenthForm = (
    <Group title="13th month pay">
      <Segmented
        label="How you were paid"
        value={thMode}
        onChange={setThMode}
        options={[
          { value: "simple", label: "Same salary each month" },
          { value: "monthly", label: "Month by month" },
        ]}
      />
      {thMode === "simple" ? (
        <>
          <NumberInput label="Basic monthly salary" unit="₱" value={salary} onChange={setSalary} step={100} hint="Basic pay only. Leave out overtime, holiday pay, night differential and allowances." />
          <div className="grid grid-cols-2 gap-3">
            <Select label="First month worked" value={startMonth} onChange={setStartMonth} options={MONTH_NAMES.map((label, index) => ({ value: index + 1, label }))} />
            <Select label="Last month worked" value={endMonth} onChange={setEndMonth} options={MONTH_NAMES.map((label, index) => ({ value: index + 1, label }))} />
          </div>
          <NumberInput label="Unpaid absences this year" unit="days" value={unpaidDays} onChange={setUnpaidDays} step={1} hint={`Leave without pay and unpaid absences. Each day takes off ${formatPeso(thDaily)} (salary × 12 ÷ ${thFactor}).`} />
          <Select label="Work days per year (for the daily rate)" value={thFactor} onChange={setThFactor} options={DAILY_RATE_FACTORS.map((entry) => ({ value: entry.factor, label: entry.label }))} />
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted">Basic salary actually earned each month, after unpaid absences. Put 0 for months you did not work.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MONTHS.map((label, index) => (
              <NumberInput
                key={label}
                label={label}
                unit="₱"
                step={100}
                value={monthly[index]}
                onChange={(value) => setMonthly((list) => list.map((entry, i) => (i === index ? value : entry)))}
              />
            ))}
          </div>
        </>
      )}
      {thProblem && <Problem>{thProblem}</Problem>}
      <details>
        <summary className="min-h-9 text-sm text-fg">Not part of basic salary</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted">
          {THIRTEENTH_MONTH.excluded.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-muted">Unless your contract, CBA or company practice treats them as basic salary.</p>
      </details>
    </Group>
  );

  const overtimeForm = (
    <Group title="Overtime & holiday pay">
      <Segmented
        label="Your rate"
        value={basis}
        onChange={setBasis}
        options={[
          { value: "daily", label: "Daily rate" },
          { value: "monthly", label: "Monthly salary" },
        ]}
      />
      {basis === "daily" ? (
        <NumberInput label="Basic daily rate" unit="₱" value={daily} onChange={setDaily} step={10} />
      ) : (
        <>
          <NumberInput label="Basic monthly salary" unit="₱" value={otMonthly} onChange={setOtMonthly} step={100} />
          <Select label="Work days per year" value={factor} onChange={setFactor} options={DAILY_RATE_FACTORS.map((entry) => ({ value: entry.factor, label: entry.label }))} hint={`Daily rate = salary × 12 ÷ ${factor} = ${formatPeso(dailyRate)}. Ask HR which factor your company uses.`} />
        </>
      )}
      <Select label="Kind of day" value={dayType} onChange={setDayType} options={DAY_TYPES.map((entry) => ({ value: entry.id, label: `${entry.label} (${Math.round(entry.multiplier * 100)}%)` }))} />
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Regular hours" unit="hrs" value={regularHours} onChange={setRegularHours} step={0.5} hint="Up to 8." />
        <NumberInput label="Overtime hours" unit="hrs" value={overtimeHours} onChange={setOvertimeHours} step={0.5} hint="Past 8 hours." />
        <NumberInput label="Night hours (regular)" unit="hrs" value={nightRegular} onChange={setNightRegular} step={0.5} hint={`${NIGHT_DIFFERENTIAL.from} to ${NIGHT_DIFFERENTIAL.to}`} />
        <NumberInput label="Night hours (overtime)" unit="hrs" value={nightOvertime} onChange={setNightOvertime} step={0.5} hint={`${NIGHT_DIFFERENTIAL.from} to ${NIGHT_DIFFERENTIAL.to}`} />
      </div>
      {hoursProblem && <Problem>{hoursProblem}</Problem>}
    </Group>
  );

  const loanForm = (
    <Group title="Loan amortization">
      <NumberInput label="Loan amount" unit="₱" value={principal} onChange={setPrincipal} step={1000} />
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Interest per year" unit="%" value={rate} onChange={setRate} step={0.25} hint="A 1.5% monthly rate is 18% a year." />
        <NumberInput label="Term" unit="months" value={term} onChange={setTerm} step={1} />
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
      <p className="text-xs leading-relaxed text-muted">Check your loan disclosure statement. Fees, insurance and taxes are not included.</p>
      {loanProblem && <Problem>{loanProblem}</Problem>}
    </Group>
  );

  const form = (
    <>
      <div role="tablist" aria-label="Pay calculators" onKeyDown={onTabListKeyDown} className="grid grid-cols-3 gap-1 rounded-md border border-line bg-panel p-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${panelId}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${panelId}-panel`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={`min-h-10 rounded px-1.5 text-sm leading-tight transition-colors ${tab === id ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-tab-${tab}`} className="flex flex-col gap-5">
        {tab === "thirteenth" ? thirteenthForm : tab === "overtime" ? overtimeForm : loanForm}
        <p className="text-xs leading-relaxed text-muted">Hindi sine-save: your salary and loan details stay in this tab only.</p>
      </div>

      <section aria-labelledby={`${panelId}-rules`} className="rounded-xl border border-signal/60 bg-panel p-4">
        <h2 id={`${panelId}-rules`} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
          Verify before relying on this
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Rules last checked <span className="font-mono text-fg">{LAST_UPDATED}</span>
          {VERIFICATION_STATUS === "verify" && ", copied from DOLE's 2023 handbook but not yet confirmed against the newest DOLE advisories"}. These are legal minimums: your company may pay more.
          Check with DOLE (hotline 1349), your HR or the lender. This is an estimate, not legal advice.
        </p>
        <details className="mt-3">
          <summary className="min-h-9 text-sm text-fg">Sources</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted">
            {SOURCES.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </details>
        <details className="mt-1">
          <summary className="min-h-9 text-sm text-fg">Assumptions</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted">
            {ASSUMPTIONS.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );

  // ------------------------------------------------ preview
  const big = (label: string, value: string, sub?: string) => (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-mono text-4xl font-semibold text-accent" aria-live="polite">
        {value}
      </p>
      {sub && <p className="mt-1 font-mono text-sm text-muted">{sub}</p>}
    </>
  );

  const thirteenthPreview = (
    <>
      {big("13th month pay", thProblem ? "—" : formatPeso(th.amount), `Due on or before ${THIRTEENTH_MONTH.deadline}`)}
      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">13th month computation</caption>
        <tbody>
          <tr className="border-t border-line">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-fg">
              Total basic salary earned
              <span className="block text-xs text-muted">{th.monthsCounted} {th.monthsCounted === 1 ? "month" : "months"} with pay</span>
            </th>
            <td className="py-2.5 text-right font-mono text-fg">{formatPeso(th.totalBasic)}</td>
          </tr>
          <tr className="border-t border-line">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-fg">
              Divided by
            </th>
            <td className="py-2.5 text-right font-mono text-fg">{THIRTEENTH_MONTH.divisor}</td>
          </tr>
          <tr className="border-t-2 border-accent">
            <th scope="row" className="py-3 text-left font-semibold text-fg">
              13th month pay
            </th>
            <td className="py-3 text-right font-mono font-semibold text-accent">{formatPeso(th.amount)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-muted">At least one-twelfth of the basic salary earned within the calendar year. Resigned or newly hired? It is prorated to the months you worked.</p>
    </>
  );

  const overtimePreview = (
    <>
      {big("Pay for the day", hoursProblem ? "—" : formatPeso(pay.total), `Hourly rate ${formatPeso(pay.hourly)} (daily ${formatPeso(dailyRate)} ÷ 8)`)}
      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Breakdown for the day</caption>
        <tbody>
          {pay.lines.map((line) => (
            <tr key={line.label} className="border-t border-line">
              <th scope="row" className="py-2.5 pr-3 text-left font-normal text-fg">
                {line.label}
                <span className="block font-mono text-xs text-muted">{line.formula}</span>
              </th>
              <td className="py-2.5 text-right align-top font-mono text-fg">{formatPeso(line.amount)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-accent">
            <th scope="row" className="py-3 text-left font-semibold text-fg">
              Total
            </th>
            <td className="py-3 text-right font-mono font-semibold text-accent">{formatPeso(pay.total)}</td>
          </tr>
        </tbody>
      </table>
      {!hoursProblem && pay.total > pay.ordinaryEquivalent && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-mono text-fg">{formatPeso(pay.total - pay.ordinaryEquivalent)}</span> more than the same hours at the plain hourly rate.
        </p>
      )}
    </>
  );

  const loanPreview = loan ? (
    <>
      {big("Monthly payment", formatPeso(loan.payment), `${term} ${term === 1 ? "month" : "months"} · ${method === "diminishing" ? "diminishing balance" : "add-on (flat)"}`)}
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-line p-3">
          <dt className="text-xs text-muted">Total interest</dt>
          <dd className="mt-1 font-mono text-fg">{formatPeso(loan.totalInterest)}</dd>
        </div>
        <div className="rounded-lg border border-line p-3">
          <dt className="text-xs text-muted">Total paid</dt>
          <dd className="mt-1 font-mono text-fg">{formatPeso(loan.totalPaid)}</dd>
        </div>
      </dl>
      {other && (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {method === "addon" ? (
            <>
              At {rate}% add-on, this costs the same as about <span className="font-mono text-fg">{loan.equivalentRate}%</span> a year on a diminishing balance. The same {rate}% on a diminishing balance would cost{" "}
              <span className="font-mono text-fg">{formatPeso(other.totalInterest)}</span> in interest.
            </>
          ) : (
            <>
              The same {rate}% as add-on (flat) interest would cost <span className="font-mono text-fg">{formatPeso(other.totalInterest)}</span> in interest.
            </>
          )}
        </p>
      )}
      <div className="mt-5 max-h-96 overflow-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label="Payment schedule">
        <table className="w-full text-sm">
          <caption className="sr-only">Payment schedule</caption>
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
            {loan.rows.map((row) => (
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
    </>
  ) : (
    big("Monthly payment", "—")
  );

  const preview = <div className="rounded-xl border border-line bg-panel p-5">{tab === "thirteenth" ? thirteenthPreview : tab === "overtime" ? overtimePreview : loanPreview}</div>;

  const actions = (
    <>
      <Button variant="primary" onClick={copy} disabled={!!problem}>
        <Copy aria-hidden className="size-4" strokeWidth={2} />
        Copy breakdown
      </Button>
      {tab === "loan" && (
        <Button
          onClick={() => {
            if (!loan) return;
            downloadBlob(new Blob([scheduleCsv(loan.rows)], { type: "text/csv;charset=utf-8" }), "loan-schedule.csv");
            setNotice("Na-download ang schedule.");
          }}
          disabled={!loan}
        >
          <Download aria-hidden className="size-4" strokeWidth={1.75} />
          Download CSV
        </Button>
      )}
    </>
  );

  return <EditorShell label="PH pay calculators" form={form} preview={preview} actions={actions} previewLabel="Result" />;
}
