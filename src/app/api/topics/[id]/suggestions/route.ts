import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';
import {
  validateSuggestionChanges,
  validateSuggestionLocationSlugs,
} from '@/lib/suggestion-validation';
import type { SuggestionKind, Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUGGESTION_KINDS: readonly SuggestionKind[] = [
  'FIELD_CHANGE',
  'CLOSED',
  'MOVED',
  'MISSING_INFO',
  'PHOTO',
  'GENERAL',
];

const SUGGESTION_WINDOW_MS = 60 * 60 * 1000;
const SUGGESTION_LIMIT = 10;

function isSuggestionKind(value: unknown): value is SuggestionKind {
  return (
    typeof value === 'string' &&
    (SUGGESTION_KINDS as readonly string[]).includes(value)
  );
}

/**
 * GET /api/topics/[id]/suggestions
 * Returns the authenticated user's own suggestions for a topic (with their
 * status and decision notes). Anonymous callers and other users get an empty
 * list — suggestion moderation details are private to the author and admin.
 * Unpublished topics stay hidden behind the usual visibility rules.
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
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

    const currentUser = await getCurrentUser();

    if (topic.status !== 'APPROVED') {
      const isCreatorOrAdmin = currentUser?.id === topic.submittedById;
      if (!isCreatorOrAdmin) {
        return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
      }
    }

    if (!currentUser) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await prisma.suggestion.findMany({
      where: { topicId: topic.id, authorId: currentUser.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        changes: true,
        note: true,
        status: true,
        decisionNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Failed to fetch suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suggestions.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/topics/[id]/suggestions
 * A verified user proposes a correction to an APPROVED page. The canonical
 * Topic is never modified here — the proposal waits for admin review.
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
    return NextResponse.json({ error: 'Failed to submit suggestion.' }, { status: 500 });
  }

  if (
    isRateLimited(request, `suggestion:${user.id}`, {
      limit: SUGGESTION_LIMIT,
      windowMs: SUGGESTION_WINDOW_MS,
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
  const kind = data.kind;

  if (!isSuggestionKind(kind)) {
    return NextResponse.json(
      { error: 'kind must be a valid suggestion type.' },
      { status: 400 }
    );
  }

  const changesResult = validateSuggestionChanges(data.changes);
  if (!changesResult.ok) {
    return NextResponse.json(
      { error: 'Invalid input.', details: changesResult.errors },
      { status: 400 }
    );
  }

  const note = typeof data.note === 'string' ? data.note.trim() : '';
  const hasChanges = Object.keys(changesResult.changes).length > 0;

  // Per-kind requirements — an empty suggestion is never accepted.
  const errors: string[] = [];

  if (kind === 'FIELD_CHANGE' && !hasChanges) {
    errors.push('حداقل یک فیلد پیشنهادی وارد کنید.');
  }

  if (kind === 'CLOSED' && !note) {
    errors.push('توضیح بسته شدن این مکان را وارد کنید.');
  }

  if (kind === 'MOVED') {
    const hasLocation =
      changesResult.changes.address !== undefined ||
      changesResult.changes.provinceSlug !== undefined ||
      changesResult.changes.citySlug !== undefined ||
      changesResult.changes.scope !== undefined;
    if (!hasLocation && !note) {
      errors.push('آدرس یا محدوده جدید را وارد کنید یا توضیحی بنویسید.');
    }
  }

  if (kind === 'MISSING_INFO' && !note && !hasChanges) {
    errors.push('اطلاعات ناقص را توضیح دهید یا مقدار پیشنهادی را وارد کنید.');
  }

  if (kind === 'PHOTO') {
    if (!hasChanges || changesResult.changes.imageUrl === undefined) {
      errors.push('نشانی تصویر پیشنهادی را وارد کنید.');
    }
  }

  if (kind === 'GENERAL' && !note) {
    errors.push('توضیح پیشنهاد را وارد کنید.');
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
  }

  // Location slugs must resolve before we store the proposal.
  const locationErrors = await validateSuggestionLocationSlugs(changesResult.changes);
  if (locationErrors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: locationErrors }, { status: 400 });
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
      select: { id: true, status: true },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'پیشنهاد فقط برای صفحه‌های منتشر شده ممکن است.' },
        { status: 400 }
      );
    }

    // The author comes from the session, the topic from the URL, and the
    // status is always PENDING_REVIEW — never from the request body.
    const suggestion = await prisma.suggestion.create({
      data: {
        topicId: topic.id,
        authorId: user.id,
        kind,
        changes: hasChanges
          ? (changesResult.changes as Prisma.InputJsonValue)
          : undefined,
        note: note || null,
        status: 'PENDING_REVIEW',
      },
      select: { id: true, status: true },
    });

    return NextResponse.json(
      {
        success: true,
        suggestionId: suggestion.id,
        status: suggestion.status,
        message: 'پیشنهاد شما ثبت شد و پس از بررسی مدیر در صفحه اعمال خواهد شد.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to submit suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to submit suggestion.' },
      { status: 500 }
    );
  }
}
