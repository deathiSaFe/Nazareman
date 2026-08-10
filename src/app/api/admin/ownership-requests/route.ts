import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireAdmin } from '@/lib/authorization';
import type { OwnershipRequestStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: readonly OwnershipRequestStatus[] = [
  'PENDING_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
];

/**
 * GET /api/admin/ownership-requests
 * Admin-only ownership request queue. Defaults to PENDING_REVIEW with optional
 * status / topicId filters. Each row includes the topic, the requester, the
 * evidence and the current ownership state.
 */
export async function GET(request: NextRequest) {
  let admin;

  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status')?.trim();
  const topicId = searchParams.get('topicId')?.trim();

  const where: Record<string, unknown> = {};

  if (status && (STATUSES as readonly string[]).includes(status)) {
    where.status = status;
  } else {
    where.status = 'PENDING_REVIEW';
  }

  if (topicId) {
    where.topicId = topicId;
  }

  const requests = await prisma.ownershipRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      evidence: true,
      evidenceUrl: true,
      status: true,
      decisionNote: true,
      createdAt: true,
      topic: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          ownerships: { select: { id: true } },
        },
      },
      user: {
        select: {
          id: true,
          displayName: true,
          phoneNumber: true,
        },
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
      createdAt: request.createdAt,
      ownerCount: request.topic.ownerships.length,
      topic: {
        id: request.topic.id,
        slug: request.topic.slug,
        name: request.topic.name,
        status: request.topic.status,
      },
      requester: {
        id: request.user.id,
        displayName: request.user.displayName,
        phoneNumber: request.user.phoneNumber,
      },
    })),
  });
}
