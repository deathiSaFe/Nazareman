import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireUser } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/notifications/[id]/read
 * Mark one of the caller's own messages as read. A message belonging to
 * another user is never touched (returns 404).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update message.' }, { status: 500 });
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier || !UUID_REGEX.test(identifier)) {
      return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    }

    // Ownership is enforced in the WHERE clause — only the owner's row can
    // be updated, so no other user's message can ever be marked read.
    const updated = await prisma.notification.updateMany({
      where: { id: identifier, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });

    return NextResponse.json({ success: true, updated: updated.count, unread });
  } catch (error) {
    console.error('Failed to mark notification read:', error);
    return NextResponse.json({ error: 'Failed to update message.' }, { status: 500 });
  }
}
