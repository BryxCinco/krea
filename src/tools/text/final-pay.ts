/**
 * Tool 51: Final Pay Calculator (Philippines). Estimates final pay ("back pay")
 * when someone resigns or is separated: unpaid salary, unused leave converted to
 * cash, pro-rated 13th month pay (using the same rule as the 13th Month tab of
 * PH Pay Calculators, tool 33), separation pay by cause, minus loans and other
 * deductions. Rules and notes live in src/config/ph-labor.ts.
 * UI: components/stage/editors/final-pay-editor.tsx. Nothing is saved.
 */
import { FINAL_PAY, SEPARATION_PAY, SEPARATION_REASONS, SERVICE_INCENTIVE_LEAVE, THIRTEENTH_MONTH, type SeparationReason } from "@/config/ph-labor";
import { editorTool } from "./editor-tool";
import { dailyFromMonthly, thirteenthMonth } from "./ph-pay";

export const finalPay = editorTool({
  id: 51,
  slug: "ph-final-pay-calculator",
  name: "Final Pay Calculator",
  verb: "Compute final pay",
  description: "Estimate your final pay (back pay) in the Philippines: last salary, unused leave, pro-rated 13th month and separation pay, minus loans.",
  seoTitle: "Final Pay Calculator Philippines: back pay, 13th month and separation pay",
  seoDescription:
    "Compute your final pay or back pay after resigning or being laid off in the Philippines: unpaid salary, leave conversion, pro-rated 13th month pay and separation pay under the Labor Code, minus loans. Free, nothing saved.",
  howTo: [
    "Enter your monthly basic salary (or the total basic salary you earned this year), your start date and your last day.",
    "Add unpaid days worked, unused leave days, the reason you left, and any loans or deductions.",
    "Read the breakdown and the date it should be released. Check it with your HR.",
  ],
  faqs: [
    { q: "What is included in final pay?", a: "Unpaid salary for days you worked, your unused service incentive leave converted to cash, your pro-rated 13th month pay, and separation pay if you were let go for an authorized cause such as redundancy. Loans and other amounts you owe the company are deducted." },
    { q: "When should I receive my final pay?", a: `Within ${FINAL_PAY.releaseDays} days from your last day, under DOLE Labor Advisory No. 06, Series of 2020, unless your company policy or contract gives a shorter period.` },
    { q: "Do I get separation pay if I resign?", a: "Not by law. Separation pay is due for authorized causes such as redundancy, retrenchment, closure not due to serious losses, or disease. Your contract, company policy or CBA may still give it, so ask HR." },
    { q: "How is the 13th month part computed?", a: "One-twelfth of the basic salary you earned from January 1 (or your start date) up to your last day. Overtime, allowances and holiday pay are not included." },
    { q: "Is this official?", a: "No. It is a guide based on DOLE rules, not legal or payroll advice. Your employer's records, policy or CBA can change the amounts. If you disagree with your final pay, ask your HR first, then DOLE (hotline 1349)." },
  ],
  icon: "finalpay",
});

const round2 = (value: number) => Math.round(value * 100 + (value >= 0 ? 1e-7 : -1e-7)) / 100;
const DAY = 86_400_000;

/** "2026-03-15" to a UTC date, or null when it is not a real date. */
export function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 ? date : null;
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * Length of service, from the first day to the last day worked (both included).
 * `years` follows the separation-pay rule: a remainder of 6 months or more counts as a year.
 */
export function serviceLength(start: Date, end: Date): { months: number; years: number; label: string } {
  // Whole months from the first day to the day after the last day: Jan 15 to Feb 14 is one month.
  const next = new Date(end.getTime() + DAY);
  const months = Math.max(0, (next.getUTCFullYear() - start.getUTCFullYear()) * 12 + (next.getUTCMonth() - start.getUTCMonth()) - (next.getUTCDate() < start.getUTCDate() ? 1 : 0));
  const whole = Math.floor(months / 12);
  const rest = months % 12;
  const years = whole + (rest >= SEPARATION_PAY.fractionYearMonths ? 1 : 0);
  const label = `${whole} ${whole === 1 ? "year" : "years"}${rest ? `, ${rest} ${rest === 1 ? "month" : "months"}` : ""}`;
  return { months, years, label };
}

/**
 * Basic salary earned in each month of the final calendar year, for a fixed monthly
 * salary: full months count in full, the first and last months by calendar days worked.
 */
export function finalYearMonths(salary: number, start: Date, end: Date): number[] {
  const year = end.getUTCFullYear();
  const from = start.getUTCFullYear() === year ? start : new Date(Date.UTC(year, 0, 1));
  return Array.from({ length: 12 }, (_, month) => {
    if (month < from.getUTCMonth() || month > end.getUTCMonth()) return 0;
    const total = daysInMonth(year, month);
    const firstDay = month === from.getUTCMonth() ? from.getUTCDate() : 1;
    const lastDay = month === end.getUTCMonth() ? end.getUTCDate() : total;
    return round2((salary * (lastDay - firstDay + 1)) / total);
  });
}

export interface Deduction {
  label: string;
  amount: number;
}

export interface FinalPayInput {
  /** "monthly": a fixed monthly basic salary; "total": the total basic salary earned in the final year is known. */
  salaryMode: "monthly" | "total";
  monthlySalary: number;
  totalBasicThisYear: number;
  start: string;
  end: string;
  /** Days-per-year factor (365, 313 or 261) for the daily rate. */
  factor: number;
  unpaidDays: number;
  unusedLeaveDays: number;
  reason: SeparationReason;
  otherEarnings: number;
  deductions: Deduction[];
}

