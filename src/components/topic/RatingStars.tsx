'use client';

import { toPersianDecimal, toPersianDigits } from '@/lib/persian-digits';

/**
 * Render ★★★★★ for an average on a 5-star scale with FRACTIONAL fill, so the
 * visual stars always correspond to the numeric rating:
 *
 *   3   → ★★★☆☆
 *   3.4 → ★★★ + 40%-filled fourth star + empty fifth
 *   3.5 → ★★★ + half-filled fourth star + empty fifth
 *   4.7 → ★★★★ + 70%-filled fifth star
 *   5   → ★★★★★
 *
 * Read-only display (aggregate / per-comment author rating). The interactive
 * StarInput below keeps whole-star selection.
 */
export function StarRow({ value, className = 'text-[13px]' }: { value: number | null; className?: string }) {
  const safe = value === null ? 0 : Math.max(0, Math.min(5, value));

  return (
    <span
      dir="ltr"
      role="img"
      aria-label={`میانگین امتیاز ${toPersianDecimal(safe)} از ۵`}
      className={`inline-flex items-center leading-none ${className}`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        // The fraction of THIS star that is filled (0..1): 3.4 → star 4 = 0.4.
        const fill = Math.max(0, Math.min(1, safe - (star - 1)));
        return (
          <span
            key={star}
            className="relative inline-block"
            style={{ width: '1em', height: '1em' }}
            aria-hidden
          >
            <span className="absolute inset-0 text-ink-300">★</span>
            {fill > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden text-amber-500"
                style={{ width: `${Math.round(fill * 100)}%` }}
              >
                <span className="block" style={{ width: '1em' }}>
                  ★
                </span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Interactive 1–5 star selector. */
export function StarInput({
  value,
  onChange,
  size = 'text-2xl',
}: {
  value: number;
  onChange: (value: number) => void;
  size?: string;
}) {
  return (
    <div dir="ltr" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          aria-label={`امتیاز ${toPersianDigits(star)}`}
          className={`${size} leading-none transition-transform hover:scale-110 ${
            star <= value ? 'text-amber-500' : 'text-ink-300'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
