import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireAdmin } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = ['APPROVED', 'REJECTED'] as const;

const MAX_BODY_LENGTH = 2000;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return (
    typeof value === 'string' &&
    (ALLOWED_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * PATCH /api/admin/comments/[id]
 * Moderate a single comment (approve/reject and/or edit its body) as the
 * authenticated admin. Every decision/change writes an audit ModerationLog
 * carrying the admin's identity.
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
  const rawBody = typeof data.body === 'string' ? data.body.trim() : undefined;

  const errors: string[] = [];

  let status: AllowedStatus | undefined;
  if (data.status !== undefined) {
    if (isAllowedStatus(data.status)) {
      status = data.status;
    } else {
      errors.push('status must be APPROVED or REJECTED.');
    }
  }

  if (rawBody !== undefined && rawBody.length === 0) {
    errors.push('body must not be empty.');
  } else if (rawBody !== undefined && rawBody.length > MAX_BODY_LENGTH) {
    errors.push(`body must be ${MAX_BODY_LENGTH} characters or fewer.`);
  }

  if (status === undefined && rawBody === undefined) {
    errors.push('Provide a status or a body to update.');
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier || !UUID_REGEX.test(identifier)) {
      return NextResponse.json(
        { error: 'Comment not found.' },
        { status: 404 }
      );
    }

    const existingComment = await prisma.comment.findUnique({
      where: { id: identifier },
      select: { id: true, topicId: true },
    });

    if (!existingComment) {
      return NextResponse.json(
        { error: 'Comment not found.' },
        { status: 404 }
      );
    }

    const updatedComment = await prisma.$transaction(async (tx) => {
      const updated = await tx.comment.update({
        where: { id: existingComment.id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(rawBody !== undefined ? { body: rawBody } : {}),
        },
        select: {
          id: true,
          body: true,
          status: true,
          createdAt: true,
        },
      });

      // Audit: comment moderation decision.
      if (status !== undefined) {
        await tx.moderationLog.create({
          data: {
            action: status === 'APPROVED' ? 'COMMENT_APPROVE' : 'COMMENT_REJECT',
            adminId: admin.id,
            topicId: existingComment.topicId,
            commentId: existingComment.id,
          },
        });
      }

      // Audit: comment body edit.
      if (rawBody !== undefined) {
        await tx.moderationLog.create({
          data: {
            action: 'EDIT',
            adminId: admin.id,
            topicId: existingComment.topicId,
            commentId: existingComment.id,
          },
        });
      }

      return updated;
    });

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error('Failed to update comment:', error);

    return NextResponse.json(
      { error: 'Failed to update comment.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/comments/[id]
 * Permanently remove a comment (top-level comments cascade their replies).
 * Admin-only, enforced server-side; every deletion writes an audit log.
 * The author's rating/identity are untouched — only the comment row is gone.
 */
export async function DELETE(
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

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier || !UUID_REGEX.test(identifier)) {
      return NextResponse.json(
        { error: 'Comment not found.' },
        { status: 404 }
      );
    }

    const existingComment = await prisma.comment.findUnique({
      where: { id: identifier },
      select: { id: true, topicId: true },
    });

    if (!existingComment) {
      return NextResponse.json(
        { error: 'Comment not found.' },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Audit the deletion BEFORE removing the row (the log keeps a snapshot
      // reference via SetNull when the comment row is gone).
      await tx.moderationLog.create({
        data: {
          action: 'COMMENT_DELETE',
          adminId: admin.id,
          topicId: existingComment.topicId,
          commentId: existingComment.id,
        },
      });

      // Replies cascade with the parent comment.
      await tx.comment.delete({ where: { id: existingComment.id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete comment:', error);

    return NextResponse.json(
      { error: 'Failed to delete comment.' },
      { status: 500 }
    );
  }
}
