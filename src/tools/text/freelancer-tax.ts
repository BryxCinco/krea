/**
 * Tool 58: Freelancer Tax Calculator (Philippines). Compares the three ways a
 * self-employed individual or professional can be taxed: 8% on gross, or the
 * graduated rates with the 40% Optional Standard Deduction or with itemized
 * expenses (plus 3% percentage tax for both). Handles mixed income earners and
 * subtracts taxes already withheld (BIR Form 2307 and the employer's 2316).
 * Rates: src/config/ph-income-tax.ts. UI: components/stage/editors/freelancer-tax-editor.tsx.
 */
import { EIGHT_PERCENT, GRADUATED_ANNUAL, OSD_RATE, PERCENTAGE_TAX_RATE } from "@/config/ph-income-tax";
import { editorTool } from "./editor-tool";

export const freelancerTax = editorTool({
  id: 58,
  slug: "freelancer-tax-calculator",
  name: "Freelancer Tax Calculator",
  verb: "Compute tax",
  description: "8% or graduated? Compare your BIR income tax options as a freelancer or professional, with percentage tax and 2307 credits.",
  seoTitle: "Freelancer Tax Calculator Philippines: 8% vs graduated, OSD or itemized",
  seoDescription:
    "Compute your income tax as a Filipino freelancer, self-employed professional or mixed income earner. Compare the 8% option with graduated rates using the 40% OSD or itemized expenses, add percentage tax and subtract 2307 credits. Free, private, in your browser.",
  howTo: [
    "Choose whether you are purely self-employed or also employed (mixed income).",
    "Enter your gross receipts for the year or per month, your business expenses and any taxes clients already withheld (Form 2307).",
    "Compare the three options side by side. The cheapest one is marked; elect it on your first quarterly return or registration.",
  ],
  faqs: [
    { q: "What is the 8% option?", a: "Instead of the graduated rates and the 3% percentage tax, you pay a flat 8% on gross receipts above ₱250,000. It is allowed only if your gross is ₱3,000,000 or less and you are not VAT-registered. You choose it on your first quarterly income tax return of the year or on registration; otherwise the graduated rates apply." },
    { q: "OSD or itemized deductions?", a: "The Optional Standard Deduction lets you deduct 40% of gross receipts without receipts. Itemized deductions use your actual expenses, which must be supported by official receipts and invoices. Itemized only wins when your real expenses are over 40% of your gross." },
    { q: "I am employed and also freelance. Is that different?", a: "Yes. As a mixed income earner, your salary is always taxed on the graduated table. If you choose 8% for your freelance income, there is no ₱250,000 deduction on it. Choose Mixed income and enter your taxable compensation." },
    { q: "What do I put under creditable withholding tax?", a: "The total tax your clients already withheld from your fees, shown on the BIR Form 2307 they give you (often 5% or 10%). It is subtracted from your income tax due, so you only pay the rest." },
    { q: "Is this official tax advice?", a: "No. It is an estimate under the rules listed on the page, for planning. Confirm with the BIR, your RDO or an accountant before filing. Nothing you enter is saved or uploaded." },
  ],
  icon: "tax",
});

export type IncomeKind = "pure" | "mixed";
export type Period = "year" | "month";

export interface TaxInput {
  kind: IncomeKind;
  period: Period;
  /** Gross sales or receipts from the business or profession. */
  gross: number;
  /** Other non-operating income (interest not subject to final tax, etc.), included in the 8% base. */
  otherIncome: number;
  /** Actual deductible expenses, for itemized deductions. */
  expenses: number;
  /** Taxable compensation after SSS, PhilHealth, Pag-IBIG and tax-free 13th month (mixed only). */
  compensation: number;
  /** Tax withheld by the employer on that compensation (BIR 2316). */
  compensationWithheld: number;
  /** Creditable withholding tax withheld by clients (BIR 2307). */
  creditable: number;
}

export type OptionId = "eight" | "osd" | "itemized";

