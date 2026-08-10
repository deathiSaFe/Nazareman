import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireAdmin } from '@/lib/authorization';
import { createNotification } from '@/lib/notifications';
import {
  applySuggestionChanges,
  validateSuggestionChanges,
} from '@/lib/suggestion-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class DecisionConflict extends Error {}

/**
 * PATCH /api/admin/suggestions/[id]
 * Admin decision on a suggestion:
 *   - APPROVE: re-validates and applies the whitelisted changes to the
 *     canonical Topic, marks the suggestion APPROVED and writes a
 *     ModerationLog — all in ONE transaction.
 *   - REQUEST_CHANGES: requires a note; Topic stays untouched.
 *   - REJECT: requires a reason; Topic stays untouched.
 */
export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  let admin;

  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  const action = data.action;

  if (action !== 'APPROVE' && action !== 'REQUEST_CHANGES' && action !== 'REJECT') {
    return NextResponse.json(
      { error: 'action must be APPROVE, REQUEST_CHANGES or REJECT.' },
      { status: 400 }
    );
  }

  const note = typeof data.note === 'string' ? data.note.trim() : '';

  if ((action === 'REQUEST_CHANGES' || action === 'REJECT') && !note) {
    return NextResponse.json(
      { error: action === 'REJECT' ? 'دلیل رد الزامی است.' : 'پیام درخواست اصلاح الزامی است.' },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const identifier = id.trim();

  if (!identifier || !UUID_REGEX.test(identifier)) {
    return NextResponse.json({ error: 'Suggestion not found.' }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomically claim the suggestion: only a PENDING_REVIEW suggestion may
      // be decided. If another admin already decided, this throws and rolls back.
      const nextStatus =
        action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';

      const claimed = await tx.suggestion.updateMany({
        where: { id: identifier, status: 'PENDING_REVIEW' },
        data: {
          status: nextStatus,
          decisionNote: note || null,
          decidedById: admin.id,
          decidedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        throw new DecisionConflict('Suggestion has already been decided.');
      }

      const suggestion = await tx.suggestion.findUnique({
        where: { id: identifier },
        select: {
          id: true,
          topicId: true,
          kind: true,
          changes: true,
          status: true,
          authorId: true,
          topic: { select: { name: true } },
        },
      });

      if (!suggestion) {
        throw new DecisionConflict('Suggestion not found.');
      }

      if (action === 'APPROVE') {
        const topic = await tx.topic.findUnique({
          where: { id: suggestion.topicId },
          select: { id: true, status: true },
        });

        if (!topic || topic.status !== 'APPROVED') {
          throw new DecisionConflict('این صفحه دیگر منتشر نیست.');
        }

        // Re-validate the stored proposal before applying anything.
        const validation = validateSuggestionChanges(suggestion.changes);
        if (!validation.ok) {
          throw new Error(`Invalid suggestion changes: ${validation.errors.join('، ')}`);
        }

        await applySuggestionChanges(tx, topic.id, validation.changes);
      }

      const logAction =
        action === 'APPROVE'
          ? 'SUGGESTION_APPROVE'
          : action === 'REJECT'
            ? 'SUGGESTION_REJECT'
            : 'SUGGESTION_REQUEST_CHANGES';

      await tx.moderationLog.create({
        data: {
          action: logAction,
          reason: note || null,
          adminId: admin.id,
          topicId: suggestion.topicId,
          suggestionId: suggestion.id,
        },
      });

      // Inbox message to the suggestion author with the admin's response.
      await createNotification(tx, {
        userId: suggestion.authorId,
        kind: 'SUGGESTION_DECISION',
        topicId: suggestion.topicId,
        refId: suggestion.id,
        title:
          action === 'APPROVE'
            ? 'پیشنهاد شما تأیید شد'
            : action === 'REJECT'
              ? 'پیشنهاد شما رد شد'
              : 'درخواست اصلاح پیشنهاد شما',
        body:
          action === 'APPROVE'
            ? `پیشنهاد شما برای صفحه «${suggestion.topic?.name ?? ''}» تأیید و اعمال شد.`
            : note
              ? `پیشنهاد شما برای صفحه «${suggestion.topic?.name ?? ''}»: ${note}`
              : action === 'REJECT'
                ? `پیشنهاد شما برای صفحه «${suggestion.topic?.name ?? ''}» رد شد.`
                : `پیشنهاد شما برای صفحه «${suggestion.topic?.name ?? ''}» نیاز به اصلاح دارد.`,
      });

      return { status: nextStatus };
    });

    return NextResponse.json({ success: true, status: result.status });
  } catch (error) {
    if (error instanceof DecisionConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('Failed to decide suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to decide suggestion.' },
      { status: 500 }
    );
  }
}
