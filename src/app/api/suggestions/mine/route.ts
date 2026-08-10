import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireUser } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/suggestions/mine
 * The authenticated user's own suggestions with their topic, kind, status and
 * decision note. Backing data for a future profile page.
 */
export async function GET() {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to fetch suggestions.' }, { status: 500 });
  }

  const suggestions = await prisma.suggestion.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      kind: true,
      status: true,
      note: true,
      decisionNote: true,
      createdAt: true,
      topic: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json({ suggestions });
}
