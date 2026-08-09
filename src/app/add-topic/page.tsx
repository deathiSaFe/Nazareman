import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { AddTopicFlow } from '@/components/add-topic/AddTopicFlow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'افزودن موضوع جدید - نظرمن',
  description: 'موضوع جدیدی به نظرمن اضافه کنید',
};

export default async function AddTopicPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;

  const user = await getCurrentUser();

  // Adding a topic requires a signed-in, phone-verified user. Instead of an
  // intermediate prompt page, send the visitor straight to phone sign-in and
  // bring them back here afterwards (preserving any pre-filled name).
  if (!user || !user.phoneVerified) {
    const destination = name
      ? `/add-topic?name=${encodeURIComponent(name)}`
      : '/add-topic';

    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  return (
    <main className="min-h-screen bg-paper pb-10">
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <header className="mb-5 text-center">
          <p className="mx-auto max-w-md text-[15px] font-light leading-7 text-ink-600 md:text-base">
            موضوعی را معرفی کنید تا دیگران بتوانند درباره آن نظر بدهند.
          </p>
        </header>

        <AddTopicFlow initialName={name} />
      </div>
    </main>
  );
}
