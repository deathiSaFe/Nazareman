import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { PageView } from '@/components/page/PageView';
import { getInternalBaseUrl } from '@/lib/base-url';
import type { PageData, PageLink } from '@/types/topic';

export const dynamic = 'force-dynamic';

export default async function TopicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { id } = await params;
  const { action } = await searchParams;

  // Normalize the path param. Non-ASCII segments (Persian slugs) can arrive
  // percent-encoded; decode once so the API lookup is stable. UUIDs and
  // slugs contain no literal `%`, so this is safe for both forms.
  const identifier = decodeURIComponent(id);

  const headersList = await headers();
  const baseUrl = getInternalBaseUrl(headersList);

  let response: Response;

  try {
    // Forward the session cookie explicitly so the API resolves the SAME viewer
    // as this page (relying on Next to auto-forward it to an internal absolute
    // URL is unreliable). This is what lets the creator view their unpublished page.
    const cookieString = (await cookies()).toString();

    response = await fetch(
      `${baseUrl}/api/topics/${encodeURIComponent(identifier)}`,
      {
        cache: 'no-store',
        ...(cookieString ? { headers: { cookie: cookieString } } : {}),
      }
    );
  } catch {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto w-full max-w-3xl px-5 py-10">
          <div className="rounded-3xl bg-white p-8 text-center text-ink-600 ring-1 ring-ink-900/[0.06]">
            دریافت صفحه ممکن نشد.
          </div>
        </div>
      </main>
    );
  }

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto w-full max-w-3xl px-5 py-10">
          <div className="rounded-3xl bg-white p-8 text-center text-ink-600 ring-1 ring-ink-900/[0.06]">
            دریافت صفحه ممکن نشد.
          </div>
        </div>
      </main>
    );
  }

  let topic: Record<string, unknown>;

  try {
    topic = await response.json();
  } catch {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto w-full max-w-3xl px-5 py-10">
          <div className="rounded-3xl bg-white p-8 text-center text-ink-600 ring-1 ring-ink-900/[0.06]">
            دریافت صفحه ممکن نشد.
          </div>
        </div>
      </main>
    );
  }

  const page: PageData = {
    id: String(topic.id),
    slug: String(topic.slug),
    name: String(topic.name),
    description: (topic.description as string | null) ?? null,
    workingHours: (topic.workingHours as string | null) ?? null,
    imageUrl: (topic.imageUrl as string | null) ?? null,
    address: (topic.address as string | null) ?? null,
    scope: topic.scope as PageData['scope'],
    status: topic.status as PageData['status'],
    province: (topic.province as PageData['province']) ?? null,
    city: (topic.city as PageData['city']) ?? null,
    types: ((topic.types as Array<{ id: string; label: string; kind: 'PRIMARY' | 'SECONDARY' }>) ?? []).map(
      (type) => ({ id: type.id, label: type.label, kind: type.kind })
    ),
    links: ((topic.links as PageLink[]) ?? []).map((link) => ({
      id: link.id,
      platform: link.platform,
      label: link.label ?? null,
      value: link.value,
    })),
    comments: ((topic.comments as Array<{
      id: string;
      body: string;
      status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
      createdAt: string;
      authorId?: string | null;
      authorName?: string | null;
      parentId?: string | null;
      isReply?: boolean;
      isOwner?: boolean;
      rating?: number | null;
    }>) ?? []).map((comment) => ({
      id: comment.id,
      body: comment.body,
      status: comment.status,
      createdAt: comment.createdAt,
      authorId: comment.authorId ?? null,
      authorName: comment.authorName ?? null,
      parentId: comment.parentId ?? null,
      isReply: Boolean(comment.isReply),
      isOwner: Boolean(comment.isOwner),
      rating: comment.rating ?? null,
    })),
  };

  const canEdit = Boolean(
    (topic.permissions as { canEdit?: boolean } | undefined)?.canEdit
  );
  const canSubmit = Boolean(
    (topic.permissions as { canSubmit?: boolean } | undefined)?.canSubmit
  );
  const canSuggest = Boolean(
    (topic.permissions as { canSuggest?: boolean } | undefined)?.canSuggest
  );
  const canComment = Boolean(
    (topic.permissions as { canComment?: boolean } | undefined)?.canComment
  );
  const canReply = Boolean(
    (topic.permissions as { canReply?: boolean } | undefined)?.canReply
  );
  const canRate = Boolean(
    (topic.permissions as { canRate?: boolean } | undefined)?.canRate
  );
  const canFavorite = Boolean(
    (topic.permissions as { canFavorite?: boolean } | undefined)?.canFavorite
  );
  const canRequestOwnership = Boolean(
    (topic.permissions as { canRequestOwnership?: boolean } | undefined)?.canRequestOwnership
  );
  const viewerIsOwner = Boolean(
    (topic.isOwner as boolean | undefined) ?? false
  );
  const myOwnershipRequest =
    (topic.myOwnershipRequest as {
      id: string;
      status: 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
      decisionNote: string | null;
    } | null | undefined) ?? null;
  const hasCommented = Boolean(
    (topic.permissions as { hasCommented?: boolean } | undefined)?.hasCommented
  );
  const decisionNote =
    (topic.decisionNote as string | null | undefined) ?? null;
  const averageRating =
    (topic.averageRating as number | null | undefined) ?? null;
  const ratingCount = (topic.ratingCount as number | undefined) ?? 0;
  const myRating = (topic.myRating as number | null | undefined) ?? null;
  const isFavorited = Boolean(
    (topic.isFavorited as boolean | undefined) ?? false
  );

  return (
    <main className="min-h-screen bg-paper pb-10">
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-5 sm:py-6">
        <PageView
          page={page}
          editable={canEdit}
          canSubmit={canSubmit}
          decisionNote={decisionNote}
          canSuggest={canSuggest}
          canComment={canComment}
          canReply={canReply}
          hasCommented={hasCommented}
          averageRating={averageRating}
          ratingCount={ratingCount}
          myRating={myRating}
          isFavorited={isFavorited}
          canRate={canRate}
          canFavorite={canFavorite}
          canRequestOwnership={canRequestOwnership}
          viewerIsOwner={viewerIsOwner}
          myOwnershipRequest={myOwnershipRequest}
          initialAction={action ?? null}
        />
      </div>
    </main>
  );
}
