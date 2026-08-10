'use client';

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center ring-1 ring-ink-900/[0.06]">
        <h1 className="font-display text-2xl text-ink-900">
          خطا در پنل مدیریت
        </h1>
        <p className="mt-3 text-sm text-ink-600">
          متأسفانه مشکلی پیش آمد. لطفاً دوباره تلاش کنید.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-turquoise-600 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-turquoise-700"
        >
          تلاش مجدد
        </button>
      </div>
    </main>
  );
}