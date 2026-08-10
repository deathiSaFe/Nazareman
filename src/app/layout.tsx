import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';
import SiteHeader from '@/components/layout/SiteHeader';
import { ScrollToTop } from '@/components/layout/ScrollToTop';
import { getCurrentUser, publicUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const vazirmatn = Vazirmatn({ subsets: ['arabic'] });

export const metadata: Metadata = {
  title: 'نظرمن - تجربه‌ها را با دیگران در میان بگذارید',
  description: 'نظرمن؛ تجربه‌ها و نظرهای واقعی مردم درباره مکان‌ها و خدمات.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Unread inbox count for the hamburger badge (server-rendered, so the badge
  // can never leak another user's messages).
  const unreadCount = user
    ? await prisma.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;

  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={vazirmatn.className}>
        <ScrollToTop />
        <SiteHeader
          user={user ? publicUser(user) : null}
          unreadCount={unreadCount}
        />
        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </body>
    </html>
  );
}
