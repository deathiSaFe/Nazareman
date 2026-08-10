import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  PermissionError,
  requireUser,
  requireVerifiedUser,
} from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FAVORITE_WINDOW_MS = 60 * 60 * 1000;
const FAVORITE_LIMIT = 60;

/**
 * GET /api/favorites
 * The authenticated user's private favorite pages.
 */
export async function GET() {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to fetch favorites.' }, { status: 500 });
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
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

  return NextResponse.json({
    favorites: favorites.map((favorite) => ({
      id: favorite.id,
      topicId: favorite.topic.id,
      createdAt: favorite.createdAt,
      topic: {
        id: favorite.topic.id,
        slug: favorite.topic.slug,
        name: favorite.topic.name,
        status: favorite.topic.status,
      },
    })),
  });
}

/**
 * POST /api/favorites
 * A verified user favorites an APPROVED page. The userId comes from the
 * session — never from the body. Duplicate favorites return 409.
 */
export async function POST(request: NextRequest) {
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to add favorite.' }, { status: 500 });
  }

  if (
    isRateLimited(request, `favorite:${user.id}`, {
      limit: FAVORITE_LIMIT,
      windowMs: FAVORITE_WINDOW_MS,
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

  const topicId =
    typeof (body as Record<string, unknown>).topicId === 'string'
      ? ((body as Record<string, unknown>).topicId as string).trim()
      : '';

  if (!topicId || !UUID_REGEX.test(topicId)) {
    return NextResponse.json(
      { error: 'Page not found.' },
      { status: 404 }
    );
  }

  try {
    const topic = await prisma.topic.findFirst({
      where: { id: topicId, status: 'APPROVED' },
      select: { id: true },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Page not found.' },
        { status: 404 }
      );
    }

    try {
      const favorite = await prisma.favorite.create({
        data: { userId: user.id, topicId: topic.id },
        select: { id: true },
      });

      return NextResponse.json({ success: true, favoriteId: favorite.id }, { status: 201 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return NextResponse.json(
          { error: 'این صفحه قبلاً به علاقه‌مندی‌ها اضافه شده است.' },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Failed to add favorite:', error);
    return NextResponse.json({ error: 'Failed to add favorite.' }, { status: 500 });
  }
}
