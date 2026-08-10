'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[15px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

export function ProfileForm({
  initialDisplayName,
  initialAvatarUrl,
}: {
  initialDisplayName: string | null;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          avatarUrl: avatarUrl.trim(),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // The API returns the reason list under `details` (top-level error is
        // generic); surface the real reasons to the user.
        const details =
          payload?.details && Array.isArray(payload.details)
            ? (payload.details as string[])
            : [];
        setError(
          details.length > 0 ? details.join(' ') : (payload?.error ?? 'ذخیره تغییرات ممکن نشد.')
        );
        return;
      }

      setMessage('پروفایل به‌روزرسانی شد.');
      // Re-render the server-rendered page so the header/profile reflect the
      // new display name and avatar.
      router.refresh();
    } catch {
      setError('ذخیره تغییرات ممکن نشد.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-[13px] font-bold text-ink-900">نام نمایشی</span>
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={40}
          placeholder="نام شما"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-[13px] font-bold text-ink-900">آدرس تصویر پروفایل</span>
        <input
          type="text"
          value={avatarUrl}
          onChange={(event) => setAvatarUrl(event.target.value)}
          placeholder="https://..."
          dir="ltr"
          className={inputClass}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] font-bold text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="rounded-xl bg-turquoise-600/10 p-3 text-[13px] font-bold text-turquoise-700">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-turquoise-600 px-7 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97] disabled:opacity-50"
      >
        {saving ? 'در حال ذخیره...' : 'ذخیره'}
      </button>
    </form>
  );
}
