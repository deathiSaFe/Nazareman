import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/favorites/[topicId]
 * Removes the authenticated user's own favorite for the given page. The owner
 * of the favorite comes from the session. Removing a nonexistent favorite is
 * idempotent (returns success either way).
 */
export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{ topicId: string }>;
  }
) {
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to remove favorite.' }, { status: 500 });
  }

  const { topicId } = await context.params;
  const identifier = topicId.trim();

  if (!identifier || !UUID_REGEX.test(identifier)) {
    return NextResponse.json({ success: true, removed: false });
  }

  try {
    const result = await prisma.favorite.deleteMany({
      where: { userId: user.id, topicId: identifier },
    });

    return NextResponse.json({ success: true, removed: result.count > 0 });
  } catch (error) {
    console.error('Failed to remove favorite:', error);
    return NextResponse.json({ error: 'Failed to remove favorite.' }, { status: 500 });
  }
}
