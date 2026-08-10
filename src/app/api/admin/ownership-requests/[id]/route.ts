import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireAdmin } from '@/lib/authorization';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Decision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

class DecisionConflict extends Error {}

/**
 * PATCH /api/admin/ownership-requests/[id]
 * Admin decision on an ownership request:
 *   - APPROVE: atomically creates the PageOwnership row, marks the request
 *     APPROVED and writes a ModerationLog — all in one transaction.
 *   - REQUEST_CHANGES / REJECT: require a note; no ownership is created.
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
  const action = data.action as Decision;

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
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomically claim the request: only a PENDING_REVIEW request may be
      // decided. If another admin already decided, this throws and rolls back.
      const nextStatus =
        action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';

      const claimed = await tx.ownershipRequest.updateMany({
        where: { id: identifier, status: 'PENDING_REVIEW' },
        data: {
          status: nextStatus,
          decisionNote: note || null,
          decidedById: admin.id,
          decidedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        throw new DecisionConflict('این درخواست قبلاً بررسی شده است.');
      }

      const ownershipRequest = await tx.ownershipRequest.findUnique({
        where: { id: identifier },
        select: {
          id: true,
          topicId: true,
          userId: true,
          topic: { select: { name: true } },
        },
      });

      if (!ownershipRequest) {
        throw new DecisionConflict('Request not found.');
      }

      if (action === 'APPROVE') {
        const topic = await tx.topic.findUnique({
          where: { id: ownershipRequest.topicId },
          select: { id: true, status: true },
        });

        if (!topic || topic.status !== 'APPROVED') {
          throw new DecisionConflict('این صفحه دیگر منتشر نیست.');
        }

        const existing = await tx.pageOwnership.findUnique({
          where: {
            topicId_userId: {
              topicId: ownershipRequest.topicId,
              userId: ownershipRequest.userId,
            },
          },
          select: { id: true },
        });

        if (existing) {
          throw new DecisionConflict('این کاربر از قبل مالک این صفحه است.');
        }

        await tx.pageOwnership.create({
          data: {
            topicId: ownershipRequest.topicId,
            userId: ownershipRequest.userId,
            ownershipRequestId: ownershipRequest.id,
          },
        });
      }

      const logAction =
        action === 'APPROVE'
          ? 'OWNERSHIP_APPROVE'
          : action === 'REJECT'
            ? 'OWNERSHIP_REJECT'
            : 'OWNERSHIP_REQUEST_CHANGES';

      await tx.moderationLog.create({
        data: {
          action: logAction,
          reason: note || null,
          adminId: admin.id,
          topicId: ownershipRequest.topicId,
          ownershipRequestId: ownershipRequest.id,
        },
      });

      // Inbox message to the requester with the admin's response.
      await createNotification(tx, {
        userId: ownershipRequest.userId,
        kind: 'OWNERSHIP_DECISION',
        topicId: ownershipRequest.topicId,
        refId: ownershipRequest.id,
        title:
          action === 'APPROVE'
            ? 'درخواست مالکیت شما تأیید شد'
            : action === 'REJECT'
              ? 'درخواست مالکیت شما رد شد'
              : 'درخواست اطلاعات بیشتر برای مالکیت',
        body:
          action === 'APPROVE'
            ? `مالکیت صفحه «${ownershipRequest.topic?.name ?? ''}» به شما اعطا شد.`
            : note
              ? `درخواست مالکیت شما برای صفحه «${ownershipRequest.topic?.name ?? ''}»: ${note}`
              : action === 'REJECT'
                ? `درخواست مالکیت شما برای صفحه «${ownershipRequest.topic?.name ?? ''}» رد شد.`
                : `برای بررسی درخواست مالکیت صفحه «${ownershipRequest.topic?.name ?? ''}» اطلاعات بیشتری لازم است.`,
      });

      return { status: nextStatus };
    });

    return NextResponse.json({
      success: true,
      status: result.status,
      message: action === 'APPROVE' ? 'مالکیت صفحه تأیید شد.' : 'ثبت شد.',
    });
  } catch (error) {
    if (error instanceof DecisionConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('Failed to decide ownership request:', error);
    return NextResponse.json(
      { error: 'Failed to decide ownership request.' },
      { status: 500 }
    );
  }
}
