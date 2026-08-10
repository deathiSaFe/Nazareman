import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * PATCH /api/topics/[id]/ownership-requests/[requestId]
 * The original requester edits the evidence of their own CHANGES_REQUESTED
 * request and returns it to PENDING_REVIEW. The request must belong to the
 * session user and to the topic in the URL. Status/decision fields are never
 * set by the client.
 */
export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string; requestId: string }>;
  }
) {
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update request.' }, { status: 500 });
  }

  if (
    isRateLimited(request, `ownership-request:${user.id}`, {
      limit: REQUEST_LIMIT,
      windowMs: REQUEST_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

  const { id, requestId } = await context.params;
  const topicIdentifier = id.trim();
  const requestIdentifier = requestId.trim();

  if (!topicIdentifier || !requestIdentifier || !UUID_REGEX.test(requestIdentifier)) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  const isUuid = UUID_REGEX.test(topicIdentifier);

  const topic = await prisma.topic.findFirst({
    where: {
      status: 'APPROVED',
      OR: isUuid
        ? [{ id: topicIdentifier }, { slug: topicIdentifier }]
        : [{ slug: topicIdentifier }],
    },
    select: { id: true },
  });

  if (!topic) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  const existing = await prisma.ownershipRequest.findFirst({
    where: { id: requestIdentifier, topicId: topic.id, userId: user.id },
    select: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  if (existing.status !== 'CHANGES_REQUESTED') {
    return NextResponse.json(
      { error: 'فقط درخواست‌های درخواست‌اصلاح را می‌توان ویرایش و دوباره ارسال کرد.' },
      { status: 409 }
    );
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
    const updated = await prisma.ownershipRequest.update({
      where: { id: existing.id },
      data: {
        evidence,
        evidenceUrl: evidenceUrl || null,
        status: 'PENDING_REVIEW',
        decisionNote: null,
        decidedById: null,
        decidedAt: null,
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({
      success: true,
      requestId: updated.id,
      status: updated.status,
      message: 'درخواست اصلاح‌شده برای بررسی ارسال شد.',
    });
  } catch (error) {
    console.error('Failed to update ownership request:', error);
    return NextResponse.json({ error: 'Failed to update request.' }, { status: 500 });
  }
}
