import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getAdmin } from '@/lib/authorization';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'بررسی صفحه‌ها - نظرمن',
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

export default async function AdminTopicsPage() {
  const admin = await getAdmin();

  if (!admin) {
    return <AdminLoginForm />;
  }

  const pendingTopics = await prisma.topic.findMany({
    where: {
      status: 'PENDING_REVIEW',
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      slug: true,
      name: true,
      createdAt: true,
      city: {
        select: {
          name: true,
          province: { select: { name: true } },
        },
      },
      province: {
        select: { name: true },
      },
      types: {
        select: {
          order: true,
          type: { select: { label: true } },
        },
        orderBy: { order: 'asc' },
      },
      submission: {
        select: { createdAt: true },
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
          <h1 className="font-display text-3xl text-ink-900">
            صفحه‌های در انتظار بررسی
          </h1>

          <p className="mt-2 text-sm text-ink-600">
            برای بررسی کامل یک صفحه — ویرایش، نظرات و انتشار — آن را باز کنید.
          </p>
        </header>

        {pendingTopics.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-6 text-sm text-ink-600 ring-1 ring-ink-900/[0.06]">
            صفحه‌ای در انتظار بررسی وجود ندارد.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {pendingTopics.map((topic) => {
              const locationParts = [
                topic.city?.name,
                topic.city?.province?.name ?? topic.province?.name,
              ].filter(Boolean);

              return (
                <Link
                  key={topic.id}
                  href={`/admin/topics/${topic.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.4)] md:p-6"
                >
                  <div className="min-w-0">
                    <h2 className="font-display text-xl text-ink-900">
                      {topic.name}
                    </h2>

                    <p className="mt-1 text-sm text-ink-500">
                      {topic.types.map((tag) => tag.type.label).join('، ') ||
                        'بدون نوع'}
                    </p>

                    <p className="mt-1 text-xs text-ink-400">
                      {locationParts.length > 0 ? locationParts.join(' · ') : 'سراسر کشور'} ·{' '}
                      {formatPersianDate(
                        topic.submission?.createdAt ?? topic.createdAt
                      )}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full bg-turquoise-600/10 px-4 py-2 text-[13px] font-bold text-turquoise-700">
                    بررسی صفحه
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
