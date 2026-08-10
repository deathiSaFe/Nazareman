import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireUser } from '@/lib/authorization';
import { publicUser } from '@/lib/auth';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DISPLAY_NAME_LENGTH = 40;
const PROFILE_WINDOW_MS = 10 * 60 * 1000;
const PROFILE_LIMIT = 30;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * PATCH /api/profile
 * The authenticated user may edit only their display name and avatar URL.
 * All other fields (id, phoneNumber, role, verification, ownership...) are
 * ignored — identity always comes from the server session.
 */
export async function PATCH(request: NextRequest) {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }

  if (
    isRateLimited(request, `profile:${user.id}`, {
      limit: PROFILE_LIMIT,
      windowMs: PROFILE_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const data = body as Record<string, unknown>;
  const has = (key: string): boolean => data[key] !== undefined;

  const displayName = has('displayName')
    ? typeof data.displayName === 'string'
      ? data.displayName.trim()
      : null
    : undefined;
  const avatarUrl = has('avatarUrl')
    ? typeof data.avatarUrl === 'string'
      ? data.avatarUrl.trim()
      : null
    : undefined;

  const errors: string[] = [];

  if (displayName !== undefined && displayName !== null && displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    errors.push(`displayName must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
  }

  // An empty string means "clear the avatar" — it must not be validated as a
  // URL. The profile form always sends avatarUrl (often ''), so rejecting ''
  // made every name-only profile save fail with "Invalid input."
  if (
    avatarUrl !== undefined &&
    avatarUrl !== null &&
    avatarUrl !== '' &&
    !isValidHttpUrl(avatarUrl)
  ) {
    errors.push('avatarUrl must be a valid http(s) URL.');
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
  }

  try {
    const updateData: Record<string, unknown> = {};

    if (displayName !== undefined) updateData.displayName = displayName || null;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl || null;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    return NextResponse.json({ user: publicUser(updated) });
  } catch (error) {
    console.error('Failed to update profile:', error);
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }
}
