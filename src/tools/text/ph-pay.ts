/**
 * Tool 33: PH Pay Calculators (13th month pay, overtime and premium pay, loan amortization).
 * Rules and multipliers live in src/config/ph-labor.ts. The UI is ph-pay-editor.tsx.
 * Nothing is saved.
 */
import { DAY_TYPES, HOURS_PER_DAY, NIGHT_DIFFERENTIAL, OVERTIME, THIRTEENTH_MONTH, type DayType } from "@/config/ph-labor";
import { editorTool } from "./editor-tool";

export const phPay = editorTool({
  id: 33,
  slug: "ph-pay-calculators",
  name: "PH Pay Calculators",
  verb: "Calculate pay",
  description: "13th month pay, overtime and holiday pay, and loan amortization, with Philippine rules.",
  seoTitle: "13th Month Pay, Overtime and Holiday Pay, and Loan Calculator (Philippines)",
  seoDescription:
    "Compute your 13th month pay (including partial years), overtime, rest day, holiday and night differential pay using DOLE multipliers, and a loan amortization schedule with CSV export. Free, nothing saved.",
  howTo: [
    "Pick a tab: 13th Month, Overtime & Holiday, or Loan.",
    "Enter your salary, hours or loan details. Results update as you type.",
    "Check the breakdown and the notes. Verify important amounts with your HR, DOLE or the lender.",
  ],
  faqs: [
    { q: "How is 13th month pay computed?", a: "It is at least one-twelfth of the total basic salary you earned in the calendar year. Overtime, holiday and premium pay, night differential, COLA and most allowances are not included unless your company treats them as part of basic salary." },
    { q: "Do I get 13th month pay if I resigned?", a: "Yes. Rank-and-file employees who worked at least one month in the year get a prorated 13th month pay: one-twelfth of the basic salary earned from January (or your start date) until you left." },
    { q: "How much is pay for working on a regular holiday?", a: "At least 200% of your daily wage for the first 8 hours, and 260% if it is also your rest day. Overtime on that day adds 30% of the hourly rate for that day. Krea shows the full breakdown." },
    { q: "Where do the rates come from?", a: "From DOLE's Handbook on Workers' Statutory Monetary Benefits (2023 edition). Rules can change and companies may pay more, so the page shows the date the rates were last checked and asks you to verify with DOLE or your HR." },
    { q: "What is the difference between diminishing and add-on interest?", a: "With diminishing balance, interest is charged only on what you still owe, so it drops every month. With add-on (flat) interest, it is charged on the original amount for the whole term, which costs much more at the same stated rate. Krea shows the equivalent diminishing rate so you can compare offers." },
  ],
  icon: "paycalc",
});

const round2 = (value: number) => Math.round(value * 100 + (value >= 0 ? 1e-7 : -1e-7)) / 100;

// ---------------------------------------------------------------- 13th month

export interface ThirteenthResult {
  totalBasic: number;
  amount: number;
  monthsCounted: number;
}

/** One-twelfth of the total basic salary earned in the year. `monthly` holds what was earned each month (0 = not worked). */
export function thirteenthMonth(monthly: number[]): ThirteenthResult {
  const earned = monthly.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const totalBasic = round2(earned.reduce((sum, value) => sum + value, 0));
  return { totalBasic, amount: round2(totalBasic / THIRTEENTH_MONTH.divisor), monthsCounted: earned.filter((value) => value > 0).length };
}

/** The months array for a fixed monthly salary, worked from `startMonth` to `endMonth` (1-12), minus unpaid absences. */
export function simpleMonths(salary: number, startMonth: number, endMonth: number, unpaidDays: number, dailyRate: number): number[] {
  const months = Array.from({ length: 12 }, (_, i) => (i + 1 >= startMonth && i + 1 <= endMonth ? salary : 0));
  // Unpaid days come off the total; spread from the last worked month backwards.
  let deduction = Math.max(0, unpaidDays) * Math.max(0, dailyRate);
  for (let i = endMonth - 1; i >= startMonth - 1 && deduction > 0; i--) {
    const take = Math.min(months[i], deduction);
    months[i] = round2(months[i] - take);
    deduction -= take;
  }
  return months;
}

// ---------------------------------------------------------------- overtime and premium pay

export interface DayPayInput {
  dailyRate: number;
  dayType: DayType;
  /** Hours worked within the normal 8. */
  regularHours: number;
  overtimeHours: number;
  /** Of the regular hours, how many fell between 10 p.m. and 6 a.m. */
  nightRegularHours: number;
  /** Of the overtime hours, how many fell between 10 p.m. and 6 a.m. */
  nightOvertimeHours: number;
}

export interface PayLine {
  label: string;
  formula: string;
  amount: number;
}

export interface DayPayResult {
  hourly: number;
  dayMultiplier: number;
  overtimeMultiplier: number;
  lines: PayLine[];
  total: number;
  /** What the same hours would pay on an ordinary day with no night work: the extra is the premium. */
  ordinaryEquivalent: number;
}

const pct = (value: number) => `${round2(value * 100)}%`;

