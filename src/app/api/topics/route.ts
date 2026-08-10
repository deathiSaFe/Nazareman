import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'node:crypto';
import { SEARCH_MIN_SCORE, searchScore, type TopicForSearch } from '@/lib/topic-search';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';
import { isRateLimited, rateLimitResponse } from '@/lib/rate-limit';
import type { LocationScope, TopicTypeKind } from '@/types/topic';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * Upper bound on how many topics are pulled into memory for relevance scoring
 * when a `search` term is present. Practical for the current dataset — in-memory
 * scoring needs to see the full candidate window because SQL `contains` cannot
 * see Arabic/Persian glyph variants (ك/ک, ي/ی). Revisit when the dataset grows.
 */
const SEARCH_CANDIDATE_LIMIT = 500;

const topicSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  imageUrl: true,
  createdAt: true,
  city: {
    select: {
      id: true,
      name: true,
      slug: true,
      province: {
        select: {
          name: true,
          slug: true,
        },
      },
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
} satisfies Prisma.TopicSelect;

type SearchableTopic = Prisma.TopicGetPayload<{ select: typeof topicSelect }>;

function mapTopic(topic: SearchableTopic) {
  return {
    ...topic,
    types: topic.types.map((tag) => ({
      id: tag.id,
      label: tag.type.label,
      kind: tag.kind,
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const citySlug = searchParams.get('city')?.trim() || undefined;
    const provinceSlug = searchParams.get('province')?.trim() || undefined;
    const typeParam = searchParams.get('type')?.trim() || undefined;
    const searchTerm = searchParams.get('search')?.trim() || undefined;
    const pageParam = searchParams.get('page')?.trim();
    const limitParam = searchParams.get('limit')?.trim();

    const page = pageParam ? Number(pageParam) : 1;
    const limit = limitParam ? Number(limitParam) : 20;

    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json(
        { error: 'Invalid page. page must be a positive integer.' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(limit) || limit < 1) {
      return NextResponse.json(
        { error: 'Invalid limit. limit must be a positive integer.' },
        { status: 400 }
      );
    }

    const where: Prisma.TopicWhereInput = {
      status: 'APPROVED',
    };

    if (provinceSlug) {
      where.province = {
        slug: provinceSlug,
      };
    }

    if (citySlug) {
      where.city = {
        slug: citySlug,
      };
    }

    if (typeParam) {
      where.types = {
        some: {
          type: {
            label: typeParam,
          },
        },
      };
    }

    const skip = (page - 1) * limit;

    if (searchTerm) {
      // Relevance search: pull a bounded, most-recent candidate window and
      // rank it in memory. The province/city/type filters above still apply at
      // the query level, so an explicit type or location filter is preserved.
      const candidates = await prisma.topic.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: SEARCH_CANDIDATE_LIMIT,
        select: topicSelect,
      });

      const scored = candidates
        .map((topic) => {
          const match: TopicForSearch = {
            name: topic.name,
            description: topic.description,
            types: topic.types.map((tag) => tag.type.label),
          };

          return { topic, score: searchScore(searchTerm, match) };
        })
        .filter(({ score }) => score >= SEARCH_MIN_SCORE)
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.topic.createdAt.getTime() - a.topic.createdAt.getTime()
        );

      const total = scored.length;
      const totalPages = Math.ceil(total / limit);

      const mappedTopics = scored
        .slice(skip, skip + limit)
        .map(({ topic }) => mapTopic(topic));

      return NextResponse.json({
        topics: mappedTopics,
        data: mappedTopics,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    }

    const [total, topics] = await Promise.all([
      prisma.topic.count({ where }),
      prisma.topic.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
        select: topicSelect,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const mappedTopics = topics.map(mapTopic);

    return NextResponse.json({
      topics: mappedTopics,
      data: mappedTopics,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to fetch topics:', error);

    return NextResponse.json(
      { error: 'Failed to fetch topics' },
      { status: 500 }
    );
  }
}

const LOCATION_SCOPES: readonly LocationScope[] = ['NATIONAL', 'PROVINCE', 'CITY', 'ADDRESS'];

const MAX_NAME_LENGTH = 80;
const MAX_TYPE_LENGTH = 60;
const MAX_TYPES = 5;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ADDRESS_LENGTH = 200;

const CREATE_WINDOW_MS = 60 * 60 * 1000;
const CREATE_LIMIT = 10;

type SubmittedType = { label: string; kind: TopicTypeKind };

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

function slugifyName(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');

  return slug || 'topic';
}

/**
 * Parse the (optional) types array for a draft. Unlike final submission, a
 * draft may be created without any types — they are required only when the
 * page is submitted for review.
 */
function parseTypes(raw: unknown, errors: string[]): SubmittedType[] {
  if (raw === undefined) return [];

  if (!Array.isArray(raw)) {
    errors.push('types must be an array.');
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

/**
 * POST /api/topics
 * Create a new page as a DRAFT owned by the authenticated, verified user.
 * Creating a page does NOT submit it for review — the creator continues
 * editing and later calls POST /api/topics/[id]/submit.
 *
 * A draft may be incomplete: only `name` is required. Location, types and
 * other fields are validated when present and completed before submission.
 */
export async function POST(request: NextRequest) {
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to create page.' }, { status: 500 });
  }

  // Throttle page creation per verified user.
  if (
    isRateLimited(request, `create-topic:${user.id}`, {
      limit: CREATE_LIMIT,
      windowMs: CREATE_WINDOW_MS,
    })
  ) {
    return rateLimitResponse();
  }

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

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const workingHours = typeof data.workingHours === 'string' ? data.workingHours.trim() : '';
  const scope = data.scope;
  const provinceSlug = typeof data.provinceSlug === 'string' ? data.provinceSlug.trim() : '';
  const citySlug = typeof data.citySlug === 'string' ? data.citySlug.trim() : '';
  const address = typeof data.address === 'string' ? data.address.trim() : '';

  const types = parseTypes(data.types, errors);

  if (!name) {
    errors.push('name is required.');
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }

  if (scope !== undefined && !isLocationScope(scope)) {
    errors.push('scope must be a valid location scope.');
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    errors.push(`address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`);
  }

  if (citySlug && !provinceSlug) {
    errors.push('provinceSlug is required when citySlug is provided.');
  }

  let imageUrl: string | undefined;
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    if (!isValidHttpUrl(data.imageUrl.trim())) errors.push('imageUrl must be a valid URL.');
    else imageUrl = data.imageUrl.trim();
  }

  let firstComment: string | undefined;
  if (typeof data.firstComment === 'string' && data.firstComment.trim()) {
    firstComment = data.firstComment.trim();
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
  }

  try {
    const locationScope = isLocationScope(scope) ? scope : 'NATIONAL';
    let provinceId: string | null = null;
    let cityId: string | null = null;

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

    const createdTopic = await prisma.$transaction(async (tx) => {
      const baseSlug = slugifyName(name);
      const slug = `${baseSlug}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

      const topic = await tx.topic.create({
        data: {
          slug,
          name,
          description: description || null,
          workingHours: workingHours || null,
          imageUrl,
          scope: locationScope,
          provinceId,
          cityId,
          address: address || null,
          status: 'DRAFT',
          submittedById: user.id,
        },
        select: { id: true, slug: true },
      });

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
            topicId: topic.id,
            typeId: suggestion.id,
            kind: type.kind,
            order: index,
          },
        });
      }

      await tx.submission.create({
        data: { topicId: topic.id, status: 'DRAFT', submittedById: user.id },
      });

      if (firstComment) {
        await tx.comment.create({
          data: {
            topicId: topic.id,
            body: firstComment,
            status: 'PENDING_REVIEW',
          },
        });
      }

      return topic;
    });

    return NextResponse.json(
      {
        success: true,
        topicId: createdTopic.id,
        slug: createdTopic.slug,
        status: 'DRAFT',
        message: 'Draft created',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create page:', error);
    return NextResponse.json({ error: 'Failed to create page.' }, { status: 500 });
  }
}