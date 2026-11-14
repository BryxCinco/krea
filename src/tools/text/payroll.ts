/** Tool 25: PH Take-Home Pay Calculator. Rates live in src/config/ph-contributions.ts. */
import { PAGIBIG, PHILHEALTH, SSS, WITHHOLDING, type TaxBracket } from "@/config/ph-contributions";
import { editorTool } from "./editor-tool";

export const payroll = editorTool({
  id: 25,
  slug: "ph-take-home-pay-calculator",
  name: "PH Take-Home Pay Calculator",
  verb: "Compute Pay",
  description: "Gross to net pay with SSS, PhilHealth, Pag-IBIG and withholding tax, monthly or semi-monthly, with a full breakdown.",
  seoTitle: "PH Take-Home Pay Calculator: SSS, PhilHealth, Pag-IBIG and tax",
  seoDescription:
    "Compute your Philippine take-home pay from your gross salary. Shows SSS, PhilHealth, Pag-IBIG and BIR withholding tax per cutoff. Runs in your browser; nothing is sent anywhere.",
  howTo: [
    "Type your basic monthly salary and any allowances.",
    "Choose monthly or semi-monthly pay.",
    "Read the breakdown. Check the rates note: verify against SSS, PhilHealth, Pag-IBIG and BIR before relying on the result.",
  ],
  faqs: [
    { q: "Is my salary sent anywhere?", a: "No. The calculation runs in your browser and nothing is saved or sent." },
    {
      q: "Which rates does the calculator use?",
      a: "SSS 5% employee share of the monthly salary credit (₱5,000 to ₱35,000), PhilHealth 2.5% employee share of salary between ₱10,000 and ₱100,000, Pag-IBIG 2% up to ₱200, and the BIR withholding table under RR 11-2018. The page shows the last-updated date and sources.",
    },
    {
      q: "Why is my payslip slightly different?",
      a: "Employers differ in which pay items count for contributions and in which cutoff they deduct them, and tax is adjusted at year end. Use this as an estimate and check with your HR or payroll.",
    },
    { q: "Are 13th month pay and overtime included?", a: "No. The calculator covers regular pay only. 13th month pay and other benefits are tax-free up to ₱90,000 a year." },
  ],
  icon: "payroll",
});

export type PayFrequency = "monthly" | "semiMonthly";

export interface PayInput {
  /** Basic monthly salary. */
  basic: number;
  /** Taxable allowances per month (e.g. regular transport or meal allowance treated as taxable). */
  taxableAllowances: number;
  /** Non-taxable allowances per month (de minimis benefits). */
  nonTaxableAllowances: number;
  frequency: PayFrequency;
}

export interface Share {
  employee: number;
  employer: number;
}

export interface PayResult {
  /** Monthly figures. */
  monthly: {
    gross: number;
    sss: Share & { msc: number; ec: number };
    philhealth: Share & { base: number };
    pagibig: Share & { base: number };
    contributions: number;
    taxable: number;
    tax: number;
    net: number;
  };
  /** Per pay period (equal to monthly for monthly pay). */
  period: {
    count: 1 | 2;
    gross: number;
    contributions: number;
    taxable: number;
    tax: number;
    net: number;
    bracket: TaxBracket;
  };
}

/** Round to centavos, half up. The tiny offset stops binary floating point (156.825 is stored as 156.8249999...) from rounding down. */
const round = (value: number) => Math.round(value * 100 + 1e-7) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function sssMsc(compensation: number): number {
  const msc = Math.floor((compensation + SSS.mscStep / 2) / SSS.mscStep) * SSS.mscStep;
  return clamp(msc, SSS.minMsc, SSS.maxMsc);
}

export function withholding(taxable: number, table: TaxBracket[]): { tax: number; bracket: TaxBracket } {
  let bracket = table[0];
  for (const entry of table) if (taxable > entry.over) bracket = entry;
  return { tax: round(Math.max(0, bracket.base + bracket.rate * (taxable - bracket.over))), bracket };
}

export function computePay(input: PayInput): PayResult {
  const basic = Math.max(0, input.basic || 0);
  const taxableAllowances = Math.max(0, input.taxableAllowances || 0);
  const nonTaxable = Math.max(0, input.nonTaxableAllowances || 0);

  // Contributions (monthly), on basic salary (see ASSUMPTIONS).
  const msc = sssMsc(basic);
  const sss = {
    msc,
    employee: round(msc * SSS.employeeRate),
    employer: round(msc * SSS.employerRate),
    ec: msc < SSS.ecThreshold ? SSS.ecLow : SSS.ecHigh,
  };
  const phBase = clamp(basic, PHILHEALTH.floor, PHILHEALTH.ceiling);
  const phTotal = round(phBase * PHILHEALTH.rate);
  const philhealth = { base: phBase, employee: round(phTotal * PHILHEALTH.employeeShare), employer: round(phTotal * (1 - PHILHEALTH.employeeShare)) };
  const piBase = Math.min(basic, PAGIBIG.maxCompensation);
  const pagibig = {
    base: piBase,
    employee: round(piBase * (basic <= PAGIBIG.lowIncomeThreshold ? PAGIBIG.employeeRateLow : PAGIBIG.employeeRate)),
    employer: round(piBase * PAGIBIG.employerRate),
  };
  const contributions = round(sss.employee + philhealth.employee + pagibig.employee);

  const gross = round(basic + taxableAllowances + nonTaxable);
  const count = input.frequency === "semiMonthly" ? 2 : 1;
  const table = input.frequency === "semiMonthly" ? WITHHOLDING.semiMonthly : WITHHOLDING.monthly;

  // Per period: income and contributions split evenly; tax from the period table.
  const periodTaxable = Math.max(0, round((basic + taxableAllowances) / count - contributions / count));
  const { tax: periodTax, bracket } = withholding(periodTaxable, table);
  const periodGross = round(gross / count);
  const periodContributions = round(contributions / count);
  const periodNet = round(periodGross - periodContributions - periodTax);

  const monthlyTax = round(periodTax * count);
  return {
    monthly: {
      gross,
      sss,
      philhealth,
      pagibig,
      contributions,
      taxable: round(periodTaxable * count),
      tax: monthlyTax,
      net: round(gross - contributions - monthlyTax),
    },
    period: { count, gross: periodGross, contributions: periodContributions, taxable: periodTaxable, tax: periodTax, net: periodNet, bracket },
  };
}
