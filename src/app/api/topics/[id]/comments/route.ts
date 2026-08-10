import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canViewNonPublicTopic, PermissionError, requireVerifiedUser } from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COMMENT_WINDOW_MS = 10 * 60 * 1000;
const COMMENT_LIMIT = 12;

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  // Comments require a signed-in, phone-verified user.
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'ارسال نظر ممکن نشد.' }, { status: 500 });
  }

  // Throttle comment creation per verified user.
  if (
    isRateLimited(request, `comment:${user.id}`, {
      limit: COMMENT_LIMIT,
      windowMs: COMMENT_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const data = payload as Record<string, unknown>;
  const body = typeof data.body === 'string' ? data.body.trim() : '';
  const rating = data.rating;

  if (!body) {
    return NextResponse.json(
      { error: 'متن نظر الزامی است.' },
      { status: 400 }
    );
  }

  if (body.length < 5) {
    return NextResponse.json(
      { error: 'متن نظر باید حداقل ۵ حرف باشد.' },
      { status: 400 }
    );
  }

  // A 1-5 star rating is part of commenting on an APPROVED page. It is
  // validated as an integer (decimals/out-of-range → 400) and, when present,
  // created/updated atomically with the comment.
  let parsedRating: number | null = null;
  if (rating !== undefined && rating !== null) {
    if (
      typeof rating !== 'number' ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return NextResponse.json(
        { error: 'امتیاز باید عددی صحیح از ۱ تا ۵ باشد.' },
        { status: 400 }
      );
    }
    parsedRating = rating;
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    const isUuid = UUID_REGEX.test(identifier);

    // Allow comments on non-public topics when accessed by UUID (creator flow,
    // e.g. leaving the first comment on their own page). Slug-based access only
    // allows APPROVED topics (public flow).
    const allowedStatuses: Array<
      'APPROVED' | 'DRAFT' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED'
    > = isUuid
      ? ['APPROVED', 'DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED']
      : ['APPROVED'];

    const topic = await prisma.topic.findFirst({
      where: {
        status: { in: allowedStatuses },
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: {
        id: true,
        status: true,
        submittedById: true,
      },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    // Do not reveal or allow interaction with other users' non-public topics.
    if (topic.status !== 'APPROVED' && !canViewNonPublicTopic(user, topic, false)) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    // Rating is required when commenting on an APPROVED public page. On the
    // creator's own non-public page the Stage 3 comment-only behavior is kept.
    if (topic.status === 'APPROVED' && parsedRating === null) {
      return NextResponse.json(
        { error: 'برای ثبت نظر روی صفحه منتشر شده، امتیاز (۱ تا ۵) الزامی است.' },
        { status: 400 }
      );
    }

    // A verified user may submit at most ONE comment per topic. The database
    // unique constraint (topicId, authorId) is the authoritative guard; the
    // pre-check below only gives a fast, friendly 409 for the common case and
    // looks at top-level comments only (replies don't count as a second
    // comment — they are prevented by the same constraint when they arrive).
    const existingComment = await prisma.comment.findFirst({
      where: { topicId: topic.id, authorId: user.id, parentId: null },
      select: { id: true },
    });

    if (existingComment) {
      return NextResponse.json(
        { error: 'شما قبلاً نظر خود را برای این صفحه ثبت کرده‌اید.' },
        { status: 409 }
      );
    }

    // The comment and (on APPROVED pages) the rating are written atomically:
    // if either fails the whole operation rolls back, so no half-applied
    // comment/rating state can remain.
    const result = await prisma.$transaction(async (tx) => {
      // The author always comes from the server session — never from the client.
      const comment = await tx.comment.create({
        data: {
          topicId: topic.id,
          body,
          status: 'PENDING_REVIEW',
          authorId: user.id,
          parentId: null,
        },
        select: {
          id: true,
        },
      });

      if (topic.status === 'APPROVED' && parsedRating !== null) {
        await tx.rating.upsert({
          where: { topicId_userId: { topicId: topic.id, userId: user.id } },
          update: { value: parsedRating },
          create: { topicId: topic.id, userId: user.id, value: parsedRating },
        });
      }

      return comment;
    });

    return NextResponse.json(
      {
        success: true,
        commentId: result.id,
        // The author's display name so the optimistic pending comment can show
        // the real name immediately (falls back to «کاربر» when unset).
        authorName: user.displayName,
        message: 'نظر شما برای بررسی ارسال شد.',
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'شما قبلاً نظر خود را برای این صفحه ثبت کرده‌اید.' },
        { status: 409 }
      );
    }

    console.error('Failed to submit comment:', error);

    return NextResponse.json(
      { error: 'Failed to submit comment.' },
      { status: 500 }
    );
  }
}