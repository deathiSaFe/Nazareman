import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getTopicRatingStats } from '@/lib/rating';
import {
  canDirectlyEditTopic,
  canSubmitTopic,
  canViewNonPublicTopic,
  isAdminUser,
} from '@/lib/authorization';
import type { ContactPlatform, LocationScope, TopicTypeKind } from '@/types/topic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LOCATION_SCOPES: readonly LocationScope[] = ['NATIONAL', 'PROVINCE', 'CITY', 'ADDRESS'];

const MAX_NAME_LENGTH = 80;
const MAX_TYPE_LENGTH = 60;
const MAX_TYPES = 5;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_WORKING_HOURS_LENGTH = 500;
const MAX_LINK_LENGTH = 200;
const MAX_LINK_LABEL_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 200;

const PLATFORMS: readonly ContactPlatform[] = [
  'INSTAGRAM',
  'TELEGRAM',
  'WHATSAPP',
  'BALE',
  'EITAA',
  'RUBIKA',
  'LINKEDIN',
  'X',
  'YOUTUBE',
  'FACEBOOK',
  'WEBSITE',
  'OTHER',
  'PHONE',
];

function isPlatform(value: unknown): value is ContactPlatform {
  return (
    typeof value === 'string' &&
    (PLATFORMS as readonly string[]).includes(value)
  );
}

function isLocationScope(value: unknown): value is LocationScope {
  return (
    typeof value === 'string' &&
    (LOCATION_SCOPES as readonly string[]).includes(value)
  );
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type SubmittedLink = { platform: ContactPlatform; label?: string; value: string };

function parseLinks(raw: unknown, errors: string[]): SubmittedLink[] {
  if (raw === undefined) return [];

  if (!Array.isArray(raw)) {
    errors.push('links must be an array.');
    return [];
  }

  const links: SubmittedLink[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      errors.push('Each link must be an object with platform and value.');
      continue;
    }

    const record = item as Record<string, unknown>;
    const platform = record.platform;
    const value = typeof record.value === 'string' ? record.value.trim() : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';

    if (!isPlatform(platform)) {
      errors.push('link platform is invalid.');
      continue;
    }

    if (!value) {
      errors.push('link value is required.');
      continue;
    }

    if (value.length > MAX_LINK_LENGTH) {
      errors.push(`link value must be ${MAX_LINK_LENGTH} characters or fewer.`);
      continue;
    }

    if (label.length > MAX_LINK_LABEL_LENGTH) {
      errors.push(`link label must be ${MAX_LINK_LABEL_LENGTH} characters or fewer.`);
      continue;
    }

    links.push({ platform, ...(label ? { label } : {}), value });
  }

  return links;
}

type SubmittedType = { label: string; kind: TopicTypeKind };

