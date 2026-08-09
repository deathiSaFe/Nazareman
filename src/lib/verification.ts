/**
 * Phone verification boundary.
 *
 * Development mode uses a fixed, clearly-labelled stub code so the whole
 * request → verify flow can be exercised without any SMS provider. Production
 * refuses to fake verification: it throws / returns false until a real OTP
 * provider is wired in behind these two functions. The User model and the
 * auth/session layer do not need to change when that happens.
 *
 * TEST-ONLY ESCAPE HATCH: setting the environment variable `DEV_VERIFICATION=true`
 * (e.g. on a Vercel deployment) allows the same fixed stub code to be used in
 * production purely so the deployed auth flow can be exercised. It must never
 * be enabled for real users — when it is unset or not exactly `"true"`,
 * production keeps requiring a real SMS provider.
 */

const DEV_VERIFICATION_CODE = '123456';

/**
 * Whether the fixed development stub code may be used. Always true in
 * development; in production only when the TEST-ONLY override is explicitly
 * enabled (DEV_VERIFICATION exactly equal to "true").
 */
function fakeOtpAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DEV_VERIFICATION === 'true';
}

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
  /** Present only in development/test mode so the flow is testable without SMS. */
  devCode?: string;
}

/**
 * DEV stub: returns a fixed code to display.
 * PRODUCTION: replace with a real SMS OTP send. Throws until configured, unless
 * the TEST-ONLY `DEV_VERIFICATION=true` override is explicitly enabled.
 */
export async function requestPhoneVerificationCode(
  phoneNumber: string
): Promise<VerificationRequestResult> {
  if (!fakeOtpAllowed()) {
    throw new Error('Real SMS OTP provider is not configured yet.');
  }

  // The phone number is part of the verification contract; the dev stub doesn't
  // use it yet, but the production OTP provider will.
  void phoneNumber;

  return { devCode: DEV_VERIFICATION_CODE };
}

/**
 * DEV stub: accepts the fixed code.
 * PRODUCTION: replace with real OTP verification. Returns false until
 * configured, unless the TEST-ONLY `DEV_VERIFICATION=true` override is enabled.
 */
export async function verifyPhoneCode(phoneNumber: string, code: string): Promise<boolean> {
  if (!fakeOtpAllowed()) {
    return false;
  }

  // The phone number is part of the verification contract; the dev stub doesn't
  // use it yet, but the production OTP provider will.
  void phoneNumber;

  return code.trim() === DEV_VERIFICATION_CODE;
}
