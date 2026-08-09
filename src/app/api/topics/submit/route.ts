import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireVerifiedUser } from '@/lib/authorization';
import type { LocationScope, TopicTypeKind } from '@/types/topic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCATION_SCOPES: readonly LocationScope[] = ['NATIONAL', 'PROVINCE', 'CITY', 'ADDRESS'];

const MAX_NAME_LENGTH = 80;
const MAX_TYPE_LENGTH = 60;
const MAX_TYPES = 5;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ADDRESS_LENGTH = 200;

type SubmittedType = {
  label: string;
  kind: TopicTypeKind;
};

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
 * Parse and validate the submitted types array (1..5, one PRIMARY).
 * Normalizes to exactly one primary — the first PRIMARY wins; if none is
 * provided, the first type becomes PRIMARY.
 */
function parseTypes(raw: unknown, errors: string[]): SubmittedType[] {
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

export async function POST(request: NextRequest) {
  // Submitting a topic requires a signed-in, phone-verified user. The creator
  // is always taken from the server session — never from the request body.
  let user;

  try {
    user = await requireVerifiedUser();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to submit topic.' }, { status: 500 });
  }

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
  const errors: string[] = [];

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const scope = data.scope;
  const provinceSlug = typeof data.provinceSlug === 'string' ? data.provinceSlug.trim() : '';
  const citySlug = typeof data.citySlug === 'string' ? data.citySlug.trim() : '';
  const address = typeof data.address === 'string' ? data.address.trim() : '';

  const types = parseTypes(data.types, errors);

  if (!name) errors.push('name is required.');
  else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }

  // The short introduction is optional at creation (Part 1/3) — the page is
  // valid without it and can be completed later.
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }

  if (!isLocationScope(scope)) {
    errors.push('scope must be a valid location scope.');
  }

  const locationScope = isLocationScope(scope) ? scope : 'NATIONAL';

  if (locationScope === 'PROVINCE' && !provinceSlug) {
    errors.push('provinceSlug is required for province scope.');
  }

  if ((locationScope === 'CITY' || locationScope === 'ADDRESS') && !provinceSlug) {
    errors.push('provinceSlug is required for city or address scope.');
  }

  if ((locationScope === 'CITY' || locationScope === 'ADDRESS') && !citySlug) {
    errors.push('citySlug is required for city or address scope.');
  }

  if (locationScope === 'ADDRESS') {
    if (!address) errors.push('address is required for address scope.');
    else if (address.length > MAX_ADDRESS_LENGTH) {
      errors.push(`address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`);
    }
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
    let provinceId: string | null = null;
    let cityId: string | null = null;

    if (locationScope === 'PROVINCE' || locationScope === 'CITY' || locationScope === 'ADDRESS') {
      const province = await prisma.province.findUnique({
        where: { slug: provinceSlug },
        select: { id: true },
      });

      if (!province) {
        return NextResponse.json({ error: 'Province not found.' }, { status: 404 });
      }

      provinceId = province.id;
    }

    if (locationScope === 'CITY' || locationScope === 'ADDRESS') {
      const city = await prisma.city.findUnique({
        where: { provinceId_slug: { provinceId: provinceId as string, slug: citySlug } },
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
          imageUrl,
          scope: locationScope,
          provinceId,
          cityId,
          address: locationScope === 'ADDRESS' ? address : null,
          status: 'PENDING',
          submittedById: user.id,
        },
        select: { id: true, slug: true },
      });

      // Record each type label as a suggestion (PENDING if brand-new) so new
      // types land in the admin review queue, then attach it to the topic.
      for (let index = 0; index < types.length; index += 1) {
        const type = types[index];

        const suggestion = await tx.topicTypeSuggestion.upsert({
          where: { label: type.label },
          update: {},
          create: { label: type.label, status: 'PENDING' },
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
        data: { topicId: topic.id, status: 'PENDING', submittedById: user.id },
      });

      if (firstComment) {
        await tx.comment.create({
          data: {
            topicId: topic.id,
            body: firstComment,
            status: 'PENDING',
          },
        });
      }

      return topic;
    });

    return NextResponse.json({
      success: true,
      topicId: createdTopic.id,
      slug: createdTopic.slug,
      message: 'Topic submitted for review',
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to submit topic:', error);
    return NextResponse.json({ error: 'Failed to submit topic.' }, { status: 500 });
  }
}
