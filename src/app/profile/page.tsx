import Link from 'next/link';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { SignOutButton } from '@/components/auth/SignOutButton';

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

export default async function ProfilePage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen bg-paper pb-10">
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          بازگشت به صفحه اصلی
        </Link>

        <h1 className="mt-3 font-display text-3xl text-ink-900">پروفایل من</h1>

        {!user ? (
          <div className="mt-6 rounded-3xl bg-white p-8 text-center ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)]">
            <p className="text-[15px] leading-7 text-ink-600">
              برای دیدن حساب کاربری خود، وارد شوید.
            </p>

            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-turquoise-600 px-7 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97]"
            >
              ورود / ثبت‌نام
            </Link>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl bg-white ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)]">
            <div className="flex items-center gap-4 border-b border-ink-900/[0.08] p-6">
              <div className="grid size-14 shrink-0 place-items-center rounded-full bg-turquoise-600/10 font-display text-2xl text-turquoise-700">
                {(user.displayName || user.phoneNumber).charAt(0)}
              </div>

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
                <dt className="shrink-0 text-[13px] font-medium text-ink-500">نقش کاربری</dt>
                <dd className="text-[14px] font-semibold text-ink-900">
                  {user.role === 'ADMIN' ? 'مدیر' : 'کاربر'}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="shrink-0 text-[13px] font-medium text-ink-500">تاریخ عضویت</dt>
                <dd className="text-[14px] font-semibold text-ink-900">
                  {formatPersianDate(user.createdAt)}
                </dd>
              </div>
            </dl>

            <div className="flex justify-end border-t border-ink-900/[0.08] p-6">
              <SignOutButton />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
