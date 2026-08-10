import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { TypeSuggestionsModerationClient } from '@/components/admin/TypeSuggestionsModerationClient';
import { getAdmin } from '@/lib/authorization';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'بررسی نوع‌های جدید - نظرمن',
};

export default async function AdminTypeSuggestionsPage() {
  const admin = await getAdmin();

  if (!admin) {
    return <AdminLoginForm />;
  }

  const pendingSuggestions = await prisma.topicTypeSuggestion.findMany({
    where: {
      status: 'PENDING_REVIEW',
    },
    orderBy: {
      submittedAt: 'desc',
    },
    select: {
      id: true,
      label: true,
      submittedAt: true,
    },
  });

  const suggestions = pendingSuggestions.map((suggestion) => ({
    id: suggestion.id,
    label: suggestion.label,
    submittedAt: suggestion.submittedAt.toISOString(),
  }));

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
          <h1 className="font-display text-3xl text-ink-900">
            نوع‌های جدید در انتظار بررسی
          </h1>

          <p className="mt-2 text-sm text-ink-600">
            این نوع‌ها را کاربران هنگام ثبت موضوع وارد کرده‌اند. تأیید آنها را به
            پیشنهادهای «نوع موضوع» در فرم افزودن موضوع اضافه می‌کند.
          </p>
        </header>

        <TypeSuggestionsModerationClient suggestions={suggestions} />
      </div>
    </main>
  );
}
