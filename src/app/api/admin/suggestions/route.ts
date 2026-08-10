import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireAdmin } from '@/lib/authorization';
import type { SuggestionKind, SuggestionStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: readonly SuggestionKind[] = [
  'FIELD_CHANGE',
  'CLOSED',
  'MOVED',
  'MISSING_INFO',
  'PHOTO',
  'GENERAL',
];

const STATUSES: readonly SuggestionStatus[] = [
  'PENDING_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
];

/**
 * GET /api/admin/suggestions
 * Admin-only suggestion queue. Defaults to PENDING_REVIEW; optional filters for
 * status, kind and topic.
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
  const kind = searchParams.get('kind')?.trim();
  const topicId = searchParams.get('topicId')?.trim();

  const where: Record<string, unknown> = {};

  if (status && (STATUSES as readonly string[]).includes(status)) {
    where.status = status;
  } else {
    where.status = 'PENDING_REVIEW';
  }

  if (kind && (KINDS as readonly string[]).includes(kind)) {
    where.kind = kind;
  }

  if (topicId) {
    where.topicId = topicId;
  }

  const suggestions = await prisma.suggestion.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      kind: true,
      changes: true,
      note: true,
      status: true,
      decisionNote: true,
      createdAt: true,
      topic: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
      author: {
        select: {
          displayName: true,
          phoneNumber: true,
        },
      },
    },
  });

  return NextResponse.json({ suggestions });
}
