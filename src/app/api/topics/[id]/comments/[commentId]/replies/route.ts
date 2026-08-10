import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canViewNonPublicTopic, PermissionError, requireVerifiedUser } from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPLY_WINDOW_MS = 10 * 60 * 1000;
const REPLY_LIMIT = 12;

/**
 * POST /api/topics/[id]/comments/[commentId]/replies
 * A verified user replies to a top-level comment. Replies are exactly one
 * level deep: the parent must itself be a top-level comment (parentId null).
 *
 * The author comes from the session, the topic from the URL and the status is
 * always PENDING_REVIEW. The database unique constraint (topicId, authorId)
 * guarantees at most one contribution per user per topic.
 */
export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ id: string; commentId: string }>;
  }
) {
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'ارسال پاسخ ممکن نشد.' }, { status: 500 });
  }

  // Throttle replies per verified user (same policy as comments).
  if (
    isRateLimited(request, `comment:${user.id}`, {
      limit: REPLY_LIMIT,
      windowMs: REPLY_WINDOW_MS,
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
  const body = typeof data.body === 'string' ? data.body.trim() : '';

  if (!body) {
    return NextResponse.json(
      { error: 'متن پاسخ الزامی است.' },
      { status: 400 }
    );
  }

  if (body.length < 5) {
    return NextResponse.json(
      { error: 'متن پاسخ باید حداقل ۵ حرف باشد.' },
      { status: 400 }
    );
  }

  try {
    const { id, commentId } = await context.params;
    const identifier = id.trim();
    const parentIdentifier = commentId.trim();

    if (!identifier || !parentIdentifier || !UUID_REGEX.test(parentIdentifier)) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    const isUuid = UUID_REGEX.test(identifier);

    // Public flow requires an APPROVED topic; the creator/admin may still
    // interact on their own non-public page (same rule as comments).
    const topic = await prisma.topic.findFirst({
      where: {
        status: {
          in: ['APPROVED', 'DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'],
        },
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: { id: true, status: true, submittedById: true },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    if (topic.status !== 'APPROVED' && !canViewNonPublicTopic(user, topic, false)) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    // The parent comment must exist and belong to this topic.
    const parent = await prisma.comment.findFirst({
      where: { id: parentIdentifier, topicId: topic.id },
      select: { id: true, parentId: true },
    });

    if (!parent) {
      return NextResponse.json(
        { error: 'Comment not found.' },
        { status: 404 }
      );
    }

    // Replies are one level deep — a reply may only target a top-level comment.
    if (parent.parentId !== null) {
      return NextResponse.json(
        { error: 'پاسخ به پاسخ امکان‌پذیر نیست.' },
        { status: 400 }
      );
    }

    try {
      const reply = await prisma.comment.create({
        data: {
          topicId: topic.id,
          body,
          status: 'PENDING_REVIEW',
          authorId: user.id,
          parentId: parent.id,
        },
        select: { id: true },
      });

      return NextResponse.json(
        {
          success: true,
          commentId: reply.id,
          message: 'پاسخ شما برای بررسی ارسال شد.',
        },
        { status: 201 }
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return NextResponse.json(
          { error: 'شما قبلاً برای این صفحه نظر یا پاسخ ثبت کرده‌اید.' },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Failed to submit reply:', error);

    return NextResponse.json(
      { error: 'Failed to submit reply.' },
      { status: 500 }
    );
  }
}
