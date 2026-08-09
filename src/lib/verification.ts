/**
 * Phone verification boundary.
 *
 * Development mode uses a fixed, clearly-labelled stub code so the whole
 * request → verify flow can be exercised without any SMS provider. Production
 * refuses to fake verification: it throws / returns false until a real OTP
 * provider is wired in behind these two functions. The User model and the
 * auth/session layer do not need to change when that happens.
 */

const DEV_VERIFICATION_CODE = '123456';

/** Digits only; drops a leading 00 country-code prefix. */
export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    return digits.slice(2);
  }

  return digits;
}

/** Basic sanity check — 10..15 digits (covers 09…, +98…, E.164 forms). */
export function isValidPhoneNumber(value: string): boolean {
  const digits = normalizePhoneNumber(value);
  return /^\d{10,15}$/.test(digits);
}

export interface VerificationRequestResult {
  /** Present only in development so the flow is testable without SMS. */
  devCode?: string;
}

/**
 * DEV stub: returns a fixed code to display.
 * PRODUCTION: replace with a real SMS OTP send. Throws until configured.
 */
export async function requestPhoneVerificationCode(
  phoneNumber: string
): Promise<VerificationRequestResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Real SMS OTP provider is not configured yet.');
  }

  // The phone number is part of the verification contract; the dev stub doesn't
  // use it yet, but the production OTP provider will.
  void phoneNumber;

  return { devCode: DEV_VERIFICATION_CODE };
}

/**
 * DEV stub: accepts the fixed code.
 * PRODUCTION: replace with real OTP verification.
 */
export async function verifyPhoneCode(phoneNumber: string, code: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // The phone number is part of the verification contract; the dev stub doesn't
  // use it yet, but the production OTP provider will.
  void phoneNumber;

  return code.trim() === DEV_VERIFICATION_CODE;
}
