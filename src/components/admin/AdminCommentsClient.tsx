'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrashIcon } from '@/components/icons';

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[14px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

type CommentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export function AdminCommentsClient({
  commentId,
  initialBody,
  status,
  topicSlug,
  topicId,
}: {
  commentId: string;
  initialBody: string;
  status: CommentStatus;
  /** Optional public slug for the «مشاهده صفحه» link. */
  topicSlug: string | null;
  topicId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function moderate(changes: { status?: CommentStatus; body?: string }) {
    setMessage(null);
    setError(null);
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
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

      setEditing(false);
      setMessage(
        changes.status === 'APPROVED'
          ? 'نظر تأیید شد.'
          : changes.status === 'REJECTED'
            ? 'نظر رد شد.'
            : 'متن نظر ویرایش شد.'
      );
      window.setTimeout(() => router.refresh(), 800);
    } catch {
      setError('عملیات ممکن نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('این نظر برای همیشه حذف شود؟')) return;

    setMessage(null);
    setError(null);
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/comments/${commentId}`, {
        method: 'DELETE',
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        setError('رمز مدیریت معتبر نیست.');
        return;
      }

      if (!response.ok) {
        setError(payload?.error ?? 'حذف ممکن نشد.');
        return;
      }

      router.refresh();
    } catch {
      setError('حذف ممکن نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-ink-900/[0.06] pt-3">
      {editing ? (
        <div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void moderate({ body: body.trim() })}
              disabled={busy || !body.trim()}
              className="rounded-full bg-turquoise-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-turquoise-700 disabled:opacity-40"
            >
              ذخیره
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setBody(initialBody);
              }}
              disabled={busy}
              className="rounded-full bg-white px-5 py-2 text-xs font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5 disabled:opacity-40"
            >
              انصراف
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {status !== 'APPROVED' && (
            <button
              type="button"
              onClick={() => void moderate({ status: 'APPROVED' })}
              disabled={busy}
              className="rounded-full bg-turquoise-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-turquoise-700 disabled:opacity-40"
            >
              تأیید
            </button>
          )}
          {status !== 'REJECTED' && (
            <button
              type="button"
              onClick={() => void moderate({ status: 'REJECTED' })}
              disabled={busy}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              رد
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5 disabled:opacity-40"
          >
            ویرایش
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-40"
          >
            <TrashIcon strokeWidth={2.2} className="size-3.5" />
            حذف
          </button>

          <a
            href={`/topic/${topicSlug ?? topicId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ms-auto text-[12px] font-medium text-ink-500 underline underline-offset-4 transition-colors hover:text-turquoise-700"
          >
            مشاهده صفحه
          </a>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-xl bg-red-50 p-2 text-[12px] font-bold text-red-700">{error}</p>
      )}
      {message && (
        <p className="mt-2 rounded-xl bg-turquoise-600/10 p-2 text-[12px] font-bold text-turquoise-700">
          {message}
        </p>
      )}
    </div>
  );
}
