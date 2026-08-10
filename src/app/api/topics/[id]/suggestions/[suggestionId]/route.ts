import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';
import {
  validateSuggestionChanges,
  validateSuggestionLocationSlugs,
} from '@/lib/suggestion-validation';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/topics/[id]/suggestions/[suggestionId]
 * The author of a CHANGES_REQUESTED suggestion may correct it and return it to
 * PENDING_REVIEW. APPROVED / REJECTED suggestions are immutable history.
 *
 * The suggestion is found by both id and topic, and must belong to the session
 * user. The status is always set back to PENDING_REVIEW by the server.
 */
export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string; suggestionId: string }>;
  }
) {
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update suggestion.' }, { status: 500 });
  }

  const { id, suggestionId } = await context.params;

  if (!suggestionId.trim() || !UUID_REGEX.test(suggestionId.trim())) {
    return NextResponse.json({ error: 'Suggestion not found.' }, { status: 404 });
  }

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
      { error: 'Suggestion not found.' },
      { status: 404 }
    );
  }

  const suggestion = await prisma.suggestion.findFirst({
    where: { id: suggestionId.trim(), topicId: topic.id, authorId: user.id },
    select: { id: true, kind: true, status: true },
  });

  if (!suggestion) {
    return NextResponse.json({ error: 'Suggestion not found.' }, { status: 404 });
  }

  if (suggestion.status !== 'CHANGES_REQUESTED') {
    return NextResponse.json(
      { error: 'فقط پیشنهادهای درخواست‌اصلاح را می‌توان ویرایش و دوباره ارسال کرد.' },
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

  const changesResult = validateSuggestionChanges(data.changes);
  if (!changesResult.ok) {
    return NextResponse.json(
      { error: 'Invalid input.', details: changesResult.errors },
      { status: 400 }
    );
  }

  const note = typeof data.note === 'string' ? data.note.trim() : '';
  const hasChanges = Object.keys(changesResult.changes).length > 0;

  const errors: string[] = [];

  if (suggestion.kind === 'FIELD_CHANGE' && !hasChanges) {
    errors.push('حداقل یک فیلد پیشنهادی وارد کنید.');
  }
  if (suggestion.kind === 'CLOSED' && !note) {
    errors.push('توضیح بسته شدن این مکان را وارد کنید.');
  }
  if (suggestion.kind === 'MOVED') {
    const hasLocation =
      changesResult.changes.address !== undefined ||
      changesResult.changes.provinceSlug !== undefined ||
      changesResult.changes.citySlug !== undefined ||
      changesResult.changes.scope !== undefined;
    if (!hasLocation && !note) {
      errors.push('آدرس یا محدوده جدید را وارد کنید یا توضیحی بنویسید.');
    }
  }
  if (suggestion.kind === 'MISSING_INFO' && !note && !hasChanges) {
    errors.push('اطلاعات ناقص را توضیح دهید یا مقدار پیشنهادی را وارد کنید.');
  }
  if (suggestion.kind === 'PHOTO') {
    if (!hasChanges || changesResult.changes.imageUrl === undefined) {
      errors.push('نشانی تصویر پیشنهادی را وارد کنید.');
    }
  }
  if (suggestion.kind === 'GENERAL' && !note) {
    errors.push('توضیح پیشنهاد را وارد کنید.');
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
  }

  const locationErrors = await validateSuggestionLocationSlugs(changesResult.changes);
  if (locationErrors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: locationErrors }, { status: 400 });
  }

  try {
    const updated = await prisma.suggestion.update({
      where: { id: suggestion.id },
      data: {
        changes: hasChanges
          ? (changesResult.changes as Prisma.InputJsonValue)
          : undefined,
        note: note || null,
        status: 'PENDING_REVIEW',
        decisionNote: null,
        decidedById: null,
        decidedAt: null,
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({
      success: true,
      suggestionId: updated.id,
      status: updated.status,
      message: 'پیشنهاد اصلاح‌شده برای بررسی ارسال شد.',
    });
  } catch (error) {
    console.error('Failed to update suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to update suggestion.' },
      { status: 500 }
    );
  }
}