function parseTypes(raw: unknown, errors: string[]): SubmittedType[] {
  if (raw === undefined) return [];

  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push('types must contain at least one type.');
    return [];
  }

  if (raw.length > MAX_TYPES) {
    errors.push(`types must contain at most ${MAX_TYPES} types.`);
  }

  const types: SubmittedType[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      errors.push('Each type must be an object with label and kind.');
      continue;
    }

    const record = item as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const kind = record.kind;

    if (!label) {
      errors.push('type label is required.');
      continue;
    }

    if (label.length > MAX_TYPE_LENGTH) {
      errors.push(`type label must be ${MAX_TYPE_LENGTH} characters or fewer.`);
      continue;
    }

    if (kind !== 'PRIMARY' && kind !== 'SECONDARY') {
      errors.push('type kind must be PRIMARY or SECONDARY.');
      continue;
    }

    if (seen.has(label)) {
      errors.push(`Duplicate type label: "${label}".`);
      continue;
    }

    seen.add(label);
    types.push({ label, kind });
  }

  const primaryIndex = types.findIndex((type) => type.kind === 'PRIMARY');

  if (primaryIndex > 0) {
    errors.push('Only one primary type is allowed — the first type must be PRIMARY.');
  } else if (primaryIndex === -1 && types.length > 0) {
    types[0].kind = 'PRIMARY';
  }

  return types;
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    const isUuid = UUID_REGEX.test(identifier);

    const allowedStatuses: Array<
      'APPROVED' | 'DRAFT' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED'
    > = isUuid
      ? ['APPROVED', 'DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED']
      : ['APPROVED'];

    // Fetch topic first (without comments) to determine its status.
    const topic = await prisma.topic.findFirst({
      where: {
        status: { in: allowedStatuses },
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        workingHours: true,
        imageUrl: true,
        scope: true,
        address: true,
        status: true,
        submittedById: true,
        links: {
          select: {
            id: true,
            platform: true,
            label: true,
            value: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        submission: {
          select: {
            status: true,
            decisionNote: true,
            decidedAt: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
            slug: true,
            province: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        province: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        types: {
          select: {
            id: true,
            kind: true,
            type: {
              select: {
                label: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    // Non-public topics (anything but APPROVED) are only visible to the
    // verified creator and admins. Everyone else gets a clean 404 so the
    // page's existence stays hidden.
    const currentUser = await getCurrentUser();
    const admin = isAdminUser(currentUser);

    if (topic.status !== 'APPROVED' && !canViewNonPublicTopic(currentUser, topic, admin)) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    // The creator-facing decision message from the admin: the rejection reason
    // or the request-changes note. Stored on the Submission review record.
    const decisionNote =
      topic.status === 'CHANGES_REQUESTED' || topic.status === 'REJECTED'
        ? (topic.submission?.decisionNote ?? null)
        : null;

    // Whether the signed-in user already contributed (comment or reply) on this
    // topic — used by the UI to replace the form with the already-contributed
    // state. The DB unique constraint (topicId, authorId) backs this.
    const hasCommented = currentUser
      ? Boolean(
          await prisma.comment.findFirst({
            where: { topicId: topic.id, authorId: currentUser.id },
            select: { id: true },
          })
        )
      : false;

    // Non-public topics (creator viewing via UUID) show all comments; public
    // APPROVED view only shows APPROVED comments.
    const commentStatusFilter =
      topic.status !== 'APPROVED'
        ? undefined
        : 'APPROVED';

    const comments = await prisma.comment.findMany({
      where: {
        topicId: topic.id,
        ...(commentStatusFilter
          ? { status: commentStatusFilter }
          : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        status: true,
        authorId: true,
        parentId: true,
        author: {
          select: {
            displayName: true,
          },
        },
      },
    });

    // Owner badge: a comment author is marked isOwner only when an approved
    // PageOwnership row exists for (topic, author). Never derived from
    // submittedById (creator). PageOwnership rows do not exist yet (creation
    // flow is a later stage), so isOwner is currently always false.
    const authorIds = [
      ...new Set(comments.map((comment) => comment.authorId).filter((id): id is string => Boolean(id))),
    ];

    const ownerRows =
      authorIds.length > 0
        ? await prisma.pageOwnership.findMany({
            where: { topicId: topic.id, userId: { in: authorIds } },
            select: { userId: true },
          })
        : [];

    const ownerUserIds = new Set(ownerRows.map((row) => row.userId));

    // Each comment shows its author's rating on this topic (read-only, public
    // review info). Comments on APPROVED pages always carry a rating (it is
    // mandatory there); on other statuses the rating may be null.
    const authorRatingRows =
      authorIds.length > 0
        ? await prisma.rating.findMany({
            where: { topicId: topic.id, userId: { in: authorIds } },
            select: { userId: true, value: true },
          })
        : [];

    const authorRatingByUser = new Map(
      authorRatingRows.map((row) => [row.userId, row.value])
    );

    const mappedComments = comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      status: comment.status,
      authorId: comment.authorId,
      authorName: comment.author?.displayName ?? null,
      parentId: comment.parentId,
      isReply: comment.parentId !== null,
      isOwner: comment.authorId ? ownerUserIds.has(comment.authorId) : false,
      rating: comment.authorId
        ? (authorRatingByUser.get(comment.authorId) ?? null)
        : null,
    }));

    // Ratings only exist on APPROVED topics; the aggregate is public but
    // individual ratings are private. myRating / isFavorited are viewer-only.
    const ratingStats = await getTopicRatingStats(topic.id);

    const [myRatingRow, myFavoriteRow] = currentUser
      ? await Promise.all([
          prisma.rating.findUnique({
            where: { topicId_userId: { topicId: topic.id, userId: currentUser.id } },
            select: { value: true },
          }),
          prisma.favorite.findUnique({
            where: { userId_topicId: { userId: currentUser.id, topicId: topic.id } },
            select: { id: true },
          }),
        ])
      : [null, null];

    const myRating = myRatingRow?.value ?? null;
    const isFavorited = Boolean(myFavoriteRow);

    // Viewer-scoped ownership state: is the viewer an owner of this page, and
    // their own latest ownership request (for the claim-request UI).
    const [viewerOwnership, viewerOwnershipRequest] = currentUser
      ? await Promise.all([
          prisma.pageOwnership.findUnique({
            where: {
              topicId_userId: { topicId: topic.id, userId: currentUser.id },
            },
            select: { id: true },
          }),
          prisma.ownershipRequest.findFirst({
            where: { topicId: topic.id, userId: currentUser.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              decisionNote: true,
            },
          }),
        ])
      : [null, null];

    const isOwner = Boolean(viewerOwnership);
    const myOwnershipRequest = viewerOwnershipRequest;

    return NextResponse.json({
      id: topic.id,
      slug: topic.slug,
      name: topic.name,
      description: topic.description,
      workingHours: topic.workingHours,
      imageUrl: topic.imageUrl,
      scope: topic.scope,
      address: topic.address,
      status: topic.status,
      city: topic.city,
      province: topic.province,
      types: topic.types.map((tag) => ({
        id: tag.id,
        label: tag.type.label,
        kind: tag.kind,
      })),
      links: topic.links.map((link) => ({
        id: link.id,
        platform: link.platform,
        label: link.label,
        value: link.value,
      })),
      comments: mappedComments,
      decisionNote,
      // Rating aggregate + the authenticated viewer's own rating/favorite.
      // Individual ratings are never exposed; favorites are private.
      averageRating: ratingStats.averageRating,
      ratingCount: ratingStats.ratingCount,
      myRating,
      isFavorited,
      isOwner,
      myOwnershipRequest,
      permissions: {
        canEdit: canDirectlyEditTopic(currentUser, topic, admin),
        canSubmit: canSubmitTopic(currentUser, topic),
        canSuggest: Boolean(currentUser?.phoneVerified),
        canComment: Boolean(currentUser?.phoneVerified && !hasCommented),
        canReply: Boolean(currentUser?.phoneVerified),
        canRate: Boolean(currentUser?.phoneVerified),
        canFavorite: Boolean(currentUser?.phoneVerified),
        canRequestOwnership: Boolean(currentUser?.phoneVerified),
        hasCommented,
      },
    });
  } catch (error) {
    console.error('Failed to fetch topic:', error);

    return NextResponse.json(
      { error: 'Failed to fetch topic.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/topics/[id]
 * Inline page editors call this endpoint. The verified creator may save their
 * DRAFT / CHANGES_REQUESTED / REJECTED page; admins may edit any status.
 *
 * Saving edits never changes the moderation status — only
 * POST /api/topics/[id]/submit moves a page to PENDING_REVIEW. The request
 * body may carry any subset of the editable fields (identity, location,
 * introduction, working hours, image, address and contact rows). Status and
 * ownership fields from the client are always ignored.
 */
export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  // Resolve the actor from the server session, never the body.
  const user = await getCurrentUser();
  const admin = isAdminUser(user);

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const data = body as Record<string, unknown>;
  const errors: string[] = [];

  const has = (key: string): boolean => data[key] !== undefined;

  // Partial update: only fields explicitly present in the body are changed.
  const name = has('name')
    ? typeof data.name === 'string'
      ? data.name.trim()
      : ''
    : undefined;
  const description = has('description')
    ? typeof data.description === 'string'
      ? data.description.trim()
      : ''
    : undefined;
  const workingHours = has('workingHours')
    ? typeof data.workingHours === 'string'
      ? data.workingHours.trim()
      : ''
    : undefined;
  const address = has('address')
    ? typeof data.address === 'string'
      ? data.address.trim()
      : ''
    : undefined;
  const imageUrl = has('imageUrl')
    ? typeof data.imageUrl === 'string'
      ? data.imageUrl.trim()
      : ''
    : undefined;
  const scope = data.scope;
  const provinceSlug =
    typeof data.provinceSlug === 'string' ? data.provinceSlug.trim() : '';
  const citySlug =
    typeof data.citySlug === 'string' ? data.citySlug.trim() : '';

  const hasTypes = data.types !== undefined;
  const types = hasTypes ? parseTypes(data.types, errors) : [];

  const hasLinks = data.links !== undefined;
  const links = hasLinks ? parseLinks(data.links, errors) : [];

  if (name !== undefined && !name) {
    errors.push('name is required.');
  } else if (name !== undefined && name.length > MAX_NAME_LENGTH) {
    errors.push(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  if (description !== undefined && description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  if (workingHours !== undefined && workingHours.length > MAX_WORKING_HOURS_LENGTH) {
    errors.push(`workingHours must be ${MAX_WORKING_HOURS_LENGTH} characters or fewer.`);
  }
  if (address !== undefined && address.length > MAX_ADDRESS_LENGTH) {
    errors.push(`address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`);
  }
  if (imageUrl && !isValidHttpUrl(imageUrl)) {
    errors.push('imageUrl must be a valid http(s) URL.');
  }
  if (has('scope') && !isLocationScope(scope)) {
    errors.push('scope must be a valid location scope.');
  }
  if (citySlug && !provinceSlug) {
    errors.push('provinceSlug is required when citySlug is provided.');
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const identifier = id.trim();

    if (!identifier) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }

    const isUuid = UUID_REGEX.test(identifier);

    const existing = await prisma.topic.findFirst({
      where: {
        status: {
          in: ['APPROVED', 'DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'],
        },
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: { id: true, submittedById: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }

    if (!canDirectlyEditTopic(user, existing, admin)) {
      if (!user) {
        return NextResponse.json(
          { error: 'برای ویرایش این صفحه باید وارد حساب کاربری شوید.' },
          { status: 401 }
        );
      }

      if (!user.phoneVerified) {
        return NextResponse.json(
          { error: 'برای ویرایش این صفحه، شماره موبایل شما باید تأیید شده باشد.' },
          { status: 403 }
        );
      }

      if (existing.status === 'APPROVED') {
        return NextResponse.json(
          { error: 'صفحه منتشر شده قابل ویرایش مستقیم نیست. برای اصلاح، از پیشنهاد تغییر استفاده کنید.' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'شما اجازه ویرایش این صفحه را ندارید.' },
        { status: 403 }
      );
    }

    // Resolve location references from slugs (only when actually provided).
    let provinceId: string | null | undefined;
    let cityId: string | null | undefined;

    if (provinceSlug) {
      const province = await prisma.province.findUnique({
        where: { slug: provinceSlug },
        select: { id: true },
      });

      if (!province) {
        return NextResponse.json({ error: 'Province not found.' }, { status: 404 });
      }

      provinceId = province.id;
    }

    if (citySlug) {
      if (!provinceId) {
        return NextResponse.json({ error: 'Province not found.' }, { status: 404 });
      }

      const city = await prisma.city.findUnique({
        where: { provinceId_slug: { provinceId, slug: citySlug } },
        select: { id: true },
      });

      if (!city) {
        return NextResponse.json({ error: 'City not found.' }, { status: 404 });
      }

      cityId = city.id;
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description || null;
    if (workingHours !== undefined) updateData.workingHours = workingHours || null;
    if (address !== undefined) updateData.address = address || null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
    if (has('scope') && isLocationScope(scope)) {
      updateData.scope = scope;
      updateData.provinceId = provinceId ?? null;
      updateData.cityId = cityId ?? null;
    } else if (provinceSlug || citySlug) {
      if (provinceId !== undefined) updateData.provinceId = provinceId;
      if (cityId !== undefined) updateData.cityId = cityId;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const topic = await tx.topic.update({
        where: { id: existing.id },
        data: updateData,
        select: { id: true, slug: true },
      });

      if (hasTypes) {
        await tx.topicTypeTag.deleteMany({ where: { topicId: existing.id } });

        for (let index = 0; index < types.length; index += 1) {
          const type = types[index];

          const suggestion = await tx.topicTypeSuggestion.upsert({
            where: { label: type.label },
            update: {},
            create: { label: type.label, status: 'PENDING_REVIEW' },
            select: { id: true },
          });

          await tx.topicTypeTag.create({
            data: {
              topicId: existing.id,
              typeId: suggestion.id,
              kind: type.kind,
              order: index,
            },
          });
        }
      }

      if (hasLinks) {
        await tx.topicLink.deleteMany({ where: { topicId: existing.id } });

        for (const link of links) {
          await tx.topicLink.create({
            data: {
              topicId: existing.id,
              platform: link.platform,
              label: link.label ?? null,
              value: link.value,
            },
          });
        }
      }

      return topic;
    });

    return NextResponse.json({ success: true, topic: updated });
  } catch (error) {
    console.error('Failed to update page:', error);

    return NextResponse.json(
      { error: 'Failed to update page.' },
      { status: 500 }
    );
  }
}
