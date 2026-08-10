import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getAdmin } from '@/lib/authorization';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AdminOwnershipRequestClient } from '@/components/admin/AdminOwnershipRequestClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'بررسی درخواست‌های مالکیت - نظرمن',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'در انتظار بررسی',
  CHANGES_REQUESTED: 'نیاز به اصلاح',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
};

function formatPersianDate(value: Date): string {
  try {
    return value.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default async function AdminOwnershipRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const selectedStatus =
    status === 'APPROVED' || status === 'REJECTED' || status === 'CHANGES_REQUESTED'
      ? status
      : 'PENDING_REVIEW';

  const requests = await prisma.ownershipRequest.findMany({
    where: { status: selectedStatus },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      evidence: true,
      evidenceUrl: true,
      status: true,
      decisionNote: true,
      createdAt: true,
      topic: {
        select: {
          id: true,
          slug: true,
          name: true,
          ownerships: { select: { id: true } },
        },
      },
      user: {
        select: {
          displayName: true,
          phoneNumber: true,
        },
      },
    },
  });

  const admin = await getAdmin();

  if (!admin) {
    return <AdminLoginForm />;
  }

  const statusTabs = [
    { key: 'PENDING_REVIEW', label: 'در انتظار بررسی' },
    { key: 'CHANGES_REQUESTED', label: 'نیاز به اصلاح' },
    { key: 'APPROVED', label: 'تأیید شده' },
    { key: 'REJECTED', label: 'رد شده' },
  ];

  return (
    <main className="min-h-screen bg-paper pb-16">
      <div className="mx-auto w-full max-w-4xl px-5 py-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-turquoise-700 transition-colors hover:bg-turquoise-600/10"
        >
          بازگشت به مدیریت
        </Link>

        <header className="mt-6">
          <h1 className="font-display text-3xl text-ink-900">درخواست‌های مالکیت</h1>
          <p className="mt-2 text-sm text-ink-600">
            بررسی درخواست‌های کاربران برای مالکیت صفحه‌ها
          </p>
        </header>

        <div className="mt-6 flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/admin/ownership-requests?status=${tab.key}`}
              className={`rounded-full px-4 py-2 text-[13px] font-bold transition-colors ${
                selectedStatus === tab.key
                  ? 'bg-turquoise-600 text-white'
                  : 'bg-white text-ink-600 ring-1 ring-ink-900/10 hover:bg-ink-900/5'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {requests.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-6 text-sm text-ink-600 ring-1 ring-ink-900/[0.06]">
            درخواستی در این وضعیت وجود ندارد.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {requests.map((request) => (
              <article key={request.id} className="rounded-3xl bg-white p-5 ring-1 ring-ink-900/[0.06]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-ink-900">{request.topic.name}</h2>
                  <Link
                    href={`/topic/${request.topic.slug ?? request.topic.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-medium text-turquoise-700 underline underline-offset-4"
                  >
                    مشاهده صفحه
                  </Link>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
                  <span className="rounded-full bg-turquoise-600/10 px-3 py-0.5 font-bold text-turquoise-700">
                    {STATUS_LABELS[request.status] ?? request.status}
                  </span>
                  <span>درخواست‌دهنده: {request.user.displayName ?? request.user.phoneNumber}</span>
                  <span>تعداد مالکان فعلی: {request.topic.ownerships.length}</span>
                  <span>{formatPersianDate(request.createdAt)}</span>
                </div>

                <div className="mt-3 rounded-2xl bg-ink-900/[0.02] p-3 ring-1 ring-ink-900/[0.06]">
                  <p className="text-[11px] font-bold text-ink-400">دلیل درخواست</p>
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-ink-700">
                    {request.evidence}
                  </p>
                  {request.evidenceUrl && (
                    <a
                      href={request.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="mt-1 inline-block break-all text-[12px] font-medium text-turquoise-700 underline underline-offset-4"
                    >
                      {request.evidenceUrl}
                    </a>
                  )}
                </div>

                {selectedStatus !== 'PENDING_REVIEW' && request.decisionNote && (
                  <p className="mt-3 rounded-xl bg-saffron-50 p-3 text-[13px] leading-6 text-ink-700">
                    <span className="font-bold text-saffron-700">پیام مدیر: </span>
                    {request.decisionNote}
                  </p>
                )}

                {selectedStatus === 'PENDING_REVIEW' && (
                  <AdminOwnershipRequestClient requestId={request.id} />
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
