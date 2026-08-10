'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type RequestStatus = 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';

interface OwnRequest {
  id: string;
  status: RequestStatus;
  decisionNote: string | null;
}

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[14px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

export function OwnershipRequestPanel({
  topicId,
  canRequest,
  isOwner,
  request,
  autoOpenForm = false,
}: {
  topicId: string;
  canRequest: boolean;
  isOwner: boolean;
  request: OwnRequest | null;
  /** When true (e.g. opened from a modal overlay) the claim form is shown
   *  immediately instead of the «درخواست مالکیت صفحه» trigger button. */
  autoOpenForm?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(autoOpenForm);
  const [evidence, setEvidence] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!canRequest || topicId === '') return null;

  function openNewForm() {
    setEvidence('');
    setEvidenceUrl('');
    setError(null);
    setMessage(null);
    setFormOpen(true);
  }

  function openEditForm(currentEvidence: string, currentUrl: string | null) {
    setEvidence(currentEvidence ?? '');
    setEvidenceUrl(currentUrl ?? '');
    setError(null);
    setMessage(null);
    setFormOpen(true);
  }

  /** Client-side validation mirrors the server rules so the user gets a clear
   *  Persian message instead of the generic server "Invalid input.". */
  function validate(): string | null {
    const trimmedEvidence = evidence.trim();
    const trimmedUrl = evidenceUrl.trim();

    if (!trimmedEvidence) {
      return 'دلیل درخواست مالکیت را وارد کنید.';
    }
    if (trimmedEvidence.length < 5) {
      return 'دلیل درخواست باید حداقل ۵ نویسه باشد.';
    }
    if (trimmedEvidence.length > 2000) {
      return 'دلیل درخواست باید حداکثر ۲۰۰۰ نویسه باشد.';
    }
    if (trimmedUrl) {
      if (trimmedUrl.length > 500) {
        return 'لینک مدرک باید حداکثر ۵۰۰ نویسه باشد.';
      }
      try {
        const url = new URL(trimmedUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return 'لینک مدرک باید یک URL معتبر http(s) باشد.';
        }
      } catch {
        return 'لینک مدرک باید یک URL معتبر http(s) باشد.';
      }
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const isResubmit = request?.status === 'CHANGES_REQUESTED';
    const url = isResubmit
      ? `/api/topics/${encodeURIComponent(topicId)}/ownership-requests/${request.id}`
      : `/api/topics/${encodeURIComponent(topicId)}/ownership-requests`;

    try {
      const response = await fetch(url, {
        method: isResubmit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence: evidence.trim(), evidenceUrl: evidenceUrl.trim() }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // Surface the server's real reasons (they live in `details`).
        const details =
          payload?.details && Array.isArray(payload.details)
            ? (payload.details as string[])
            : [];
        setError(
          details.length > 0 ? details.join(' ') : (payload?.error ?? 'ثبت درخواست ممکن نشد.')
        );
        return;
      }

      setMessage(isResubmit ? 'درخواست اصلاح‌شده برای بررسی ارسال شد.' : 'درخواست مالکیت شما ثبت شد و توسط مدیر بررسی خواهد شد.');
      setFormOpen(false);
      router.refresh();
    } catch {
      setError('ثبت درخواست ممکن نشد.');
    } finally {
      setSubmitting(false);
    }
  }

  // Owner — no claim UI.
  if (isOwner) {
    return (
      <div className="flex items-center gap-2 rounded-3xl bg-emerald-600/10 p-4 ring-1 ring-emerald-600/20">
        <span className="text-[13px] font-bold text-emerald-700">مالک صفحه هستید</span>
      </div>
    );
  }

  // Pending review.
  if (request?.status === 'PENDING_REVIEW') {
    return (
      <div className="rounded-3xl bg-white p-4 ring-1 ring-ink-900/[0.06]">
        <p className="text-[13px] font-bold text-ink-700">درخواست مالکیت شما در حال بررسی است.</p>
        <p className="mt-1 text-[12px] text-ink-500">پس از بررسی مدیر نتیجه اطلاع‌رسانی می‌شود.</p>
      </div>
    );
  }

  // Needs changes.
  if (request?.status === 'CHANGES_REQUESTED') {
    return (
      <div className="rounded-3xl bg-saffron-50 p-4 ring-1 ring-saffron-200/60">
        <p className="text-[13px] font-bold text-saffron-700">مدیر درخواست اطلاعات بیشتری دارد.</p>
        {request.decisionNote && (
          <p className="mt-1 text-[13px] leading-6 text-ink-700">پیام مدیر: {request.decisionNote}</p>
        )}

        {!formOpen ? (
          <button
            type="button"
            onClick={() => openEditForm('', '')}
            className="mt-3 rounded-full bg-white px-5 py-2 text-[13px] font-bold text-saffron-700 ring-1 ring-saffron-300 transition-colors hover:bg-saffron-100"
          >
            اصلاح و ارسال مجدد
          </button>
        ) : null}
      </div>
    );
  }

  // Rejected — allow a fresh request.
  if (request?.status === 'REJECTED') {
    return (
      <div className="rounded-3xl bg-red-50 p-4 ring-1 ring-red-200/60">
        <p className="text-[13px] font-bold text-red-700">درخواست مالکیت شما رد شده است.</p>
        {request.decisionNote && (
          <p className="mt-1 text-[13px] leading-6 text-ink-700">دلیل رد: {request.decisionNote}</p>
        )}
        {!formOpen && (
          <button
            type="button"
            onClick={openNewForm}
            className="mt-3 rounded-full bg-white px-5 py-2 text-[13px] font-bold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50"
          >
            ثبت درخواست جدید
          </button>
        )}
      </div>
    );
  }

  // No request / approved request (not owner) — show the claim button.
  if (request?.status === 'APPROVED' && !isOwner) {
    // Request was approved but no ownership row exists (should not happen) —
    // fall through to the claim form.
  }

  return (
    <div>
      {!formOpen ? (
        <button
          type="button"
          onClick={openNewForm}
          className="w-full rounded-full bg-white px-7 py-3 text-[15px] font-bold text-turquoise-700 ring-1 ring-turquoise-200 transition-all duration-200 hover:bg-turquoise-50"
        >
          درخواست مالکیت صفحه
        </button>
      ) : (
        <div className="space-y-4 rounded-3xl bg-white p-4 ring-1 ring-ink-900/[0.06]">
          <div>
            <p className="text-[13px] font-bold text-ink-900">درخواست مالکیت صفحه</p>
            <p className="mt-1 text-[12px] leading-6 text-ink-500">
              درخواست شما توسط مدیر بررسی خواهد شد.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-[13px] font-bold text-ink-900">دلیل درخواست مالکیت</span>
            <textarea
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              rows={3}
              placeholder="مثلاً: مدیر این مجموعه هستم."
              className={`${inputClass} resize-y leading-7`}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[13px] font-bold text-ink-900">
              لینک مدرک یا صفحه مرتبط (اختیاری)
            </span>
            <input
              type="text"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
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

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="flex-1 rounded-full bg-turquoise-600 px-6 py-3 text-[14px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all duration-200 hover:bg-turquoise-700 disabled:opacity-50"
            >
              {submitting ? 'در حال ارسال...' : 'ارسال درخواست'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              disabled={submitting}
              className="rounded-full bg-white px-6 py-3 text-[14px] font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5 disabled:opacity-50"
            >
              انصراف
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
