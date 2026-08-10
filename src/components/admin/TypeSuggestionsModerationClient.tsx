'use client';

import { useState } from 'react';

type PendingTypeSuggestion = {
  id: string;
  label: string;
  submittedAt: string;
};

function formatPersianDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function TypeSuggestionsModerationClient({
  suggestions: initialSuggestions,
}: {
  suggestions: PendingTypeSuggestion[];
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function updateStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    setMessage(null);
    setError(null);
    setLoadingId(id);

    try {
      const response = await fetch(`/api/admin/topic-types/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
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

      setSuggestions((prev) => prev.filter((item) => item.id !== id));

      setMessage(
        status === 'APPROVED'
          ? 'نوع تأیید شد و به پیشنهادهای موضوع اضافه شد.'
          : 'نوع رد شد.'
      );
    } catch {
      setError('عملیات ممکن نشد.');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="mt-8">
      {message ? (
        <div className="mb-4 rounded-2xl bg-turquoise-600/10 p-3 text-sm text-turquoise-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {suggestions.length === 0 ? (
        <div className="rounded-3xl bg-white p-6 text-sm text-ink-600 ring-1 ring-ink-900/[0.06]">
          نوع جدیدی در انتظار بررسی وجود ندارد.
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => (
            <article
              key={suggestion.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06] md:p-6"
            >
              <div className="min-w-0">
                <h2 className="font-display text-xl text-ink-900">
                  {suggestion.label}
                </h2>
                <p className="mt-1 text-xs text-ink-400">
                  ثبت شده در {formatPersianDate(suggestion.submittedAt)}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => updateStatus(suggestion.id, 'APPROVED')}
                  disabled={loadingId === suggestion.id}
                  className="rounded-full bg-turquoise-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-turquoise-700 disabled:pointer-events-none disabled:opacity-40"
                >
                  تأیید
                </button>

                <button
                  type="button"
                  onClick={() => updateStatus(suggestion.id, 'REJECTED')}
                  disabled={loadingId === suggestion.id}
                  className="rounded-full bg-red-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-40"
                >
                  رد
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