export interface FinalPayLine {
  label: string;
  detail: string;
  amount: number;
}

export interface FinalPayResult {
  lines: FinalPayLine[];
  gross: number;
  deductions: FinalPayLine[];
  totalDeductions: number;
  net: number;
  dailyRate: number;
  service: ReturnType<typeof serviceLength>;
  releaseBy: Date;
  notes: string[];
}

/** Returns the breakdown, or a plain-language problem with the input. */
export function computeFinalPay(input: FinalPayInput): FinalPayResult | { problem: string } {
  const start = parseDate(input.start);
  const end = parseDate(input.end);
  if (!start || !end) return { problem: "Ilagay ang petsa ng pagsisimula at ang huling araw ng trabaho." };
  if (end < start) return { problem: "Ang huling araw ay mas maaga sa petsa ng pagsisimula. Check the dates." };
  if (end.getUTCFullYear() - start.getUTCFullYear() > 60) return { problem: "More than 60 years of service: check the start date." };
  const monthly = input.monthlySalary;
  if (!(monthly > 0)) return { problem: "Ilagay ang monthly basic salary. It is needed for the daily rate and separation pay." };
  if (input.salaryMode === "total" && !(input.totalBasicThisYear >= 0)) return { problem: "Ilagay ang total basic salary na kinita ngayong taon." };
  for (const [value, label] of [
    [input.unpaidDays, "Unpaid days"],
    [input.unusedLeaveDays, "Unused leave days"],
    [input.otherEarnings, "Other amounts owed"],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) return { problem: `${label} must be zero or more.` };
  }
  if (input.unpaidDays > 31) return { problem: "Unpaid days are the days worked since your last payday, so at most 31. Put older unpaid salary under Other amounts owed." };
  if (input.deductions.some((entry) => !Number.isFinite(entry.amount) || entry.amount < 0)) return { problem: "Deductions must be zero or more." };

  const dailyRate = dailyFromMonthly(monthly, input.factor);
  const service = serviceLength(start, end);
  const notes: string[] = [];
  const lines: FinalPayLine[] = [];

  if (input.unpaidDays > 0) {
    lines.push({ label: "Unpaid salary", detail: `${input.unpaidDays} ${input.unpaidDays === 1 ? "day" : "days"} × ₱${dailyRate.toFixed(2)} daily rate`, amount: round2(input.unpaidDays * dailyRate) });
  }

  if (input.unusedLeaveDays > 0) {
    lines.push({ label: "Unused leave converted to cash", detail: `${input.unusedLeaveDays} ${input.unusedLeaveDays === 1 ? "day" : "days"} × ₱${dailyRate.toFixed(2)}`, amount: round2(input.unusedLeaveDays * dailyRate) });
    if (service.months < SERVICE_INCENTIVE_LEAVE.minServiceYears * 12) {
      notes.push("You worked less than a year, so the 5-day service incentive leave is not yet due by law. Leave you entered is converted only if your company policy allows it.");
    } else if (input.unusedLeaveDays > SERVICE_INCENTIVE_LEAVE.days) {
      notes.push(`By law only ${SERVICE_INCENTIVE_LEAVE.days} days of service incentive leave a year must be converted to cash. The rest depends on your company's leave policy.`);
    }
  }

  const months = input.salaryMode === "total" ? null : finalYearMonths(monthly, start, end);
  const thirteenth = months ? thirteenthMonth(months) : thirteenthMonth([input.totalBasicThisYear]);
  lines.push({
    label: "Pro-rated 13th month pay",
    detail: `₱${thirteenth.totalBasic.toLocaleString("en-PH", { minimumFractionDigits: 2 })} basic earned in ${end.getUTCFullYear()} ÷ ${THIRTEENTH_MONTH.divisor}`,
    amount: thirteenth.amount,
  });

  const reason = SEPARATION_REASONS.find((entry) => entry.id === input.reason) ?? SEPARATION_REASONS[0];
  if (reason.monthsPerYear > 0) {
    const perYear = round2(monthly * reason.monthsPerYear * service.years);
    const minimum = round2(monthly * SEPARATION_PAY.minimumMonths);
    const amount = Math.max(perYear, minimum);
    lines.push({
      label: "Separation pay",
      detail: amount === minimum && perYear < minimum ? `Minimum of ${SEPARATION_PAY.minimumMonths} month's pay` : `${reason.monthsPerYear === 1 ? "1 month" : "½ month"} × ${service.years} ${service.years === 1 ? "year" : "years"} of service`,
      amount,
    });
  }
  notes.push(reason.note);

  if (input.otherEarnings > 0) lines.push({ label: "Other amounts owed to you", detail: "Commissions, unpaid allowances or refunds you entered", amount: round2(input.otherEarnings) });

  const deductions = input.deductions.filter((entry) => entry.amount > 0).map((entry) => ({ label: entry.label.trim() || "Deduction", detail: "", amount: round2(entry.amount) }));
  const gross = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const totalDeductions = round2(deductions.reduce((sum, line) => sum + line.amount, 0));
  const net = round2(gross - totalDeductions);
  if (net < 0) notes.push("Your deductions are more than what is owed to you, so you may owe the balance. Ask HR how it will be settled.");

  return { lines, gross, deductions, totalDeductions, net, dailyRate, service, releaseBy: new Date(end.getTime() + FINAL_PAY.releaseDays * DAY), notes };
}
