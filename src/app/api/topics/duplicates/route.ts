import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { MATCH_THRESHOLD, scoreTopic, type TopicForMatch } from '@/lib/topic-matching';
import type { ModerationStatus } from '@prisma/client';
import type { LocationScope } from '@/types/topic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCATION_SCOPES: readonly LocationScope[] = ['NATIONAL', 'PROVINCE', 'CITY', 'ADDRESS'];

const CANDIDATE_LIMIT = 500;
const MAX_MATCHES = 5;

function isLocationScope(value: unknown): value is LocationScope {
  return (
    typeof value === 'string' &&
    (LOCATION_SCOPES as readonly string[]).includes(value)
  );
}

function locationLabelFor(topic: {
  city?: { name: string; province: { name: string } } | null;
  province?: { name: string } | null;
}): string {
  if (topic.city) {
    return `${topic.city.name} · ${topic.city.province.name}`;
  }

  if (topic.province) {
    return topic.province.name;
  }

  return 'سراسر کشور';
}

/**
 * POST /api/topics/duplicates
 * Fuzzy duplicate detection for a new topic. Searches on name similarity,
 * type similarity and location overlap (location weighted highest).
 * Returns only topics whose combined score is high enough to be helpful.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';

  // Ordered type labels — the primary type comes first.
  const types: string[] = Array.isArray(data.types)
    ? data.types
        .map((item) =>
          typeof item === 'string' ? item.trim() : ''
        )
        .filter(Boolean)
    : [];

  const provinceSlug =
    typeof data.provinceSlug === 'string' ? data.provinceSlug.trim() : '';
  const citySlug = typeof data.citySlug === 'string' ? data.citySlug.trim() : '';

  if (!name) {
    return NextResponse.json({ error: 'name is required.' }, { status: 400 });
  }

  if (types.length === 0) {
    return NextResponse.json(
      { error: 'types must contain at least one type.' },
      { status: 400 }
    );
  }

  if (!isLocationScope(data.scope)) {
    return NextResponse.json({ error: 'scope must be a valid location scope.' }, { status: 400 });
  }

  const scope = data.scope;

  try {
    let provinceId: string | null = null;
    let cityId: string | null = null;

    if (scope === 'PROVINCE' || scope === 'CITY' || scope === 'ADDRESS') {
      const province = provinceSlug
        ? await prisma.province.findUnique({
            where: { slug: provinceSlug },
            select: { id: true },
          })
        : null;

      if (!province) {
        return NextResponse.json(
          { error: 'Province not found.' },
          { status: 404 }
        );
      }

      provinceId = province.id;
    }

    if (scope === 'CITY' || scope === 'ADDRESS') {
      if (!citySlug) {
        return NextResponse.json(
          { error: 'citySlug is required for city or address scope.' },
          { status: 400 }
        );
      }

      const city = await prisma.city.findUnique({
        where: { provinceId_slug: { provinceId: provinceId as string, slug: citySlug } },
        select: { id: true },
      });

      if (!city) {
        return NextResponse.json({ error: 'City not found.' }, { status: 404 });
      }

      cityId = city.id;
    }

    const locationFilter = cityId
      ? {
          OR: [{ cityId }, { provinceId }, { cityId: null, provinceId: null }],
        }
      : provinceId
        ? { OR: [{ provinceId }, { cityId: null, provinceId: null }] }
        : { cityId: null, provinceId: null };

    // Privacy gate: non-public topics (DRAFT/PENDING_REVIEW/CHANGES_REQUESTED/
    // REJECTED) must never be revealed to other users. Anonymous callers only
    // ever see APPROVED topics; authenticated users additionally see their OWN
    // non-public topics so they can be warned about their own in-flight
    // submissions.
    const currentUser = await getCurrentUser();

    const nonPublicStatuses: ModerationStatus[] = [
      'DRAFT',
      'PENDING_REVIEW',
      'CHANGES_REQUESTED',
      'REJECTED',
    ];

    const statusFilter = currentUser
      ? {
          OR: [
            { status: 'APPROVED' as const },
            {
              status: { in: nonPublicStatuses },
              submittedById: currentUser.id,
            },
          ],
        }
      : { status: 'APPROVED' as const };

    // Hard pre-filter: the PRIMARY type must match exactly, so a «پزشک» page
    // is never a candidate for a «کافی‌شاپ» query. (This is a loose superset —
    // the in-memory gate still requires the ordered-first type to match.)
    const primaryType = types[0];

    const candidates = await prisma.topic.findMany({
      where: {
        AND: [
          locationFilter,
          statusFilter,
          {
            types: {
              some: {
                type: { label: primaryType },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_LIMIT,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        provinceId: true,
        cityId: true,
        city: {
          select: {
            name: true,
            province: { select: { name: true } },
          },
        },
        province: {
          select: { name: true },
        },
        types: {
          select: {
            order: true,
            type: {
              select: { label: true },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    const query = {
      name,
      types,
      scope,
      provinceId: provinceId ?? undefined,
      cityId: cityId ?? undefined,
    };

    const matches = candidates
      .map((topic) => {
        const topicTypes = topic.types.map((tag) => tag.type.label);

        const match: TopicForMatch = {
          id: topic.id,
          slug: topic.slug,
          name: topic.name,
          types: topicTypes,
          status: topic.status,
          provinceId: topic.provinceId,
          cityId: topic.cityId,
        };

        return { topic, score: scoreTopic(query, match) };
      })
      .filter(({ score }) => score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES)
      .map(({ topic, score }) => ({
        id: topic.id,
        slug: topic.slug,
        name: topic.name,
        types: topic.types.map((tag) => tag.type.label),
        status: topic.status,
        score: Math.round(score * 100) / 100,
        locationLabel: locationLabelFor(topic),
      }));

    return NextResponse.json({ duplicates: matches });
  } catch (error) {
    console.error('Failed to check for duplicate topics:', error);

    return NextResponse.json(
      { error: 'Failed to check for duplicate topics.' },
      { status: 500 }
    );
  }
}
