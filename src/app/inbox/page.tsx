import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { InboxList } from '@/components/inbox/InboxList';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'صندوق پیام‌ها - نظرمن',
};

export default async function InboxPage() {
  const user = await getCurrentUser();

  // Unauthenticated visitors follow the existing quick-login behavior and
  // return here afterwards.
  if (!user) {
    redirect('/login?next=/inbox');
  }

  const [messages, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        topic: {
          select: { id: true, slug: true, name: true, status: true },
        },
      },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <main className="min-h-screen bg-paper pb-10">
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
        >
          بازگشت به صفحه اصلی
        </Link>

        <div className="mt-4">
          <InboxList
            messages={messages.map((message) => ({
              id: message.id,
              kind: message.kind,
              title: message.title,
              body: message.body,
              readAt: message.readAt ? message.readAt.toISOString() : null,
              createdAt: message.createdAt.toISOString(),
              topic: message.topic,
            }))}
            unread={unread}
          />
        </div>
      </div>
    </main>
  );
}
