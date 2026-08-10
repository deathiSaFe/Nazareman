'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[15px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

type Step = 'phone' | 'code' | 'setup';

/**
 * Phone sign-in / register. One shared lightweight verification flow used
 * everywhere (login page, hamburger, add-topic, comment/rating/favorite/
 * suggestion/ownership intents). After verification the user is returned to
 * `next` (the page they came from, including the intended action).
 *
 * Brand-new users see a minimal one-time setup step: an optional display name
 * (a default avatar is applied automatically — no image URL required). Existing
 * users go straight back to `next`.
 */
export function LoginForm({ next }: { next?: string | null }) {
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [step, setStep] = useState<Step>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function continueTo(nextPath: string | null | undefined) {
    router.push(nextPath || '/profile');
    router.refresh();
  }

  async function handleRequestCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const value = phoneNumber.trim();
    if (!value) {
      setError('شماره موبایل را وارد کنید.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: value }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? 'درخواست کد ممکن نشد.');
        return;
      }

      setDevCode(data?.devCode ?? null);
      setStep('code');
    } catch {
      setError('درخواست کد ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const value = code.trim();
    if (!value) {
      setError('کد تأیید را وارد کنید.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim(), code: value }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? 'ورود ممکن نشد.');
        return;
      }

      // First-time users get a minimal setup step (display name, default
      // avatar) — existing users go straight to their destination.
      if (data?.isNewUser) {
        setStep('setup');
        return;
      }

      continueTo(next);
    } catch {
      setError('ورود ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const name = displayName.trim();
      if (name) {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setError(payload?.error ?? 'ذخیره نام ممکن نشد.');
          setLoading(false);
          return;
        }
      }

      // Avatar is a default (initial-letter) automatically — no URL required.
      continueTo(next);
    } catch {
      setError('ذخیره نام ممکن نشد.');
      setLoading(false);
    }
  }

  function skipSetup() {
    continueTo(next);
  }

  return (
    <form
      onSubmit={
        step === 'phone' ? handleRequestCode : step === 'code' ? handleVerify : handleSetup
      }
      className="rounded-3xl bg-white p-6 ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)] md:p-8"
      noValidate
    >
      <h1 className="font-display text-2xl text-ink-900">
        {step === 'setup' ? 'سلام! 👋' : 'ورود / ثبت‌نام'}
      </h1>

      <p className="mt-2 text-sm leading-6 text-ink-600">
        {step === 'phone'
          ? 'شماره موبایل خود را وارد کنید تا کد تأیید دریافت کنید.'
          : step === 'code'
            ? `کد تأیید ارسال‌شده به ${phoneNumber} را وارد کنید.`
            : 'یک نام برای نمایش در نظرات و پروفایل انتخاب کنید (اختیاری).'}
      </p>

      {step === 'phone' ? (
        <label className="mt-6 block">
          <span className="mb-2 block text-[13px] font-bold text-ink-900">شماره موبایل</span>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="0912..."
            dir="ltr"
            autoComplete="tel"
            className={inputClass}
          />
        </label>
      ) : step === 'code' ? (
        <label className="mt-6 block">
          <span className="mb-2 block text-[13px] font-bold text-ink-900">کد تأیید</span>
          {devCode && (
            <p className="mb-2 rounded-xl bg-turquoise-600/10 px-3 py-2 text-[13px] font-bold text-turquoise-700">
              کد آزمایشی (بدون ارسال پیامک): {devCode}
            </p>
          )}
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="کد ۶ رقمی"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            className={inputClass}
          />
        </label>
      ) : (
        <label className="mt-6 block">
          <span className="mb-2 block text-[13px] font-bold text-ink-900">نام نمایشی</span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="مثلاً: علی"
            maxLength={40}
            className={inputClass}
          />
          <span className="mt-2 block text-[12px] leading-6 text-ink-500">
            تصویر پیش‌فرض به‌صورت خودکار تنظیم می‌شود؛ بعداً می‌توانید از پروفایل تغییرش دهید.
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-full bg-turquoise-600 px-7 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
      >
        {loading
          ? 'در حال پردازش...'
          : step === 'phone'
            ? 'دریافت کد'
            : step === 'code'
              ? 'ورود'
              : 'ادامه'}
      </button>

      {step === 'code' && (
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setCode('');
            setError(null);
          }}
          className="mt-3 w-full text-center text-[13px] font-medium text-ink-500 underline underline-offset-4 transition-colors hover:text-turquoise-700"
        >
          تغییر شماره موبایل
        </button>
      )}

      {step === 'setup' && (
        <button
          type="button"
          onClick={skipSetup}
          disabled={loading}
          className="mt-3 w-full text-center text-[13px] font-medium text-ink-500 underline underline-offset-4 transition-colors hover:text-turquoise-700"
        >
          رد کردن این مرحله
        </button>
      )}
    </form>
  );
}
