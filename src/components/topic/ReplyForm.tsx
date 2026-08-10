'use client';

import { useRef, useState, type FormEvent } from 'react';

interface ReplyFormProps {
  topicId: string;
  commentId: string;
  /** Called with the created reply so the parent can update state live. */
  onSubmitted?: (reply: {
    id: string;
    body: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    parentId: string;
  }) => void;
  onCancel?: () => void;
}

export function ReplyForm({ topicId, commentId, onSubmitted, onCancel }: ReplyFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (isSubmitting) return;

    const trimmedBody = body.trim();

    if (!trimmedBody) {
      setError('متن پاسخ الزامی است.');
      return;
    }

    if (trimmedBody.length < 5) {
      setError('متن پاسخ باید حداقل ۵ حرف باشد.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/topics/${encodeURIComponent(topicId)}/comments/${commentId}/replies`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body: trimmedBody }),
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? 'ارسال پاسخ ممکن نشد.');
        return;
      }

      setBody('');
      onSubmitted?.({
        id: String(payload?.commentId ?? ''),
        body: trimmedBody,
        status: 'PENDING_REVIEW',
        createdAt: new Date().toISOString(),
        parentId: commentId,
      });
      onCancel?.();
    } catch {
      setError('ارسال پاسخ ممکن نشد.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        placeholder="پاسخ خود را بنویسید..."
        aria-label="متن پاسخ"
        autoFocus
        className="w-full resize-none rounded-xl border border-ink-200 bg-paper p-3 text-[13px] leading-6 text-ink-900 caret-turquoise-700 outline-none transition-shadow placeholder:text-ink-400 focus:ring-2 focus:ring-turquoise-500"
      />

      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-turquoise-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-turquoise-700 disabled:pointer-events-none disabled:opacity-40"
        >
          {isSubmitting ? 'در حال ثبت...' : 'ثبت پاسخ'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-full bg-white px-5 py-2 text-xs font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5"
          >
            انصراف
          </button>
        )}
      </div>
    </form>
  );
}
