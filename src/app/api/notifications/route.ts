import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireUser } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications
 * The authenticated user's inbox messages (newest first). Only the caller's
 * own messages are ever returned — userId always comes from the session.
 */
export async function GET(request: NextRequest) {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 });
  }

  try {
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 200) : 100;

    const messages = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        refId: true,
        topic: {
          select: { id: true, slug: true, name: true, status: true },
        },
      },
    });

    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });

    return NextResponse.json({ messages, unread });
  } catch (error) {
    console.error('Failed to load notifications:', error);
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 });
  }
}
