import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  PermissionError,
  canViewNonPublicTopic,
  requireVerifiedUser,
} from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Realistic Persian reasons are short («مدیر هستم» = ۹ نویسه); 10 was too
// strict and rejected valid content with an opaque error. 5 still blocks
// single-character spam while accepting real evidence.
const MIN_EVIDENCE_LENGTH = 5;
const MAX_EVIDENCE_LENGTH = 2000;
const MAX_EVIDENCE_URL_LENGTH = 500;

const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const REQUEST_LIMIT = 10;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * GET /api/topics/[id]/ownership-requests
 * Returns only the authenticated user's own ownership-request state for a
 * topic. Other users' requests are never exposed.
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const currentUser = await getCurrentUser();

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    }

    const isUuid = UUID_REGEX.test(identifier);

    const topic = await prisma.topic.findFirst({
      where: {
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: { id: true, status: true, submittedById: true },
    });

    if (!topic) {
      return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    }

    if (topic.status !== 'APPROVED') {
      const admin = false;
      if (!canViewNonPublicTopic(currentUser, topic, admin)) {
        return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
      }
    }

    if (!currentUser) {
      return NextResponse.json({ request: null });
    }

    const ownRequest = await prisma.ownershipRequest.findFirst({
      where: { topicId: topic.id, userId: currentUser.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        evidence: true,
        evidenceUrl: true,
        status: true,
        decisionNote: true,
        decidedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ request: ownRequest });
  } catch (error) {
    console.error('Failed to fetch ownership request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ownership request.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/topics/[id]/ownership-requests
 * A verified user requests ownership of an APPROVED page. The userId comes
 * from the session, the topic from the URL, and the status is always
 * PENDING_REVIEW.
 */
export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to submit request.' }, { status: 500 });
  }

  if (
    isRateLimited(request, `ownership-request:${user.id}`, {
      limit: REQUEST_LIMIT,
      windowMs: REQUEST_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const data = payload as Record<string, unknown>;
  const evidence = typeof data.evidence === 'string' ? data.evidence.trim() : '';
  const evidenceUrl =
    typeof data.evidenceUrl === 'string' ? data.evidenceUrl.trim() : '';

  const errors: string[] = [];

  if (!evidence) {
    errors.push('دلیل درخواست مالکیت را وارد کنید.');
  } else if (evidence.length < MIN_EVIDENCE_LENGTH) {
    errors.push(`دلیل درخواست باید حداقل ${MIN_EVIDENCE_LENGTH} نویسه باشد.`);
  } else if (evidence.length > MAX_EVIDENCE_LENGTH) {
    errors.push(`دلیل درخواست باید حداکثر ${MAX_EVIDENCE_LENGTH} نویسه باشد.`);
  }

  if (evidenceUrl) {
    if (evidenceUrl.length > MAX_EVIDENCE_URL_LENGTH) {
      errors.push(`لینک مدرک باید حداکثر ${MAX_EVIDENCE_URL_LENGTH} نویسه باشد.`);
    } else if (!isValidHttpUrl(evidenceUrl)) {
      errors.push('لینک مدرک باید یک URL معتبر http(s) باشد.');
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    }

    const isUuid = UUID_REGEX.test(identifier);

    const topic = await prisma.topic.findFirst({
      where: {
        status: 'APPROVED',
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: { id: true },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Page not found.' },
        { status: 404 }
      );
    }

    const [existingOwnership, pendingRequest] = await Promise.all([
      prisma.pageOwnership.findUnique({
        where: { topicId_userId: { topicId: topic.id, userId: user.id } },
        select: { id: true },
      }),
      prisma.ownershipRequest.findFirst({
        where: {
          topicId: topic.id,
          userId: user.id,
          status: { in: ['PENDING_REVIEW', 'CHANGES_REQUESTED'] },
        },
        select: { id: true },
      }),
    ]);

    if (existingOwnership) {
      return NextResponse.json(
        { error: 'شما از قبل مالک این صفحه هستید.' },
        { status: 409 }
      );
    }

    if (pendingRequest) {
      return NextResponse.json(
        { error: 'درخواست مالکیت شما برای این صفحه در حال بررسی است.' },
        { status: 409 }
      );
    }

    const requestRow = await prisma.ownershipRequest.create({
      data: {
        topicId: topic.id,
        userId: user.id,
        evidence,
        evidenceUrl: evidenceUrl || null,
        status: 'PENDING_REVIEW',
      },
      select: { id: true, status: true, topicId: true },
    });

    return NextResponse.json(
      {
        success: true,
        requestId: requestRow.id,
        status: requestRow.status,
        message: 'درخواست مالکیت شما ثبت شد و توسط مدیر بررسی خواهد شد.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to submit ownership request:', error);
    return NextResponse.json({ error: 'Failed to submit request.' }, { status: 500 });
  }
}
