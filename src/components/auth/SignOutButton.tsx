'use client';

import { useRouter } from 'next/navigation';

export function SignOutButton({ className = '' }: { className?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className={`rounded-full bg-white px-6 py-2.5 text-[13px] font-bold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50 ${className}`}
    >
      خروج
    </button>
  );
}
