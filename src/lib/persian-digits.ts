/**
 * Persian numeral formatting for the UI.
 *
 * Database values stay as plain numbers; only the presentation layer converts
 * them (e.g. 4.5 -> ۴.۵). A single reusable helper keeps every visible rating
 * and count consistent.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Convert Latin digits in a number/string to Persian digits (0-9 → ۰-۹). */
export function toPersianDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/**
 * Format a decimal number for Persian display using the normal `.` decimal
 * separator: 3.4 -> ۳.۴, 4.666 -> ۴.۷. Integer values never show a trailing
 * `.0`: 3.0 -> ۳, 5 -> ۵.
 *
 * The separator is intentionally the plain ASCII period (U+002E) — some fonts
 * render the Arabic decimal separator (٫) like a slash, which reads as a
 * fraction (۳/۴) instead of a decimal.
 */
export function toPersianDecimal(value: number, fractionDigits = 1): string {
  const rounded = value.toFixed(fractionDigits).replace(/\.0+$/, '');
  return toPersianDigits(rounded);
}
