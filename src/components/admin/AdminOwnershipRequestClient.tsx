'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[14px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

export function AdminOwnershipRequestClient({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(action: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT') {
    setMessage(null);
    setError(null);

    if ((action === 'REQUEST_CHANGES' || action === 'REJECT') && !note.trim()) {
      setError(action === 'REJECT' ? 'دلیل رد را وارد کنید.' : 'پیام درخواست اصلاح را وارد کنید.');
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`/api/admin/ownership-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ...(action !== 'APPROVE' ? { note: note.trim() } : {}),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        setError('رمز مدیریت معتبر نیست.');
        return;
      }

      if (!response.ok) {
        setError(payload?.error ?? 'عملیات ممکن نشد.');
        return;
      }

      setMessage(
        action === 'APPROVE'
          ? 'مالکیت تأیید شد و صفحه‌مالک ساخته شد.'
          : action === 'REJECT'
            ? 'درخواست رد شد.'
            : 'درخواست اصلاح ثبت شد.'
      );

      window.setTimeout(() => router.refresh(), 800);
    } catch {
      setError('عملیات ممکن نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-ink-900/[0.06] pt-3">
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        placeholder="پیام / دلیل (برای «درخواست اصلاح» یا «رد»)"
        className={`${inputClass} resize-none leading-6`}
      />

      {error && (
        <p className="rounded-xl bg-red-50 p-2 text-[12px] font-bold text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-xl bg-turquoise-600/10 p-2 text-[12px] font-bold text-turquoise-700">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void decide('APPROVE')}
          disabled={busy}
          className="rounded-full bg-turquoise-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-turquoise-700 disabled:opacity-40"
        >
          تأیید مالکیت
        </button>

        <button
          type="button"
          onClick={() => void decide('REQUEST_CHANGES')}
          disabled={busy}
          className="rounded-full bg-white px-5 py-2 text-xs font-bold text-saffron-700 ring-1 ring-saffron-300 transition-colors hover:bg-saffron-50 disabled:opacity-40"
        >
          درخواست اصلاح
        </button>

        <button
          type="button"
          onClick={() => void decide('REJECT')}
          disabled={busy}
          className="rounded-full bg-white px-5 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-40"
        >
          رد درخواست
        </button>
      </div>
    </div>
  );
}
