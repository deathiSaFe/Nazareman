'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  activityAreaLabel,
  type ActivityAreaValue,
  type DuplicateTopic,
  type SelectedTopicType,
} from '@/types/topic';
import { TopicTypesField } from './TopicTypesField';
import { ActivityAreaPicker } from './ActivityAreaPicker';
import { DuplicateReviewPanel } from './DuplicateReviewPanel';
import { ConfirmationForm } from './ConfirmationForm';

interface AddTopicFlowProps {
  className?: string;
  initialName?: string;
}

type Step = 'identity' | 'review' | 'details';

const NAME_EXAMPLES = [
  'علی مکانیکی',
  'رستوران حاج رضا',
  'کتاب‌فروشی مهر',
  'دکتر احمدی',
  'مدرسه فرهنگ',
  'کافی‌شاپ آفتاب',
  'فروشگاه موبایل پارس',
];

const ROTATE_INTERVAL_MS = 4000;

const fieldLabelClass = 'mb-2 block text-[13px] font-bold text-ink-900';

// Matches the type field's bar height / radius / text size exactly.
const nameInputClass =
  'h-14 w-full rounded-[22px] bg-white px-5 text-[15px] font-medium text-ink-900 caret-turquoise-700 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:shadow-[0_10px_28px_-12px_rgba(26,99,93,0.35)] focus:ring-2 focus:ring-turquoise-600/70';

export function AddTopicFlow({ className = '', initialName = '' }: AddTopicFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>('identity');

  // Identity
  const [name, setName] = useState(initialName);
  const [types, setTypes] = useState<SelectedTopicType[]>([]);
  const [activity, setActivity] = useState<ActivityAreaValue>({
    scope: 'NATIONAL',
  });
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Duplicate detection
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateTopic[]>([]);

  // Creation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Rotating name placeholder
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % NAME_EXAMPLES.length);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  // Open each new step at the top of the page. `scrollIntoView` would align
  // the flow's top to the viewport top, hiding it under the sticky header —
  // so reset the window scroll instead.
  useEffect(() => {
    if (step === 'identity') return;
    window.scrollTo(0, 0);
  }, [step]);

  function validateIdentity(): string | null {
    if (!name.trim()) return 'نام موضوع را وارد کنید.';

    if (types.length === 0) return 'نوع موضوع را انتخاب کنید.';

    if (activity.scope === 'PROVINCE' && !activity.provinceSlug) {
      return 'استان را انتخاب کنید.';
    }

    if (
      (activity.scope === 'CITY' || activity.scope === 'ADDRESS') &&
      !activity.provinceSlug
    ) {
      return 'استان را انتخاب کنید.';
    }

    if (
      (activity.scope === 'CITY' || activity.scope === 'ADDRESS') &&
      !activity.citySlug
    ) {
      return 'شهر را انتخاب کنید.';
    }

    if (activity.scope === 'ADDRESS' && !activity.address?.trim()) {
      return 'نشانی خیابان را وارد کنید.';
    }

    return null;
  }

  async function handleContinue() {
    const validationError = validateIdentity();

    if (validationError) {
      setIdentityError(validationError);
      return;
    }

    setIdentityError(null);
    setChecking(true);

    try {
      const response = await fetch('/api/topics/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          types: types.map((type) => type.label),
          scope: activity.scope,
          provinceSlug: activity.provinceSlug,
          citySlug: activity.citySlug,
        }),
      });

      if (!response.ok) {
        throw new Error('Duplicate check failed');
      }

      const payload = await response.json();
      const matches: DuplicateTopic[] = payload.duplicates ?? [];

      if (matches.length > 0) {
        setDuplicates(matches);
        setStep('review');
      } else {
        setStep('details');
      }
    } catch {
      // Never block the user — if the duplicate check fails, continue.
      setStep('details');
    } finally {
      setChecking(false);
    }
  }

  function handleOpenTopic(duplicate: DuplicateTopic) {
    router.push(
      `/topic/${duplicate.status === 'APPROVED' ? duplicate.slug : duplicate.id}`
    );
  }

  async function handleSubmit() {
    setSubmitError(null);
    setIsSubmitting(true);

    const payload = {
      name: name.trim(),
      types: types.map((type) => ({ label: type.label, kind: type.kind })),
      scope: activity.scope,
      provinceSlug: activity.provinceSlug,
      citySlug: activity.citySlug,
      address: activity.address?.trim(),
    };

    try {
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'خطا در ایجاد صفحه');
      }

      router.push(`/topic/${data.topicId}`);
    } catch (error) {
      console.error(error);
      setSubmitError('خطایی در ایجاد صفحه رخ داد. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={className}>
      {step === 'identity' && (
        <form onSubmit={(event) => {
          event.preventDefault();
          void handleContinue();
        }} noValidate>
          <div className="space-y-4">
            <label className="block">
              <span className={fieldLabelClass}>نام موضوع</span>
              <input
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setIdentityError(null);
                }}
                placeholder={NAME_EXAMPLES[placeholderIndex]}
                aria-label="نام موضوع"
                enterKeyHint="next"
                autoComplete="off"
                className={nameInputClass}
              />
            </label>

            <TopicTypesField
              value={types}
              onChange={(next) => {
                setTypes(next);
                setIdentityError(null);
              }}
              onQueryChange={() => setIdentityError(null)}
            />

            <ActivityAreaPicker
              value={activity}
              onChange={(next) => {
                setActivity(next);
                setIdentityError(null);
              }}
            />
          </div>

          {identityError && (
            <p role="alert" className="mt-4 text-sm font-bold text-red-600">
              {identityError}
            </p>
          )}

          <button
            type="submit"
            disabled={checking}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-turquoise-600 px-7 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            {checking ? 'بررسی موضوع مشابه...' : 'ادامه'}
          </button>
        </form>
      )}

      {step === 'review' && (
        <DuplicateReviewPanel
          duplicates={duplicates}
          onSelect={handleOpenTopic}
          onContinue={() => setStep('details')}
          onBack={() => setStep('identity')}
          userEntry={{
            name: name.trim(),
            primaryType: types[0]?.label ?? '',
            secondaryTypes: types.slice(1).map((type) => type.label),
            locationLabel: activityAreaLabel(activity),
          }}
        />
      )}

      {step === 'details' && (
        <ConfirmationForm
          name={name.trim()}
          primaryType={types[0]?.label ?? ''}
          secondaryTypes={types.slice(1).map((type) => type.label)}
          locationLabel={activityAreaLabel(activity)}
          onSubmit={() => void handleSubmit()}
          onEdit={() => setStep('identity')}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}
    </div>
  );
}
