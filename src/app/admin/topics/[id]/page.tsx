import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageView } from '@/components/page/PageView';
import { getAdmin } from '@/lib/authorization';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import type { PageData } from '@/types/topic';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'بررسی صفحه - نظرمن',
};

export default async function AdminPageReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdmin();

  if (!admin) {
    return <AdminLoginForm />;
  }

  const { id } = await params;
  // Normalize the path param (non-ASCII slugs can arrive percent-encoded).
  const identifier = decodeURIComponent(id).trim();

  const page = await prisma.topic.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      workingHours: true,
      imageUrl: true,
      scope: true,
      address: true,
      status: true,
      province: {
        select: { id: true, name: true, slug: true },
      },
      city: {
        select: { id: true, name: true, slug: true },
      },
      types: {
        select: {
          id: true,
          kind: true,
          order: true,
          typeId: true,
          type: {
            select: { label: true, status: true },
          },
        },
        orderBy: { order: 'asc' },
      },
      links: {
        select: { id: true, platform: true, label: true, value: true },
        orderBy: { createdAt: 'asc' },
      },
      comments: {
        select: {
          id: true,
          body: true,
          status: true,
          createdAt: true,
          authorId: true,
          parentId: true,
          author: {
            select: { displayName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!page) {
    notFound();
  }

  // Owner badge on comments: only an approved PageOwnership(topicId, authorId)
  // row marks a comment author as owner (never submittedById).
  const commentAuthorIds = [
    ...new Set(
      page.comments.map((comment) => comment.authorId).filter((id): id is string => Boolean(id))
    ),
  ];

  const commentOwnerRows =
    commentAuthorIds.length > 0
      ? await prisma.pageOwnership.findMany({
          where: { topicId: page.id, userId: { in: commentAuthorIds } },
          select: { userId: true },
        })
      : [];

  const commentOwnerIds = new Set(commentOwnerRows.map((row) => row.userId));

  // Each comment shows its author's rating on this topic (read-only; null when
  // the author has not rated — comments on non-APPROVED pages have no rating).
  const commentAuthorRatingRows =
    commentAuthorIds.length > 0
      ? await prisma.rating.findMany({
          where: { topicId: page.id, userId: { in: commentAuthorIds } },
          select: { userId: true, value: true },
        })
      : [];

  const commentAuthorRatingByUser = new Map(
    commentAuthorRatingRows.map((row) => [row.userId, row.value])
  );

  const moderationHistory = await prisma.moderationLog.findMany({
    where: { topicId: page.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { id: true, action: true, reason: true, createdAt: true },
  });

  const ACTION_LABELS: Record<string, string> = {
    APPROVE: 'تأیید صفحه',
    REJECT: 'رد صفحه',
    REQUEST_CHANGES: 'درخواست تغییر',
    EDIT: 'ویرایش توسط مدیر',
  };

  function formatHistoryDate(value: Date): string {
    try {
      return value.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  const data: PageData = {
    id: page.id,
    slug: page.slug,
    name: page.name,
    description: page.description,
    workingHours: page.workingHours,
    imageUrl: page.imageUrl,
    address: page.address,
    scope: page.scope,
    status: page.status,
    province: page.province
      ? { id: page.province.id, name: page.province.name, slug: page.province.slug }
      : null,
    city: page.city
      ? { id: page.city.id, name: page.city.name, slug: page.city.slug }
      : null,
    types: page.types.map((tag) => ({
      id: tag.id,
      label: tag.type.label,
      kind: tag.kind,
      suggestionId: tag.typeId,
      suggestionStatus: tag.type.status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
    })),
    links: page.links.map((link) => ({
      id: link.id,
      platform: link.platform,
      label: link.label,
      value: link.value,
    })),
    comments: page.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      status: comment.status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
      createdAt: comment.createdAt.toISOString(),
      authorId: comment.authorId,
      authorName: comment.author?.displayName ?? null,
      parentId: comment.parentId,
      isReply: comment.parentId !== null,
      isOwner: comment.authorId ? commentOwnerIds.has(comment.authorId) : false,
      rating: comment.authorId
        ? (commentAuthorRatingByUser.get(comment.authorId) ?? null)
        : null,
    })),
  };

  return (
    <main className="min-h-screen bg-paper pb-16">
      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/admin/topics"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
          >
            بازگشت به فهرست
          </Link>

          <a
            href={`/topic/${page.status === 'APPROVED' ? (page.slug ?? page.id) : page.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-ink-500 underline underline-offset-4 transition-colors hover:text-turquoise-700"
          >
            مشاهده عمومی صفحه
          </a>
        </div>

        <header className="mt-6">
          <h1 className="font-display text-3xl text-ink-900">بررسی صفحه</h1>

          <p className="mt-2 text-sm leading-6 text-ink-600">
            همین صفحه را ویرایش و منتشر کنید؛ همه بخش‌ها قابل ویرایش‌اند و نظرات از
            همین‌جا مدیریت می‌شوند.
          </p>
        </header>

        <div className="mt-6">
          <PageView page={data} admin />
        </div>

        {moderationHistory.length > 0 && (
          <section className="mt-8 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]">
            <h2 className="font-display text-lg text-ink-900">تاریخچه بررسی</h2>

            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {moderationHistory.map((log) => (
                <li key={log.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-ink-800">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    <span className="text-[11px] text-ink-400">
                      {formatHistoryDate(log.createdAt)}
                    </span>
                  </div>
                  {log.reason && (
                    <p className="mt-1 text-[13px] leading-6 text-ink-600">
                      {log.reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
