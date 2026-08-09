import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';
import SiteHeader from '@/components/layout/SiteHeader';
import { ScrollToTop } from '@/components/layout/ScrollToTop';
import { getCurrentUser, publicUser } from '@/lib/auth';

const vazirmatn = Vazirmatn({ subsets: ['arabic'] });

export const metadata: Metadata = {
  title: 'نظر من - هر نظر، کمک به یک انتخاب بهتر',
  description: 'پلتفرم اشتراک‌گذاری تجربیات واقعی، نظرات و توصیه‌ها',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={vazirmatn.className}>
        <ScrollToTop />
        <SiteHeader user={user ? publicUser(user) : null} />
        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </body>
    </html>
  );
}
