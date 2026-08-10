'use client';

import { XIcon } from '@/components/icons';

interface OnboardingPopupProps {
  /** Dismiss the popup for the current editing session. */
  onClose: () => void;
}

/**
 * One-time informational nudge shown to the creator of a newly-created DRAFT
 * page. It encourages completing the page information and leaving the first
 * comment — it is NOT a step-by-step tour, and it never blocks the editing
 * controls permanently (it can be dismissed with the close button).
 */
export function OnboardingPopup({ onClose }: OnboardingPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="بستن"
          title="بستن"
          className="absolute end-4 top-4 grid size-8 place-items-center rounded-full text-ink-900/40 transition-colors hover:bg-ink-900/5 hover:text-ink-900/70"
        >
          <XIcon strokeWidth={2.4} className="size-4" />
        </button>

        <div className="mx-auto grid size-12 place-items-center rounded-full bg-turquoise-600/10">
          <span className="font-display text-xl text-turquoise-700">✦</span>
        </div>

        <h2 className="mt-4 font-display text-xl leading-8 text-ink-900">
          صفحه‌تان را کامل‌تر کنید
        </h2>

        <p className="mt-3 text-[13px] leading-6 text-ink-600">
          اطلاعات صفحه را تا حد امکان کامل کنید تا صفحه برای دیگران مفیدتر باشد و اولین
          نفری باشید که درباره این موضوع نظر می‌دهد.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-turquoise-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97]"
        >
          باشه
        </button>
      </div>
    </div>
  );
}
