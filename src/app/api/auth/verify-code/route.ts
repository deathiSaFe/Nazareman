import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession, publicUser, setSessionCookie } from '@/lib/auth';
import { isValidPhoneNumber, normalizePhoneNumber, verifyPhoneCode } from '@/lib/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const rawPhone = typeof data.phoneNumber === 'string' ? data.phoneNumber : '';
  const code = typeof data.code === 'string' ? data.code : '';

  if (!rawPhone || !isValidPhoneNumber(rawPhone)) {
    return NextResponse.json({ error: 'شماره موبایل معتبر نیست.' }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'کد تأیید را وارد کنید.' }, { status: 400 });
  }

  const phoneNumber = normalizePhoneNumber(rawPhone);

  try {
    const valid = await verifyPhoneCode(phoneNumber, code);

    if (!valid) {
      return NextResponse.json({ error: 'کد تأیید صحیح نیست.' }, { status: 400 });
    }

    // Create the user on first successful verification, or flip an existing
    // account's phone to verified. Development stub marks the phone verified;
    // a real OTP provider does the same after a real confirmation.
    const user = await prisma.user.upsert({
      where: { phoneNumber },
      update: { phoneVerified: true },
      create: { phoneNumber, phoneVerified: true },
    });

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch {
    return NextResponse.json({ error: 'ورود ممکن نشد.' }, { status: 500 });
  }
}
