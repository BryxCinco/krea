/**
 * Philippine income tax rules for self-employed individuals and professionals
 * (freelancers), used by the Freelancer Tax Calculator (tool 58).
 *
 * EVERY VALUE HERE MUST BE CHECKED AGAINST THE OFFICIAL SOURCES WHENEVER BIR
 * ANNOUNCES A CHANGE. Update LAST_UPDATED when you do. The annual graduated
 * table is the TRAIN law schedule effective January 1, 2023 (the same one the
 * withholding table in ph-contributions.ts annualizes), and the 3% percentage
 * tax is the rate in force again since July 1, 2023 after the CREATE law's
 * temporary 1%. These match the law's text as widely published; they have not
 * been checked against a BIR page from the build environment, so "verify".
 */

export const LAST_UPDATED = "2026-11-22";

export const VERIFICATION_STATUS: "verify" | "confirmed" = "verify";

export interface Source {
  agency: string;
  document: string;
  url: string;
}

export const SOURCES: Source[] = [
  { agency: "BIR", document: "RA 10963 (TRAIN), Section 24(A)(2): graduated income tax rates for individuals, schedule effective January 1, 2023", url: "https://www.bir.gov.ph" },
  { agency: "BIR", document: "RR 8-2018: 8% income tax option for self-employed individuals and professionals with gross sales or receipts up to ₱3,000,000", url: "https://www.bir.gov.ph" },
  { agency: "BIR", document: "NIRC Section 116 as amended by RA 11534 (CREATE): percentage tax back to 3% from July 1, 2023", url: "https://www.bir.gov.ph" },
  { agency: "BIR", document: "NIRC Section 34(L): Optional Standard Deduction of 40% of gross sales or receipts for individuals", url: "https://www.bir.gov.ph" },
];

/** Modelling choices the user should know about. Shown on the page. */
export const ASSUMPTIONS: string[] = [
  "Income is for one taxable year. Monthly amounts are multiplied by 12.",
  "Non-VAT registered. Above ₱3,000,000 in gross sales or receipts you must register for VAT, the 8% option is no longer allowed and 12% VAT replaces the 3% percentage tax; this calculator stops there.",
  "The 8% option is computed on gross receipts plus other non-operating income. For mixed income earners (also employed), the ₱250,000 deduction is not allowed on the business part, and the salary is taxed on the graduated table.",
  "Itemized deductions are taken as the expenses you enter, all assumed allowable and supported by receipts. The Optional Standard Deduction (40%) needs no receipts.",
  "Not included: penalties, interest, quarterly timing, local business taxes, the annual registration and documentary stamp tax, and special rules for minimum wage earners.",
];

/** One annual bracket: tax = base + rate × (taxable − over). */
export interface Bracket {
  over: number;
  base: number;
  rate: number;
}

/** RA 10963 (TRAIN), annual taxable income, effective January 1, 2023. */
export const GRADUATED_ANNUAL: Bracket[] = [
  { over: 0, base: 0, rate: 0 },
  { over: 250_000, base: 0, rate: 0.15 },
  { over: 400_000, base: 22_500, rate: 0.2 },
  { over: 800_000, base: 102_500, rate: 0.25 },
  { over: 2_000_000, base: 402_500, rate: 0.3 },
  { over: 8_000_000, base: 2_202_500, rate: 0.35 },
];

export const EIGHT_PERCENT = {
  rate: 0.08,
  /** Deducted from gross for purely self-employed individuals only. */
  exemption: 250_000,
  /** Gross sales or receipts above this require VAT registration and rule out the 8% option. */
  vatThreshold: 3_000_000,
};

/** Optional Standard Deduction: 40% of gross sales or receipts. */
export const OSD_RATE = 0.4;

/** Percentage tax for non-VAT taxpayers who do not choose 8% (NIRC Section 116). */
export const PERCENTAGE_TAX_RATE = 0.03;