export function dayPay(input: DayPayInput): DayPayResult {
  const day = DAY_TYPES.find((entry) => entry.id === input.dayType) ?? DAY_TYPES[0];
  const hourly = input.dailyRate / HOURS_PER_DAY;
  const dayMultiplier = day.multiplier;
  const overtimeMultiplier = input.dayType === "ordinary" ? OVERTIME.ordinary : OVERTIME.other;
  const regular = Math.min(HOURS_PER_DAY, Math.max(0, input.regularHours));
  const overtime = Math.max(0, input.overtimeHours);
  const nightRegular = Math.min(regular, Math.max(0, input.nightRegularHours));
  const nightOvertime = Math.min(overtime, Math.max(0, input.nightOvertimeHours));
  const peso = (value: number) => `₱${round2(value).toFixed(2)}`;

  const lines: PayLine[] = [];
  lines.push({ label: `${regular} regular ${regular === 1 ? "hour" : "hours"} (${day.label.toLowerCase()})`, formula: `${peso(hourly)} × ${pct(dayMultiplier)} × ${regular}`, amount: round2(hourly * dayMultiplier * regular) });
  if (nightRegular) {
    lines.push({ label: `Night differential on ${nightRegular} regular ${nightRegular === 1 ? "hour" : "hours"}`, formula: `${peso(hourly)} × ${pct(dayMultiplier)} × 10% × ${nightRegular}`, amount: round2(hourly * dayMultiplier * NIGHT_DIFFERENTIAL.rate * nightRegular) });
  }
  if (overtime) {
    lines.push({ label: `${overtime} overtime ${overtime === 1 ? "hour" : "hours"}`, formula: `${peso(hourly)} × ${pct(dayMultiplier)} × ${pct(overtimeMultiplier)} × ${overtime}`, amount: round2(hourly * dayMultiplier * overtimeMultiplier * overtime) });
  }
  if (nightOvertime) {
    lines.push({ label: `Night differential on ${nightOvertime} overtime ${nightOvertime === 1 ? "hour" : "hours"}`, formula: `${peso(hourly)} × ${pct(dayMultiplier)} × ${pct(overtimeMultiplier)} × 10% × ${nightOvertime}`, amount: round2(hourly * dayMultiplier * overtimeMultiplier * NIGHT_DIFFERENTIAL.rate * nightOvertime) });
  }
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { hourly: round2(hourly), dayMultiplier, overtimeMultiplier, lines, total, ordinaryEquivalent: round2(hourly * (regular + overtime)) };
}

/** Daily rate from a monthly salary with one of the handbook's factors (365, 313 or 261 days a year). */
export function dailyFromMonthly(monthly: number, factor: number): number {
  return factor > 0 ? round2((monthly * 12) / factor) : 0;
}

// ---------------------------------------------------------------- loans

export interface ScheduleRow {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface LoanResult {
  payment: number;
  totalInterest: number;
  totalPaid: number;
  rows: ScheduleRow[];
  /** For add-on loans: the diminishing-balance annual rate that costs the same. */
  equivalentRate?: number;
}

/** Standard amortization on the diminishing balance, monthly payments. The last payment absorbs rounding. */
export function amortize(principal: number, annualRatePercent: number, months: number): LoanResult {
  const n = Math.max(1, Math.round(months));
  const r = annualRatePercent / 100 / 12;
  const payment = round2(r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n));
  const rows: ScheduleRow[] = [];
  let balance = principal;
  for (let period = 1; period <= n; period++) {
    const interest = round2(balance * r);
    let pay = payment;
    let toPrincipal = round2(pay - interest);
    if (period === n || toPrincipal > balance) {
      toPrincipal = round2(balance);
      pay = round2(toPrincipal + interest);
    }
    balance = round2(balance - toPrincipal);
    rows.push({ period, payment: pay, interest, principal: toPrincipal, balance });
  }
  const totalPaid = round2(rows.reduce((sum, row) => sum + row.payment, 0));
  return { payment, totalInterest: round2(totalPaid - principal), totalPaid, rows };
}

/** Add-on (flat) interest: interest on the original amount for the whole term, spread evenly. */
export function addOnLoan(principal: number, annualRatePercent: number, months: number): LoanResult {
  const n = Math.max(1, Math.round(months));
  const totalInterest = round2(principal * (annualRatePercent / 100) * (n / 12));
  const payment = round2((principal + totalInterest) / n);
  const rows: ScheduleRow[] = [];
  let balance = principal;
  let paidInterest = 0;
  for (let period = 1; period <= n; period++) {
    const last = period === n;
    const interest = last ? round2(totalInterest - paidInterest) : round2(totalInterest / n);
    const toPrincipal = last ? round2(balance) : round2(principal / n);
    paidInterest = round2(paidInterest + interest);
    balance = round2(balance - toPrincipal);
    rows.push({ period, payment: round2(interest + toPrincipal), interest, principal: toPrincipal, balance });
  }
  const totalPaid = round2(rows.reduce((sum, row) => sum + row.payment, 0));
  return { payment, totalInterest: round2(totalPaid - principal), totalPaid, rows, equivalentRate: equivalentRate(principal, payment, n) };
}

/** Annual nominal rate (diminishing balance) at which `payment` for `n` months repays `principal`. Bisection. */
export function equivalentRate(principal: number, payment: number, n: number): number {
  if (payment * n <= principal) return 0;
  const presentValue = (monthly: number) => (monthly === 0 ? payment * n : (payment * (1 - (1 + monthly) ** -n)) / monthly);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > principal) low = mid;
    else high = mid;
  }
  return round2(((low + high) / 2) * 12 * 100);
}

export function scheduleCsv(rows: ScheduleRow[]): string {
  const lines = ["Month,Payment,Interest,Principal,Balance"];
  for (const row of rows) lines.push([row.period, row.payment.toFixed(2), row.interest.toFixed(2), row.principal.toFixed(2), row.balance.toFixed(2)].join(","));
  return lines.join("\r\n") + "\r\n";
}
