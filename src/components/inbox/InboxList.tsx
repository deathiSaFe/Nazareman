'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toPersianDigits } from '@/lib/persian-digits';

interface InboxItem {
  id: string;
  kind: 'SUBMISSION_DECISION' | 'SUGGESTION_DECISION' | 'OWNERSHIP_DECISION';
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  topic: { id: string; slug: string | null; name: string; status: string } | null;
}

const KIND_LABELS: Record<InboxItem['kind'], string> = {
  SUBMISSION_DECISION: 'بررسی صفحه',
  SUGGESTION_DECISION: 'پیشنهاد',
  OWNERSHIP_DECISION: 'مالکیت',
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

/** The page context a message points back to. */
function contextHref(item: InboxItem): string {
  if (!item.topic) return '/';
  return `/topic/${item.topic.slug ?? item.topic.id}`;
}

export function InboxList({ messages, unread: initialUnread }: { messages: InboxItem[]; unread: number }) {
  const router = useRouter();
  const [items, setItems] = useState(messages);
  const [unread, setUnread] = useState(initialUnread);

  async function openMessage(item: InboxItem) {
    if (!item.readAt) {
      // Optimistic local update; the server enforces ownership.
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, readAt: new Date().toISOString() } : m)));
      setUnread((count) => Math.max(0, count - 1));
      try {
        await fetch(`/api/notifications/${item.id}/read`, { method: 'POST' }).catch(() => undefined);
      } catch {
        // The message still opens; the badge updates on the next page load.
      }
    }
    router.push(contextHref(item));
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-ink-900">صندوق پیام‌ها</h1>
        {unread > 0 && (
          <span className="rounded-full bg-red-600/10 px-3 py-1 text-[12px] font-bold text-red-700">
            {toPersianDigits(unread)} پیام خوانده‌نشده
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-white p-8 text-center text-sm leading-7 text-ink-600 ring-1 ring-ink-900/[0.06]">
          پیامی ندارید. پاسخ‌های مدیر به درخواست‌های شما (صفحه، پیشنهاد و مالکیت) اینجا نمایش داده می‌شود.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void openMessage(item)}
                className={`w-full rounded-3xl p-5 text-start ring-1 transition-colors ${
                  item.readAt
                    ? 'bg-white ring-ink-900/[0.06]'
                    : 'bg-turquoise-600/[0.04] ring-turquoise-600/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-red-500'}`}
                    aria-hidden
                  />
                  <span className="rounded-full bg-ink-900/5 px-2.5 py-0.5 text-[11px] font-bold text-ink-500">
                    {KIND_LABELS[item.kind]}
                  </span>
                  <span className="text-[12px] text-ink-400">{formatPersianDate(item.createdAt)}</span>
                </div>

                <p
                  className={`mt-2 text-[15px] ${item.readAt ? 'font-semibold text-ink-800' : 'font-bold text-ink-900'}`}
                >
                  {item.title}
                </p>

                {item.topic && (
                  <p className="mt-0.5 text-[12px] font-medium text-turquoise-700">
                    {item.topic.name}
                  </p>
                )}

                <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-6 text-ink-600">
                  {item.body}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
