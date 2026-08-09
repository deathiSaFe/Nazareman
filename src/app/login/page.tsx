import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ورود / ثبت‌نام - نظرمن',
};

/** Allow only internal relative paths — never absolute/external URLs. */
function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('//') || !value.startsWith('/')) return null;
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  const user = await getCurrentUser();

  // Already signed in — continue to the intended destination (if internal).
  if (user) {
    redirect(destination ?? '/profile');
  }

  return (
    <main className="min-h-screen bg-paper pb-10">
      <div className="mx-auto w-full max-w-md px-5 pt-10">
        <LoginForm next={destination} />
      </div>
    </main>
  );
}
