import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getAdmin } from '@/lib/authorization';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'مدیریت - نظرمن',
};

export default async function AdminPage() {
  const admin = await getAdmin();

  if (!admin) {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    return <AdminLoginForm notConfigured={adminCount === 0} />;
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl text-ink-900">مدیریت نظرمن</h1>

        <p className="mt-2 text-sm text-ink-600">
          صفحه‌های در انتظار بررسی و انتشار
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/topics"
            className="rounded-3xl bg-white p-6 text-center font-display text-xl text-turquoise-700 ring-1 ring-ink-900/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.45)]"
          >
            بررسی صفحه‌ها
          </Link>

          <Link
            href="/admin/types"
            className="rounded-3xl bg-white p-6 text-center font-display text-xl text-turquoise-700 ring-1 ring-ink-900/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.45)]"
          >
            بررسی نوع‌های جدید
          </Link>

          <Link
            href="/admin/suggestions"
            className="rounded-3xl bg-white p-6 text-center font-display text-xl text-turquoise-700 ring-1 ring-ink-900/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.45)]"
          >
            بررسی پیشنهادها
          </Link>

          <Link
            href="/admin/ownership-requests"
            className="rounded-3xl bg-white p-6 text-center font-display text-xl text-turquoise-700 ring-1 ring-ink-900/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.45)]"
          >
            بررسی درخواست‌های مالکیت
          </Link>

          <Link
            href="/admin/comments"
            className="rounded-3xl bg-white p-6 text-center font-display text-xl text-turquoise-700 ring-1 ring-ink-900/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.45)]"
          >
            بررسی نظرات
          </Link>
        </div>

        <p className="mt-6 text-[13px] leading-6 text-ink-500">
          نظرات را می‌توانید از همین فهرست یا از داخل هر صفحه مدیریت کنید.
        </p>
      </div>
    </main>
  );
}