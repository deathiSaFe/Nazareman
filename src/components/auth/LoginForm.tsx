'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[15px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

/**
 * Phone sign-in / register. Development mode shows the stub code returned by
 * /api/auth/request-code so the flow is testable without an SMS provider.
 * After a successful verification the user is sent back to `next` (the page
 * they came from, e.g. /add-topic) instead of the profile.
 */
export function LoginForm({ next }: { next?: string | null }) {
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

      router.push(next || '/profile');
      router.refresh();
    } catch {
      setError('ورود ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={step === 'phone' ? handleRequestCode : handleVerify}
      className="rounded-3xl bg-white p-6 ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)] md:p-8"
      noValidate
    >
      <h1 className="font-display text-2xl text-ink-900">ورود / ثبت‌نام</h1>

      <p className="mt-2 text-sm leading-6 text-ink-600">
        {step === 'phone'
          ? 'شماره موبایل خود را وارد کنید تا کد تأیید دریافت کنید.'
          : `کد تأیید ارسال‌شده به ${phoneNumber} را وارد کنید.`}
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
      ) : (
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
            : 'ورود'}
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
    </form>
  );
}
