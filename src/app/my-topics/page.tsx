import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { topicHref } from '@/types/topic';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'صفحه‌های من - نظرمن',
};

const STATUS_ORDER = ['DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'] as const;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_REVIEW: 'در انتظار بررسی',
  CHANGES_REQUESTED: 'نیاز به اصلاح',
  REJECTED: 'رد شده',
  APPROVED: 'منتشر شده',
};

function statusStyle(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-600/10 text-emerald-700';
    case 'REJECTED':
      return 'bg-red-600/10 text-red-700';
    case 'CHANGES_REQUESTED':
      return 'bg-saffron-500/10 text-saffron-700';
    case 'DRAFT':
      return 'bg-ink-900/10 text-ink-600';
    default:
      return 'bg-saffron-500/10 text-saffron-700';
  }
}

function actionFor(status: string): { label: string; primary: boolean } {
  switch (status) {
    case 'DRAFT':
      return { label: 'ادامه', primary: true };
    case 'CHANGES_REQUESTED':
      return { label: 'اصلاح', primary: true };
    case 'REJECTED':
      return { label: 'اصلاح و ارسال مجدد', primary: true };
    default:
      return { label: 'مشاهده', primary: false };
  }
}

function formatPersianDate(value: Date): string {
  try {
    return value.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default async function MyTopicsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?next=/my-topics');
  }

  const topics = await prisma.topic.findMany({
    where: { submittedById: user.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      createdAt: true,
      submission: {
        select: { decisionNote: true, decidedAt: true },
      },
      types: {
        select: { kind: true, type: { select: { label: true } } },
        orderBy: { order: 'asc' },
      },
    },
  });

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    topics: topics.filter((topic) => topic.status === status),
  }));

  return (
    <main className="min-h-screen bg-paper pb-16">
      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
        >
          بازگشت به پروفایل
        </Link>

        <header className="mt-6">
          <h1 className="font-display text-3xl text-ink-900">صفحه‌های من</h1>
          <p className="mt-2 text-sm text-ink-600">
            صفحه‌هایی که ساخته‌اید و وضعیت بررسی آنها
          </p>
        </header>

        <Link
          href="/add-topic"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-turquoise-600 px-7 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700"
        >
          افزودن صفحه جدید
        </Link>

        {topics.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-8 text-center ring-1 ring-ink-900/[0.06]">
            <p className="text-[15px] leading-7 text-ink-600">
              هنوز صفحه‌ای نساخته‌اید.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {grouped.map(({ status, topics: group }) => {
              if (group.length === 0) return null;

              return (
                <section key={status}>
                  <h2 className="text-[14px] font-bold text-ink-700">
                    {STATUS_LABELS[status] ?? status}{' '}
                    <span className="text-[12px] font-medium text-ink-400">
                      ({group.length})
                    </span>
                  </h2>

                  <div className="mt-2 space-y-3">
                    {group.map((topic) => {
                      const action = actionFor(topic.status);

                      return (
                        <article
                          key={topic.id}
                          className="rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate font-display text-lg text-ink-900">
                                {topic.name}
                              </h3>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-400">
                                <span className={`rounded-full px-2.5 py-0.5 font-bold ${statusStyle(topic.status)}`}>
                                  {STATUS_LABELS[topic.status] ?? topic.status}
                                </span>
                                <span>{formatPersianDate(topic.createdAt)}</span>
                                <span>{topic.types.map((tag) => tag.type.label).join('، ') || 'بدون نوع'}</span>
                              </div>
                            </div>

                            <Link
                              href={topicHref(topic)}
                              className={`rounded-full px-5 py-2 text-[13px] font-bold transition-colors ${
                                action.primary
                                  ? 'bg-turquoise-600 text-white hover:bg-turquoise-700'
                                  : 'bg-white text-ink-700 ring-1 ring-ink-900/15 hover:bg-ink-900/5'
                              }`}
                            >
                              {action.label}
                            </Link>
                          </div>

                          {(topic.status === 'CHANGES_REQUESTED' || topic.status === 'REJECTED') &&
                            topic.submission?.decisionNote && (
                              <p className="mt-3 rounded-xl bg-saffron-50 p-3 text-[13px] leading-6 text-ink-700">
                                <span className="font-bold text-saffron-700">
                                  {topic.status === 'REJECTED' ? 'دلیل رد: ' : 'پیام مدیر: '}
                                </span>
                                {topic.submission.decisionNote}
                              </p>
                            )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
