import Link from 'next/link';
import { headers } from 'next/headers';
import { getInternalBaseUrl } from '@/lib/base-url';
import { primaryTypeLabel, topicHref } from '@/types/topic';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'موضوعات - نظرمن',
};

type ApiProvince = {
  name: string;
  slug: string;
};

type ApiCity = {
  id: string;
  name: string;
  slug: string;
  province: ApiProvince;
};

type ApiTopicType = {
  id: string;
  label: string;
  kind: 'PRIMARY' | 'SECONDARY';
};

type ApiTopic = {
  id: string;
  slug: string;
  name: string;
  types: ApiTopicType[];
  description: string;
  imageUrl: string | null;
  createdAt: string;
  city: ApiCity | null;
};

function getCityLabel(topic: ApiTopic): string {
  const parts = [topic.city?.name, topic.city?.province?.name].filter(Boolean);

  if (parts.length === 0) {
    return 'بدون شهر';
  }

  return parts.join(' · ');
}

export default async function TopicsPage() {
  const headersList = await headers();

  const baseUrl = getInternalBaseUrl(headersList);

  let topics: ApiTopic[] = [];
  let fetchFailed = false;

  try {
    const response = await fetch(`${baseUrl}/api/topics?limit=100`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      fetchFailed = true;
    } else {
      const payload = await response.json();
      topics = payload.topics ?? payload.data ?? [];
    }
  } catch {
    fetchFailed = true;
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto w-full max-w-6xl px-5 py-10">
        <header>
          <h1 className="font-display text-3xl text-ink-900">موضوعات</h1>
          <p className="mt-2 text-sm text-ink-600">
            فهرست موضوعات تأییدشده در نظرمن
          </p>
        </header>

        {fetchFailed ? (
          <div className="mt-10 rounded-3xl bg-white p-8 text-center text-ink-600 ring-1 ring-ink-900/[0.06]">
            دریافت موضوعات ممکن نشد.
          </div>
        ) : topics.length === 0 ? (
          <div className="mt-10 rounded-3xl bg-white p-8 text-center text-ink-600 ring-1 ring-ink-900/[0.06]">
            هنوز موضوعی یافت نشد.
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => (
              <Link
                key={topic.id}
                href={topicHref(topic)}
                className="block overflow-hidden rounded-3xl bg-white ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(26,99,93,0.45)]"
              >
                {topic.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={topic.imageUrl}
                      alt={topic.name}
                      loading="lazy"
                      className="h-40 w-full object-cover"
                    />
                  </>
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-turquoise-50 text-sm font-medium text-turquoise-700">
                    تصویر ندارد
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl text-ink-900">
                      {topic.name}
                    </h2>

                    <span className="shrink-0 rounded-full bg-turquoise-600/10 px-3 py-1 text-xs font-bold text-turquoise-700">
                      {primaryTypeLabel(topic.types.map((type) => type.label))}
                    </span>
                  </div>

                  {topic.types.length > 1 && (
                    <p className="mt-1 text-xs font-medium text-ink-400">
                      {topic.types.slice(1).map((type) => type.label).join('، ')}
                    </p>
                  )}

                  <p className="mt-1 text-sm text-ink-500">
                    {getCityLabel(topic)}
                  </p>

                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-700">
                    {topic.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
