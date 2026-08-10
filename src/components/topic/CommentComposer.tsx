'use client';

import { useEffect } from 'react';
import { XIcon } from '@/components/icons';
import { CommentForm } from '@/components/topic/CommentForm';

interface CommentComposerProps {
  /** Whether the composer overlay is open. */
  open: boolean;
  /** Close the overlay (backdrop / X / Escape). */
  onClose: () => void;
  topicId: string;
  /** Whether a 1–5 star rating is required (true on APPROVED pages). */
  requireRating?: boolean;
  /** Controlled rating shared with the hero/bottom rating controls. */
  rating?: number;
  onRatingChange?: (value: number) => void;
  /** Increment to request focus on the textarea (e.g. after verification). */
  focusNonce?: number;
  /** Called with the created comment so the parent can update state live. */
  onSubmitted?: (comment: {
    id: string;
    body: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    createdAt: string;
  }) => void;
}

/**
 * Lightweight comment composer overlay. On mobile it slides up as a bottom
 * sheet; on desktop it appears as a centered modal above a darkened backdrop.
 * It reuses the existing CommentForm (rating selector + textarea + submit),
 * so there is no second rating system — the rating state stays controlled by
 * the parent (the hero and bottom rating controls share the same value).
 */
export function CommentComposer({
  open,
  onClose,
  topicId,
  requireRating = false,
  rating = 0,
  onRatingChange,
  focusNonce = 0,
  onSubmitted,
}: CommentComposerProps) {
  // Escape closes the composer; body scroll is locked while it is open.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ثبت نظر"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-5"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-display text-lg text-ink-900">ثبت نظر</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="grid size-8 place-items-center rounded-full bg-ink-900/5 text-ink-600 transition-colors hover:bg-ink-900/10"
          >
            <XIcon strokeWidth={2.4} className="size-4" />
          </button>
        </div>

        <p className="mb-3 text-[12px] leading-6 text-ink-500">
          نظر شما پس از تأیید مدیریت نمایش داده می‌شود.
        </p>

        <CommentForm
          topicId={topicId}
          requireRating={requireRating}
          rating={rating}
          onRatingChange={onRatingChange}
          focusNonce={focusNonce}
          onSubmitted={onSubmitted}
        />
      </div>
    </div>
  );
}
