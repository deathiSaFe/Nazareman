import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession, publicUser, setSessionCookie } from '@/lib/auth';
import { isValidPhoneNumber, normalizePhoneNumber, verifyPhoneCode } from '@/lib/verification';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OTP_IP_WINDOW_MS = 15 * 60 * 1000;
const OTP_IP_LIMIT = 20;
const OTP_PHONE_WINDOW_MS = 15 * 60 * 1000;
const OTP_PHONE_LIMIT = 10;

export async function POST(request: NextRequest) {
  // Abuse guard: cap verification attempts before any work happens, both per
  // IP and per phone number.
  if (
    isRateLimited(request, 'auth-verify-ip', { limit: OTP_IP_LIMIT, windowMs: OTP_IP_WINDOW_MS })
  ) {
    return rateLimitResponse();
  }

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

  if (
    isRateLimited(request, `auth-verify-phone:${phoneNumber}`, {
      limit: OTP_PHONE_LIMIT,
      windowMs: OTP_PHONE_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

  try {
    const valid = await verifyPhoneCode(phoneNumber, code);

    if (!valid) {
      return NextResponse.json({ error: 'کد تأیید صحیح نیست.' }, { status: 400 });
    }

    // One-time admin bootstrap: the phone number listed in ADMIN_PHONE is
    // promoted to UserRole.ADMIN when it verifies. This is a bootstrap only —
    // after the first admin exists, admin operations use the session role, and
    // ADMIN_PHONE can be removed from the environment.
    const bootstrapAdminPhone = process.env.ADMIN_PHONE
      ? normalizePhoneNumber(process.env.ADMIN_PHONE)
      : '';
    const promoteToAdmin = Boolean(bootstrapAdminPhone && bootstrapAdminPhone === phoneNumber);

    // Create the user on first successful verification, or flip an existing
    // account's phone to verified. Development stub marks the phone verified;
    // a real OTP provider does the same after a real confirmation.
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber },
      select: { id: true },
    });
    const isNewUser = !existingUser;

    const user = await prisma.user.upsert({
      where: { phoneNumber },
      update: { phoneVerified: true, ...(promoteToAdmin ? { role: 'ADMIN' } : {}) },
      create: {
        phoneNumber,
        phoneVerified: true,
        ...(promoteToAdmin ? { role: 'ADMIN' } : {}),
      },
    });

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({ success: true, user: publicUser(user), isNewUser });
  } catch {
    return NextResponse.json({ error: 'ورود ممکن نشد.' }, { status: 500 });
  }
}