export interface TaxOption {
  id: OptionId;
  label: string;
  /** False when the law does not allow it for these numbers, with `reason`. */
  allowed: boolean;
  reason?: string;
  taxableIncome: number;
  incomeTax: number;
  percentageTax: number;
  total: number;
  /** Still to pay after credits; negative means overpaid (refund or carry over). */
  payable: number;
  /** Total tax as a share of gross receipts plus compensation. */
  effectiveRate: number;
}

export interface TaxSummary {
  options: TaxOption[];
  best: OptionId | null;
  /** Annual amounts actually used. */
  annual: { gross: number; otherIncome: number; expenses: number; compensation: number; compensationWithheld: number; creditable: number };
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const clean = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** Income tax on annual taxable income under the graduated rates. */
export function graduatedTax(taxable: number): number {
  if (taxable <= 0) return 0;
  let bracket = GRADUATED_ANNUAL[0];
  for (const entry of GRADUATED_ANNUAL) if (taxable > entry.over) bracket = entry;
  return round(bracket.base + bracket.rate * (taxable - bracket.over));
}

export function computeFreelancerTax(input: TaxInput): TaxSummary | { problem: string } {
  const factor = input.period === "month" ? 12 : 1;
  const mixed = input.kind === "mixed";
  const annual = {
    gross: clean(input.gross) * factor,
    otherIncome: clean(input.otherIncome) * factor,
    expenses: clean(input.expenses) * factor,
    compensation: mixed ? clean(input.compensation) * factor : 0,
    compensationWithheld: mixed ? clean(input.compensationWithheld) * factor : 0,
    // 2307 credits add up from the quarters; per month they are multiplied like the rest.
    creditable: clean(input.creditable) * factor,
  };
  if (annual.gross <= 0) return { problem: "Ilagay ang gross receipts mo (more than ₱0)." };
  if (annual.gross > 1e11) return { problem: "That amount is too large to compute. Check the number." };
  if (annual.gross > EIGHT_PERCENT.vatThreshold) {
    return { problem: "Lampas ₱3,000,000 ang gross mo: you must register for VAT, the 8% option is not allowed and 12% VAT replaces percentage tax. Ask an accountant; this calculator covers non-VAT freelancers only." };
  }

  const compTax = graduatedTax(annual.compensation);
  const base = annual.gross + annual.compensation;
  const make = (id: OptionId, label: string, taxableIncome: number, incomeTax: number, percentageTax: number, allowed = true, reason?: string): TaxOption => {
    const total = round(incomeTax + percentageTax);
    return {
      id,
      label,
      allowed,
      reason,
      taxableIncome: round(Math.max(0, taxableIncome)),
      incomeTax,
      percentageTax,
      total,
      payable: round(total - annual.creditable - annual.compensationWithheld),
      effectiveRate: base > 0 ? total / base : 0,
    };
  };

  // 8%: on gross plus other income, less ₱250,000 when purely self-employed. Salary stays graduated.
  const eightBase = annual.gross + annual.otherIncome - (mixed ? 0 : EIGHT_PERCENT.exemption);
  const eightTax = round(Math.max(0, eightBase) * EIGHT_PERCENT.rate);
  const eight = make("eight", "8% on gross", Math.max(0, eightBase) + annual.compensation, round(eightTax + compTax), 0);

  // Graduated: business net income is added to the taxable compensation.
  const percentageTax = round(annual.gross * PERCENTAGE_TAX_RATE);
  const osdNet = annual.gross * (1 - OSD_RATE) + annual.otherIncome;
  const osd = make("osd", "Graduated + 40% OSD", osdNet + annual.compensation, graduatedTax(osdNet + annual.compensation), percentageTax);
  const itemizedNet = Math.max(0, annual.gross - annual.expenses) + annual.otherIncome;
  const noExpenses = annual.expenses <= 0;
  const itemized = make(
    "itemized",
    "Graduated + itemized",
    itemizedNet + annual.compensation,
    graduatedTax(itemizedNet + annual.compensation),
    percentageTax,
    !noExpenses,
    noExpenses ? "Enter your expenses to compare itemized deductions." : undefined,
  );

  const options = [eight, osd, itemized];
  const candidates = options.filter((option) => option.allowed);
  const best = candidates.length ? candidates.reduce((low, option) => (option.total < low.total ? option : low)).id : null;
  return { options, best, annual };
}
