import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';
import { getTopicRatingStats } from '@/lib/rating';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RATING_WINDOW_MS = 60 * 60 * 1000;
const RATING_LIMIT = 60;

/**
 * POST /api/topics/[id]/rating
 * A verified user rates an APPROVED topic from 1 to 5. One rating per
 * (topic, user): submitting again updates the existing rating (atomic upsert).
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
    return NextResponse.json({ error: 'Failed to save rating.' }, { status: 500 });
  }

  if (
    isRateLimited(request, `rating:${user.id}`, {
      limit: RATING_LIMIT,
      windowMs: RATING_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const value = (body as Record<string, unknown>).value;

  // value must be an integer from 1 to 5 — decimals and out-of-range values
  // are rejected (400).
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    return NextResponse.json(
      { error: 'امتیاز باید عددی صحیح از ۱ تا ۵ باشد.' },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
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
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }

    // Atomic upsert: creates on first rating, updates on subsequent ratings,
    // never duplicates.
    const rating = await prisma.rating.upsert({
      where: { topicId_userId: { topicId: topic.id, userId: user.id } },
      update: { value },
      create: { topicId: topic.id, userId: user.id, value },
      select: { value: true },
    });

    const stats = await getTopicRatingStats(topic.id);

    return NextResponse.json({
      success: true,
      myRating: rating.value,
      averageRating: stats.averageRating,
      ratingCount: stats.ratingCount,
    });
  } catch (error) {
    console.error('Failed to save rating:', error);
    return NextResponse.json({ error: 'Failed to save rating.' }, { status: 500 });
  }
}

/**
 * DELETE /api/topics/[id]/rating
 * The authenticated user removes their own rating. Removing a nonexistent
 * rating is idempotent.
 */
export async function DELETE(
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
    return NextResponse.json({ error: 'Failed to remove rating.' }, { status: 500 });
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
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
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }

    await prisma.rating.deleteMany({
      where: { topicId: topic.id, userId: user.id },
    });

    const stats = await getTopicRatingStats(topic.id);

    return NextResponse.json({
      success: true,
      myRating: null,
      averageRating: stats.averageRating,
      ratingCount: stats.ratingCount,
    });
  } catch (error) {
    console.error('Failed to remove rating:', error);
    return NextResponse.json({ error: 'Failed to remove rating.' }, { status: 500 });
  }
}
