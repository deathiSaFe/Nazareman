import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUBMITTABLE_STATUSES = ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'] as const;

/**
 * POST /api/topics/[id]/submit
 * Move the creator's own page to PENDING_REVIEW so it enters the admin queue.
 *
 * Only the verified creator may call this, and only while the page is in
 * DRAFT, CHANGES_REQUESTED or REJECTED. The minimum information required for
 * review is validated here — the request body cannot set the resulting status.
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

    return NextResponse.json({ error: 'Failed to submit page.' }, { status: 500 });
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json(
        { error: 'Page not found.' },
        { status: 404 }
      );
    }

    const isUuid = UUID_REGEX.test(identifier);

    const topic = await prisma.topic.findFirst({
      where: {
        status: { in: [...SUBMITTABLE_STATUSES] },
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        scope: true,
        provinceId: true,
        cityId: true,
        address: true,
        status: true,
        submittedById: true,
      },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Page not found.' },
        { status: 404 }
      );
    }

    if (topic.submittedById !== user.id) {
      return NextResponse.json(
        { error: 'فقط سازنده صفحه می‌تواند آن را برای بررسی ارسال کند.' },
        { status: 403 }
      );
    }

    const hasPrimaryType = Boolean(
      await prisma.topicTypeTag.findFirst({
        where: { topicId: topic.id, kind: 'PRIMARY' },
        select: { id: true },
      })
    );

    const details: string[] = [];

    if (!topic.name.trim()) {
      details.push('نام صفحه الزامی است.');
    }

    if (!hasPrimaryType) {
      details.push('حداقل یک نوع اصلی برای صفحه انتخاب کنید.');
    }

    if (topic.scope === 'PROVINCE' && !topic.provinceId) {
      details.push('استان این صفحه مشخص نشده است.');
    }

    if (topic.scope === 'CITY' && (!topic.provinceId || !topic.cityId)) {
      details.push('استان و شهر این صفحه مشخص نشده است.');
    }

    if (topic.scope === 'ADDRESS') {
      if (!topic.provinceId || !topic.cityId) {
        details.push('استان و شهر این صفحه مشخص نشده است.');
      } else if (!topic.address?.trim()) {
        details.push('نشانی خیابان این صفحه مشخص نشده است.');
      }
    }

    if (details.length > 0) {
      return NextResponse.json(
        { error: 'صفحه هنوز برای بررسی کامل نیست.', details },
        { status: 400 }
      );
    }

    // Transition the Topic and its initial-review Submission together. Previous
    // decision metadata is cleared so the new review cycle starts fresh.
    await prisma.$transaction(async (tx) => {
      await tx.topic.update({
        where: { id: topic.id },
        data: { status: 'PENDING_REVIEW' },
      });

      await tx.submission.update({
        where: { topicId: topic.id },
        data: {
          status: 'PENDING_REVIEW',
          decisionNote: null,
          decidedById: null,
          decidedAt: null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      topicId: topic.id,
      slug: topic.slug,
      status: 'PENDING_REVIEW',
      message: 'صفحه برای بررسی ارسال شد.',
    });
  } catch (error) {
    console.error('Failed to submit page:', error);

    return NextResponse.json(
      { error: 'Failed to submit page.' },
      { status: 500 }
    );
  }
}
