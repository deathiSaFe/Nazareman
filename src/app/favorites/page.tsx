import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'علاقه‌مندی‌ها - نظرمن',
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

export default async function FavoritesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?next=/favorites');
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      topic: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-paper pb-16">
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
        >
          بازگشت به صفحه اصلی
        </Link>

        <header className="mt-6">
          <h1 className="font-display text-3xl text-ink-900">علاقه‌مندی‌ها</h1>
          <p className="mt-2 text-sm text-ink-600">صفحه‌هایی که ذخیره کرده‌اید</p>
        </header>

        {favorites.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-8 text-center ring-1 ring-ink-900/[0.06]">
            <p className="text-[15px] leading-7 text-ink-600">
              هنوز صفحه‌ای به علاقه‌مندی‌ها اضافه نکرده‌اید.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {favorites.map((favorite) => (
              <Link
                key={favorite.id}
                href={`/topic/${favorite.topic.slug ?? favorite.topic.id}`}
                className="block rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.4)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="truncate font-display text-lg text-ink-900">
                    {favorite.topic.name}
                  </h2>
                  <span className="shrink-0 text-[11px] text-ink-400">
                    {formatPersianDate(favorite.createdAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
