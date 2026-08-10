import { NextRequest, NextResponse } from 'next/server';
import { isValidPhoneNumber, normalizePhoneNumber, requestPhoneVerificationCode } from '@/lib/verification';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUEST_IP_WINDOW_MS = 15 * 60 * 1000;
const REQUEST_IP_LIMIT = 10;
const REQUEST_PHONE_WINDOW_MS = 15 * 60 * 1000;
const REQUEST_PHONE_LIMIT = 5;

export async function POST(request: NextRequest) {
  // Abuse guard: cap OTP send requests per IP before any work happens.
  if (
    isRateLimited(request, 'auth-request-ip', { limit: REQUEST_IP_LIMIT, windowMs: REQUEST_IP_WINDOW_MS })
  ) {
    return rateLimitResponse();
  }

  const body = await request.json().catch(() => null);

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const rawPhone =
    typeof (body as Record<string, unknown>).phoneNumber === 'string'
      ? ((body as Record<string, unknown>).phoneNumber as string)
      : '';

  if (!rawPhone || !isValidPhoneNumber(rawPhone)) {
    return NextResponse.json({ error: 'شماره موبایل معتبر نیست.' }, { status: 400 });
  }

  const phoneNumber = normalizePhoneNumber(rawPhone);

  if (
    isRateLimited(request, `auth-request-phone:${phoneNumber}`, {
      limit: REQUEST_PHONE_LIMIT,
      windowMs: REQUEST_PHONE_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

  try {
    const result = await requestPhoneVerificationCode(phoneNumber);

    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json(
      { error: 'ارسال کد تأیید ممکن نشد.' },
      { status: 500 }
    );
  }
}
