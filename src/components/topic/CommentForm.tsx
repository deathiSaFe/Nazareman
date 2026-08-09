'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface CommentFormProps {
  topicId: string;
  /** Called with the created comment so the parent can update state live. */
  onSubmitted?: (comment: {
    id: string;
    body: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
  }) => void;
}

export function CommentForm({ topicId, onSubmitted }: CommentFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (isSubmitting) return;

    setSuccessMessage(null);

    const trimmedBody = body.trim();

    if (!trimmedBody) {
      setError('متن نظر الزامی است.');
      return;
    }

    if (trimmedBody.length < 5) {
      setError('متن نظر باید حداقل ۵ حرف باشد.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/topics/${encodeURIComponent(topicId)}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            body: trimmedBody,
          }),
        }
      );

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        setError('رمز مدیریت معتبر نیست.');
        return;
      }

      if (!response.ok) {
        setError(payload?.error ?? 'ارسال نظر ممکن نشد.');
        return;
      }

      setBody('');
      setSuccessMessage(payload?.message ?? 'نظر شما برای بررسی ارسال شد.');

      onSubmitted?.({
        id: String(payload?.commentId ?? ''),
        body: trimmedBody,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      // Give the page back to the tour after a successful submission.
      textareaRef.current?.blur();
      router.refresh();
    } catch {
      setError('ارسال نظر ممکن نشد.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-3 border-t border-ink-900/[0.08] pt-3"
    >
      <textarea
        id="comment-body"
        ref={textareaRef}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);

          if (error) {
            setError(null);
          }

          if (successMessage) {
            setSuccessMessage(null);
          }
        }}
        rows={3}
        placeholder="نظر خود را بنویسید..."
        aria-label="متن نظر"
        disabled={isSubmitting}
        className="w-full resize-none rounded-xl border border-ink-200 bg-paper p-3 text-[14px] leading-6 text-ink-900 caret-turquoise-700 outline-none transition-shadow placeholder:text-ink-400 focus:ring-2 focus:ring-turquoise-500 disabled:opacity-60"
      />

      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] text-red-600">
          {error}
        </p>
      ) : null}

      {successMessage ? (
        <div role="status" className="mt-2 rounded-xl bg-turquoise-600/10 px-3 py-2">
          <p className="text-[13px] font-bold text-turquoise-700">
            {successMessage}
          </p>
          <p className="mt-0.5 text-[11px] text-turquoise-600">
            نظر شما پس از تأیید مدیریت برای دیگران قابل مشاهده خواهد بود.
          </p>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-400">
          نظر شما پس از تأیید مدیریت نمایش داده می‌شود.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-turquoise-600 px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        >
          {isSubmitting ? 'در حال ثبت...' : 'ثبت نظر'}
        </button>
      </div>
    </form>
  );
}
