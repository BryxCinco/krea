/**
 * Philippine payroll rates used by the PH Take-Home Pay Calculator.
 *
 * EVERY VALUE HERE MUST BE CHECKED AGAINST THE OFFICIAL SOURCES BEFORE LAUNCH
 * AND WHENEVER AN AGENCY ANNOUNCES A CHANGE. Update LAST_UPDATED when you do.
 *
 * How these were gathered (2026-11-14): no primary agency page could be read
 * from the build environment. The figures below match the published schedules
 * as widely reported for 2026 by several independent payroll guides, and they
 * are consistent with each other. They are therefore marked "verify" rather
 * than "confirmed". See ASSUMPTIONS for the modelling choices.
 */

export const LAST_UPDATED = "2026-11-14";

/** Shown on the page. "verify" = matches secondary sources, not yet checked against the agency's own circular. */
export const VERIFICATION_STATUS: "verify" | "confirmed" = "verify";

export interface Source {
  agency: string;
  document: string;
  url: string;
}

export const SOURCES: Source[] = [
  { agency: "SSS", document: "Schedule of Social Security Contributions effective January 2025 (15% rate, MSC ₱5,000 to ₱35,000)", url: "https://www.sss.gov.ph" },
  { agency: "PhilHealth", document: "Premium contribution under the Universal Health Care Act (RA 11223): 5% from 2024, floor ₱10,000, ceiling ₱100,000", url: "https://www.philhealth.gov.ph" },
  { agency: "Pag-IBIG Fund", document: "HDMF Circular raising the maximum monthly compensation to ₱10,000 (effective February 2024)", url: "https://www.pagibigfund.gov.ph" },
  { agency: "BIR", document: "Revenue Regulations No. 11-2018, Annex E: withholding tax table effective January 1, 2023 onwards", url: "https://www.bir.gov.ph" },
];

/** Modelling choices the user should know about. Shown on the page. */
export const ASSUMPTIONS: string[] = [
  "SSS, PhilHealth and Pag-IBIG are computed on the basic monthly salary only. Some employers include regular allowances; check your payslip.",
  "On semi-monthly pay, each monthly contribution is split evenly across both cutoffs. Many employers deduct a contribution in full on one cutoff instead, which changes each payslip but not the monthly total.",
  "Withholding tax uses the BIR withholding table for the pay period on taxable pay after employee contributions. It is an estimate: year-end annualization can make your actual tax slightly different.",
  "Not included: 13th month pay and other benefits (tax-free up to ₱90,000 a year), overtime, night differential, holiday pay, loans, MP2 and voluntary contributions, and minimum wage earner exemptions.",
];

/** SSS: Monthly Salary Credit (MSC) brackets and the employee's share. */
export const SSS = {
  /** Total contribution rate: 15% (employer 10%, employee 5%), including the WISP / MPF portion above ₱20,000. */
  employeeRate: 0.05,
  employerRate: 0.1,
  minMsc: 5_000,
  maxMsc: 35_000,
  /** MSC steps of ₱500. Compensation in [MSC - 250, MSC + 249.99] maps to that MSC. */
  mscStep: 500,
  /** Employees' Compensation (EC), paid by the employer only: ₱10 below MSC ₱15,000, ₱30 from ₱15,000. */
  ecLow: 10,
  ecHigh: 30,
  ecThreshold: 15_000,
};

/** PhilHealth: 5% premium, shared equally. */
export const PHILHEALTH = {
  rate: 0.05,
  employeeShare: 0.5,
  floor: 10_000,
  ceiling: 100_000,
};

/** Pag-IBIG (HDMF). */
export const PAGIBIG = {
  /** Employee rate is 1% when monthly compensation is ₱1,500 or less, otherwise 2%. */
  lowIncomeThreshold: 1_500,
  employeeRateLow: 0.01,
  employeeRate: 0.02,
  employerRate: 0.02,
  /** Contributions are computed on at most ₱10,000 a month (so ₱200 maximum each). */
  maxCompensation: 10_000,
};

/** One withholding tax bracket: tax = base + rate * (taxable - over). */
export interface TaxBracket {
  over: number;
  base: number;
  rate: number;
}

/** BIR RR 11-2018 Annex E, effective January 1, 2023. Taxable compensation per pay period. */
export const WITHHOLDING: Record<"monthly" | "semiMonthly", TaxBracket[]> = {
  monthly: [
    { over: 0, base: 0, rate: 0 },
    { over: 20_833, base: 0, rate: 0.15 },
    { over: 33_333, base: 1_875, rate: 0.2 },
    { over: 66_667, base: 8_541.8, rate: 0.25 },
    { over: 166_667, base: 33_541.8, rate: 0.3 },
    { over: 666_667, base: 183_541.8, rate: 0.35 },
  ],
  semiMonthly: [
    { over: 0, base: 0, rate: 0 },
    { over: 10_417, base: 0, rate: 0.15 },
    { over: 16_667, base: 937.5, rate: 0.2 },
    { over: 33_333, base: 4_270.7, rate: 0.25 },
    { over: 83_333, base: 16_770.7, rate: 0.3 },
    { over: 333_333, base: 91_770.7, rate: 0.35 },
  ],
};
