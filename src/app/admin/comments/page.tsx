import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getAdmin } from '@/lib/authorization';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AdminCommentsClient } from '@/components/admin/AdminCommentsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'بررسی نظرات - نظرمن',
};

function formatPersianDate(value: Date): string {
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

const STATUS_TABS = [
  { key: 'PENDING_REVIEW', label: 'در انتظار بررسی' },
  { key: 'APPROVED', label: 'تأیید شده' },
  { key: 'REJECTED', label: 'رد شده' },
];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  PENDING_REVIEW: {
    label: 'در انتظار بررسی',
    className: 'bg-red-600/10 text-red-700',
  },
  APPROVED: {
    label: 'تأییدشده',
    className: 'bg-emerald-600/10 text-emerald-700',
  },
  REJECTED: {
    label: 'رد شده',
    className: 'bg-ink-900/5 text-ink-500',
  },
};

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const selectedStatus =
    status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING_REVIEW';

  const admin = await getAdmin();

  if (!admin) {
    return <AdminLoginForm />;
  }

  const comments = await prisma.comment.findMany({
    where: { status: selectedStatus },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      body: true,
      status: true,
      parentId: true,
      createdAt: true,
      topic: {
        select: { id: true, slug: true, name: true, status: true },
      },
      author: {
        select: { displayName: true, phoneNumber: true },
      },
    },
  });

  return (
    <main className="min-h-screen bg-paper pb-16">
      <div className="mx-auto w-full max-w-4xl px-5 py-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
        >
          بازگشت به مدیریت
        </Link>

        <header className="mt-6">
          <h1 className="font-display text-3xl text-ink-900">بررسی نظرات</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            نظرهای کاربران روی صفحه‌ها — تأیید، رد، ویرایش یا حذف کامل.
          </p>
        </header>

        <div className="mt-6 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/admin/comments?status=${tab.key}`}
              className={`rounded-full px-4 py-2 text-[13px] font-bold transition-colors ${
                selectedStatus === tab.key
                  ? 'bg-turquoise-600 text-white'
                  : 'bg-white text-ink-600 ring-1 ring-ink-900/10 hover:bg-ink-900/5'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {comments.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-6 text-sm text-ink-600 ring-1 ring-ink-900/[0.06]">
            نظری در این وضعیت وجود ندارد.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {comments.map((comment) => {
              const badge = STATUS_BADGES[comment.status];

              return (
                <article
                  key={comment.id}
                  className="rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="font-bold text-ink-700">
                        {comment.author?.displayName ?? 'کاربر'}
                      </span>
                      <span dir="ltr" className="text-ink-400">
                        {comment.author?.phoneNumber ?? ''}
                      </span>
                      <span>{formatPersianDate(comment.createdAt)}</span>
                    </div>

                    <Link
                      href={`/admin/topics/${comment.topic.id}`}
                      className="text-[12px] font-medium text-turquoise-700 underline underline-offset-4"
                    >
                      {comment.topic.name}
                    </Link>
                  </div>

                  {comment.parentId && (
                    <p className="mt-2 text-[11px] font-bold text-ink-400">پاسخ</p>
                  )}

                  <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-7 text-ink-800">
                    {comment.body}
                  </p>

                  <AdminCommentsClient
                    commentId={comment.id}
                    initialBody={comment.body}
                    status={comment.status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'}
                    topicSlug={comment.topic.slug}
                    topicId={comment.topic.id}
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
