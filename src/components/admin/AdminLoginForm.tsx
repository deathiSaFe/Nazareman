'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Prompt shown on admin pages when the current session user is not an admin.
 * Admin authentication is the normal phone session + UserRole.ADMIN — there is
 * no separate admin password.
 */
export function AdminLoginForm({ notConfigured = false }: { notConfigured?: boolean }) {
  const pathname = usePathname();
  const next = pathname && pathname.startsWith('/') ? pathname : '/admin';

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)]">
        <h1 className="font-display text-2xl text-ink-900">ورود مدیریت</h1>

        <p className="mt-2 text-sm leading-7 text-ink-600">
          برای دسترسی به پنل مدیریت، با حساب کاربری مدیر وارد شوید.
        </p>

        {notConfigured ? (
          <p className="mt-4 rounded-2xl bg-saffron-50 p-3 text-[13px] leading-6 text-saffron-700">
            هنوز هیچ مدیری ساخته نشده است. برای ساخت اولین مدیر، شماره موبایل او را
            در متغیر محیطی <span dir="ltr">ADMIN_PHONE</span> قرار دهید.
          </p>
        ) : null}

        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-turquoise-600 px-7 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97]"
        >
          ورود با حساب کاربری
        </Link>
      </div>
    </main>
  );
}
