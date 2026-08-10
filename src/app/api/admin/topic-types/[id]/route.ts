import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireAdmin } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = ['APPROVED', 'REJECTED'] as const;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return (
    typeof value === 'string' &&
    (ALLOWED_STATUSES as readonly string[]).includes(value)
  );
}

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

  void admin;

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
  const status = data.status;

  if (!isAllowedStatus(status)) {
    return NextResponse.json(
      { error: 'status must be APPROVED or REJECTED.' },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier || !UUID_REGEX.test(identifier)) {
      return NextResponse.json(
        { error: 'Topic type suggestion not found.' },
        { status: 404 }
      );
    }

    const existing = await prisma.topicTypeSuggestion.findUnique({
      where: { id: identifier },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Topic type suggestion not found.' },
        { status: 404 }
      );
    }

    const updated = await prisma.topicTypeSuggestion.update({
      where: { id: existing.id },
      data: {
        status,
        decidedAt: new Date(),
      },
      select: {
        id: true,
        label: true,
        status: true,
        submittedAt: true,
        decidedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update topic type suggestion:', error);

    return NextResponse.json(
      { error: 'Failed to update topic type suggestion.' },
      { status: 500 }
    );
  }
}
