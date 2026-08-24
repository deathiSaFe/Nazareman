import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { topicHref } from '@/types/topic';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'پروفایل من - نظرمن',
};

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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_REVIEW: 'در انتظار بررسی',
  CHANGES_REQUESTED: 'نیاز به اصلاح',
  REJECTED: 'رد شده',
  APPROVED: 'منتشر شده',
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Return-to-topic context, threaded through the header (hamburger/avatar)
  // and kept alive across the login round-trip. Only an internal `/topic/...`
  // path qualifies — anything else falls back to homepage navigation only.
  const nextPath = safeNext(next);
  const topicReturn = nextPath && nextPath.startsWith('/topic/') ? nextPath : null;

  // Where a successful login should land: this same profile page, so the
  // topic return context survives the login flow.
  const loginNext = topicReturn
    ? `/profile?next=${encodeURIComponent(topicReturn)}`
    : '/profile';

  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-paper pb-10">
        <div className="mx-auto w-full max-w-2xl px-5 pt-6">
          <div className="flex items-center justify-between gap-3">
            {topicReturn && (
              <Link
                href={topicReturn}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
              >
                بازگشت به صفحه موضوع
              </Link>
            )}

            <Link
              href="/"
              className="ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
            >
              بازگشت به صفحه اصلی
            </Link>
          </div>

          <h1 className="mt-3 font-display text-3xl text-ink-900">پروفایل من</h1>

          <div className="mt-6 rounded-3xl bg-white p-8 text-center ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)]">
            <p className="text-[15px] leading-7 text-ink-600">
              برای دیدن حساب کاربری خود، وارد شوید.
            </p>

            <Link
              href={`/login?next=${encodeURIComponent(loginNext)}`}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-turquoise-600 px-7 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97]"
            >
              ورود / ثبت‌نام
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [createdTopics, ownedTopics, favorites, ratings, ownershipRequests] = await Promise.all([
    prisma.topic.findMany({
      where: { submittedById: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, slug: true, name: true, status: true },
    }),
    prisma.pageOwnership.findMany({
      where: { userId: user.id },
      orderBy: { approvedAt: 'desc' },
      select: {
        topic: { select: { id: true, slug: true, name: true, status: true } },
      },
    }),
    prisma.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        topic: { select: { id: true, slug: true, name: true, status: true } },
      },
    }),
    prisma.rating.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        value: true,
        updatedAt: true,
        topic: { select: { id: true, slug: true, name: true } },
      },
    }),
    prisma.ownershipRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        decisionNote: true,
        createdAt: true,
        topic: { select: { id: true, slug: true, name: true } },
      },
    }),
  ]);

  const OWNERSHIP_STATUS_LABELS: Record<string, string> = {
    PENDING_REVIEW: 'در انتظار بررسی',
    CHANGES_REQUESTED: 'نیاز به اصلاح',
    APPROVED: 'تأیید شده',
    REJECTED: 'رد شده',
  };

  return (
    <main className="min-h-screen bg-paper pb-10">
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <div className="flex items-center justify-between gap-3">
          {topicReturn && (
            <Link
              href={topicReturn}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
            >
              بازگشت به صفحه موضوع
            </Link>
          )}

          <Link
            href="/"
            className="ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
          >
            بازگشت به صفحه اصلی
          </Link>
        </div>

        <h1 className="mt-3 font-display text-3xl text-ink-900">پروفایل من</h1>

        <div className="mt-6 overflow-hidden rounded-3xl bg-white ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)]">
          <div className="flex items-center gap-4 border-b border-ink-900/[0.08] p-6">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="size-14 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-full bg-turquoise-600/10 font-display text-2xl text-turquoise-700">
                {(user.displayName || user.phoneNumber).charAt(0)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-2xl text-ink-900">
                {user.displayName || 'کاربر'}
              </h2>

              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[12px] font-bold ${
                  user.phoneVerified
                    ? 'bg-emerald-600/10 text-emerald-700'
                    : 'bg-saffron-500/10 text-saffron-700'
                }`}
              >
                {user.phoneVerified ? 'شماره تأیید شده' : 'شماره تأیید نشده'}
              </span>
            </div>
          </div>

          <dl className="divide-y divide-ink-900/[0.06] px-6">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="shrink-0 text-[13px] font-medium text-ink-500">شماره موبایل</dt>
              <dd dir="ltr" className="text-[14px] font-semibold text-ink-900">
                {user.phoneNumber}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="shrink-0 text-[13px] font-medium text-ink-500">تاریخ عضویت</dt>
              <dd className="text-[14px] font-semibold text-ink-900">
                {formatPersianDate(user.createdAt)}
              </dd>
            </div>
          </dl>

          <div className="border-t border-ink-900/[0.08] p-6">
            <h3 className="mb-3 text-[14px] font-bold text-ink-900">ویرایش پروفایل</h3>
            <ProfileForm
              initialDisplayName={user.displayName}
              initialAvatarUrl={user.avatarUrl}
            />
          </div>

          <div className="flex justify-end border-t border-ink-900/[0.08] p-6">
            <SignOutButton />
          </div>
        </div>

        <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg text-ink-900">صفحه‌های من</h2>
            <Link
              href="/my-topics"
              className="text-[13px] font-medium text-turquoise-700 underline underline-offset-4"
            >
              همه
            </Link>
          </div>

          {createdTopics.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">هنوز صفحه‌ای نساخته‌اید.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {createdTopics.slice(0, 5).map((topic) => (
                <li key={topic.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={topicHref(topic)}
                    className="min-w-0 truncate text-[14px] font-semibold text-ink-800 hover:text-turquoise-700"
                  >
                    {topic.name}
                  </Link>
                  <span className="shrink-0 rounded-full bg-ink-900/5 px-2.5 py-0.5 text-[11px] font-bold text-ink-500">
                    {STATUS_LABELS[topic.status] ?? topic.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]">
          <h2 className="font-display text-lg text-ink-900">صفحه‌های مالک</h2>
          {ownedTopics.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">هنوز مالک صفحه‌ای نیستید.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {ownedTopics.map(({ topic }) => (
                <li key={topic.id} className="py-2.5">
                  <Link
                    href={`/topic/${topic.slug ?? topic.id}`}
                    className="text-[14px] font-semibold text-ink-800 hover:text-turquoise-700"
                  >
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]">
          <h2 className="font-display text-lg text-ink-900">علاقه‌مندی‌ها</h2>
          {favorites.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">صفحه‌ای را به علاقه‌مندی‌ها اضافه نکرده‌اید.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {favorites.map(({ topic }) => (
                <li key={topic.id} className="py-2.5">
                  <Link
                    href={`/topic/${topic.slug ?? topic.id}`}
                    className="text-[14px] font-semibold text-ink-800 hover:text-turquoise-700"
                  >
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]">
          <h2 className="font-display text-lg text-ink-900">امتیازهای من</h2>
          {ratings.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">هنوز امتیازی ثبت نکرده‌اید.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {ratings.map((rating) => (
                <li key={rating.topic.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/topic/${rating.topic.slug ?? rating.topic.id}`}
                    className="min-w-0 truncate text-[14px] font-semibold text-ink-800 hover:text-turquoise-700"
                  >
                    {rating.topic.name}
                  </Link>
                  <span className="shrink-0 text-[13px] font-bold text-amber-600">
                    {'★'.repeat(rating.value)}
                    <span className="text-ink-300">{'☆'.repeat(5 - rating.value)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]">
          <h2 className="font-display text-lg text-ink-900">درخواست‌های مالکیت</h2>
          {ownershipRequests.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">درخواست مالکیتی ثبت نکرده‌اید.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-900/[0.06]">
              {ownershipRequests.map((requestRow) => (
                <li key={requestRow.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/topic/${requestRow.topic.slug ?? requestRow.topic.id}`}
                      className="min-w-0 truncate text-[14px] font-semibold text-ink-800 hover:text-turquoise-700"
                    >
                      {requestRow.topic.name}
                    </Link>
                    <span className="shrink-0 rounded-full bg-ink-900/5 px-2.5 py-0.5 text-[11px] font-bold text-ink-500">
                      {OWNERSHIP_STATUS_LABELS[requestRow.status] ?? requestRow.status}
                    </span>
                  </div>
                  {(requestRow.status === 'CHANGES_REQUESTED' || requestRow.status === 'REJECTED') &&
                    requestRow.decisionNote && (
                      <p className="mt-1 text-[12px] leading-6 text-ink-600">
                        {requestRow.status === 'REJECTED' ? 'دلیل رد: ' : 'پیام مدیر: '}
                        {requestRow.decisionNote}
                      </p>
                    )}
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {formatPersianDate(requestRow.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
