import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireUser } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ownership-requests/mine
 * The authenticated user's own ownership requests with topic summary, status,
 * evidence and the admin's decision note. Other users' requests are never
 * exposed.
 */
export async function GET() {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to fetch requests.' }, { status: 500 });
  }

  const requests = await prisma.ownershipRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      evidence: true,
      evidenceUrl: true,
      status: true,
      decisionNote: true,
      decidedAt: true,
      createdAt: true,
      topic: {
        select: { id: true, slug: true, name: true, status: true },
      },
    },
  });

  return NextResponse.json({
    requests: requests.map((request) => ({
      id: request.id,
      evidence: request.evidence,
      evidenceUrl: request.evidenceUrl,
      status: request.status,
      decisionNote: request.decisionNote,
      decidedAt: request.decidedAt,
      createdAt: request.createdAt,
      topic: {
        id: request.topic.id,
        slug: request.topic.slug,
        name: request.topic.name,
        status: request.topic.status,
      },
    })),
  });
}
