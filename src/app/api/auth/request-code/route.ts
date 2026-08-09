import { NextRequest, NextResponse } from 'next/server';
import { isValidPhoneNumber, normalizePhoneNumber, requestPhoneVerificationCode } from '@/lib/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
