/**
 * Tool 54: Loan & Amortization Calculator. Monthly payment, total interest, total paid and
 * the full schedule for a diminishing-balance or add-on (flat) loan, with CSV export.
 * The math is shared with the Loan tab of PH Pay Calculators (tool 33) in ph-pay.ts, so
 * both give the same numbers. UI: components/stage/editors/loan-editor.tsx. Nothing is saved.
 */
import { editorTool } from "./editor-tool";
import { addOnLoan, amortize, type LoanResult } from "./ph-pay";

export const loan = editorTool({
  id: 54,
  slug: "loan-amortization-calculator",
  name: "Loan & Amortization Calculator",
  verb: "Compute loan",
  description: "Monthly payment, total interest and a full amortization schedule for diminishing-balance or add-on loans, with CSV export.",
  seoTitle: "Loan Amortization Calculator: monthly payment, interest and schedule",
  seoDescription:
    "Compute the monthly amortization, total interest and total payment of a loan with diminishing balance or add-on (flat) interest, see the month-by-month schedule and download it as CSV. Free, in your browser, nothing saved.",
  howTo: [
    "Enter the loan amount, the yearly interest rate and the term in months or years.",
    "Pick how the lender charges interest: diminishing balance or add-on (flat).",
    "Read the monthly payment and the schedule, then download the CSV. Compare it with the lender's disclosure statement.",
  ],
  faqs: [
    { q: "What is the difference between diminishing balance and add-on interest?", a: "With diminishing balance, interest is charged only on what you still owe, so the interest part of each payment gets smaller. With add-on (flat) interest, it is charged on the original amount for the whole term, so the same stated rate costs much more. Krea shows the equivalent diminishing rate of an add-on loan so you can compare offers fairly." },
    { q: "My lender quotes a monthly rate. What do I enter?", a: "Multiply it by 12. A 1.5% monthly rate is 18% a year, and a 2% monthly add-on rate is 24% a year." },
    { q: "Why is my lender's amount different?", a: "Lenders may add processing fees, insurance, documentary stamp tax or other charges, deduct them from the loan proceeds, round differently or count days instead of months. Krea computes the interest only. Your disclosure statement has the official amounts." },
    { q: "Can I open the schedule in Excel or Google Sheets?", a: "Yes. Download CSV saves every month's payment, interest, principal and remaining balance as a file that any spreadsheet app opens." },
    { q: "Is my loan information saved or uploaded?", a: "No. The computation runs in your browser and nothing is stored. Closing the tab clears it." },
  ],
  icon: "loan",
});

export const MAX_LOAN_MONTHS = 600;
export const MAX_LOAN_RATE = 200;

export type LoanMethod = "diminishing" | "addon";
export type TermUnit = "months" | "years";

export interface LoanInput {
  principal: number;
  /** Yearly nominal rate in percent. */
  rate: number;
  term: number;
  unit: TermUnit;
  method: LoanMethod;
}

export interface LoanSummary extends LoanResult {
  months: number;
  /** The same loan with the other interest method, for comparison. */
  other: LoanResult;
}

/** Term in whole months, or null when the term does not come out to whole months. */
export function termMonths(term: number, unit: TermUnit): number | null {
  const months = unit === "years" ? term * 12 : term;
  const whole = Math.round(months);
  return Number.isFinite(months) && Math.abs(months - whole) < 1e-9 ? whole : null;
}

/** Returns the result, or a plain-language problem with the input. */
export function computeLoan(input: LoanInput): LoanSummary | { problem: string } {
  if (!Number.isFinite(input.principal) || input.principal <= 0) return { problem: "Ilagay ang halaga ng utang (more than ₱0)." };
  if (input.principal > 1e12) return { problem: "That loan amount is too large to compute. Check the number." };
  if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > MAX_LOAN_RATE) return { problem: `Enter a yearly interest rate from 0 to ${MAX_LOAN_RATE}%.` };
  const months = termMonths(input.term, input.unit);
  if (months === null) return { problem: input.unit === "years" ? "The term in years must come out to whole months, like 1.5 years (18 months)." : "Enter the term as a whole number of months." };
  if (months < 1 || months > MAX_LOAN_MONTHS) return { problem: `Enter a term from 1 to ${MAX_LOAN_MONTHS} months (${MAX_LOAN_MONTHS / 12} years).` };
  const diminishing = amortize(input.principal, input.rate, months);
  const addOn = addOnLoan(input.principal, input.rate, months);
  return input.method === "diminishing" ? { ...diminishing, months, other: addOn } : { ...addOn, months, other: diminishing };
}
