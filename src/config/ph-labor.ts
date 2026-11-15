/**
 * Philippine labor-standard multipliers used by the PH Pay Calculators (tool 33).
 *
 * VERIFY BEFORE RELYING ON THESE. They were copied from the DOLE Bureau of Working Conditions
 * "Handbook on Workers' Statutory Monetary Benefits", 2023 edition (sections on Holiday Pay,
 * Premium Pay, Overtime Pay, Night Shift Differential and Thirteenth-Month Pay, and the
 * "Guide Computations" table on pp. 24-25). The copy read was a PDF mirror of the handbook,
 * not a page on dole.gov.ph, and a newer edition may exist. Check each value against the
 * current handbook or advisories from DOLE, then set VERIFICATION_STATUS to "confirmed".
 */

export const LAST_UPDATED = "2026-11-15";
export const VERIFICATION_STATUS: "verify" | "confirmed" = "verify";

export const SOURCES = [
  "DOLE-BWC, Handbook on Workers' Statutory Monetary Benefits, 2023 edition (Holiday Pay, Premium Pay, Overtime Pay, Night Shift Differential, Thirteenth-Month Pay)",
  "Labor Code of the Philippines, Articles 86 (night shift differential), 87 (overtime), 93 (premium pay) and 94 (holiday pay)",
  "Presidential Decree No. 851 and its Revised Guidelines (13th month pay)",
  "DOLE Labor Advisory No. 21, Series of 2026 (13th month pay guidelines for 2026), as reported in the news: full text not read",
];

/** Day types and their pay as a multiple of the basic daily wage, for the first 8 hours worked. */
export const DAY_TYPES = [
  { id: "ordinary", label: "Ordinary working day", multiplier: 1.0 },
  { id: "rest", label: "Rest day", multiplier: 1.3 },
  { id: "special", label: "Special (non-working) day", multiplier: 1.3 },
  { id: "special-rest", label: "Special day that is also your rest day", multiplier: 1.5 },
  { id: "double-special", label: "Double special day", multiplier: 1.5 },
  { id: "double-special-rest", label: "Double special day on your rest day", multiplier: 1.95 },
  { id: "regular", label: "Regular holiday", multiplier: 2.0 },
  { id: "regular-rest", label: "Regular holiday that is also your rest day", multiplier: 2.6 },
  { id: "double", label: "Double holiday (two regular holidays)", multiplier: 3.0 },
  { id: "double-rest", label: "Double holiday on your rest day", multiplier: 3.9 },
] as const;

export type DayType = (typeof DAY_TYPES)[number]["id"];

/** Overtime (past 8 hours): +25% of the hourly rate on ordinary days, +30% of that day's hourly rate otherwise. */
export const OVERTIME = { ordinary: 1.25, other: 1.3 } as const;

/** Night shift differential: +10% of the hourly rate for that day, for work between 10 p.m. and 6 a.m. */
export const NIGHT_DIFFERENTIAL = { rate: 0.1, from: "10:00 p.m.", to: "6:00 a.m." } as const;

/** Normal hours in a work day; the hourly rate is the daily rate divided by this. */
export const HOURS_PER_DAY = 8;

/**
 * Days per year used to turn a monthly salary into a daily rate (the handbook's EEMR factors):
 * daily rate = monthly salary x 12 / factor.
 */
export const DAILY_RATE_FACTORS = [
  { id: "365", label: "Paid every day of the month (monthly-paid): 365", factor: 365 },
  { id: "313", label: "6-day work week: 313", factor: 313 },
  { id: "261", label: "5-day work week: 261", factor: 261 },
] as const;

/** 13th month pay: at least one-twelfth of the total basic salary earned in the calendar year. */
export const THIRTEENTH_MONTH = {
  divisor: 12,
  /** Not part of basic salary unless the company treats them as such by contract, agreement or practice. */
  excluded: ["Overtime pay", "Premium pay (rest days, special days)", "Night shift differential", "Holiday pay", "Cost of living allowance (COLA)", "Other allowances", "Cash value of unused leave"],
  deadline: "December 24",
} as const;

/** Things the calculators assume. Each is shown on the page. */
export const ASSUMPTIONS = [
  "Hourly rate = daily rate ÷ 8.",
  "Overtime means work beyond 8 hours on the same day; the first 8 hours use the day's rate.",
  "Night differential is 10% of the hourly rate for that kind of day, for hours from 10 p.m. to 6 a.m. Night hours that are also overtime get both.",
  "Not covered by these rules: government employees, managerial staff, field personnel, and some small retail and service businesses (holiday pay: fewer than 10 workers; night differential: 5 or fewer). Kasambahay have separate rules.",
  "Unworked regular holiday: 100% of the daily wage if you were present, or on paid leave, the work day before. Unworked special day: no pay, unless company policy or a CBA says otherwise.",
  "A company policy, contract or CBA may give more than these minimums.",
];
