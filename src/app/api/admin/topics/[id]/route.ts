import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PermissionError, requireAdmin } from '@/lib/authorization';
import { createNotification } from '@/lib/notifications';
import type { ContactPlatform, LocationScope, TopicTypeKind } from '@/types/topic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'] as const;

const LOCATION_SCOPES: readonly LocationScope[] = ['NATIONAL', 'PROVINCE', 'CITY', 'ADDRESS'];

const MAX_NAME_LENGTH = 80;
const MAX_TYPE_LENGTH = 60;
const MAX_TYPES = 5;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_WORKING_HOURS_LENGTH = 500;
const MAX_LINK_LENGTH = 200;
const MAX_LINK_LABEL_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 200;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

type SubmittedType = {
  label: string;
  kind: TopicTypeKind;
};

type SubmittedLink = {
  platform: ContactPlatform;
  label?: string;
  value: string;
};

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return (
    typeof value === 'string' &&
    (ALLOWED_STATUSES as readonly string[]).includes(value)
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

function parseTypes(raw: unknown): SubmittedType[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const types: SubmittedType[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;

    const record = item as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const kind = record.kind;

    if (!label || label.length > MAX_TYPE_LENGTH) continue;
    if (kind !== 'PRIMARY' && kind !== 'SECONDARY') continue;
    if (seen.has(label)) continue;

    seen.add(label);
    types.push({ label, kind });
  }

  if (types.length === 0) return [];

  const primaryIndex = types.findIndex((type) => type.kind === 'PRIMARY');

  if (primaryIndex > 0) {
    return [];
  }

  if (primaryIndex === -1) {
    types[0].kind = 'PRIMARY';
  }

  return types;
}

function parseLinks(raw: unknown): SubmittedLink[] | null {
  if (raw === undefined) return null;

  if (!Array.isArray(raw)) return [];

  const links: SubmittedLink[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;

    const record = item as Record<string, unknown>;
    const platform = record.platform;
    const value = typeof record.value === 'string' ? record.value.trim() : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';

    if (typeof platform !== 'string') continue;
    if (
      ![
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
      ].includes(platform)
    ) {
      continue;
    }

    if (!value || value.length > MAX_LINK_LENGTH) continue;
    if (label.length > MAX_LINK_LABEL_LENGTH) continue;

    links.push({
      platform: platform as ContactPlatform,
      ...(label ? { label } : {}),
      value,
    });
  }

  return links;
}

function typesEqual(
  left: SubmittedType[],
  right: { label: string; kind: TopicTypeKind }[]
): boolean {
  if (left.length !== right.length) return false;

  return left.every(
    (type, index) =>
      right[index] &&
      type.label === right[index].label &&
      type.kind === right[index].kind
  );
}

function linksEqual(left: SubmittedLink[], right: SubmittedLink[]): boolean {
  if (left.length !== right.length) return false;

  return left.every(
    (link, index) =>
      right[index] &&
      link.platform === right[index].platform &&
      link.value === right[index].value &&
      (link.label ?? null) === (right[index].label ?? null)
  );
}

/**
 * PATCH /api/admin/topics/[id]
 * Full page review: the admin can edit every field and make one of three
 * decisions — APPROVE, REQUEST_CHANGES or REJECT — in a single transaction.
 *
 * Every decision and every field edit is written to ModerationLog so admin
 * actions are auditable.
 */
export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  let admin;

  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const data = payload as Record<string, unknown>;
  const errors: string[] = [];

  // Partial update: only the fields that are present in the body are changed.
  const has = (key: string): boolean => data[key] !== undefined;

  const name = typeof data.name === 'string' ? data.name.trim() : undefined;
  const provinceSlug =
    typeof data.provinceSlug === 'string' ? data.provinceSlug.trim() : '';
  const citySlug = typeof data.citySlug === 'string' ? data.citySlug.trim() : '';
  const address = has('address')
    ? typeof data.address === 'string'
      ? data.address.trim()
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
  const imageUrl = has('imageUrl')
    ? typeof data.imageUrl === 'string'
      ? data.imageUrl.trim()
      : ''
    : undefined;

  const scope = data.scope;
  const locationScope = isLocationScope(scope) ? scope : 'NATIONAL';

  const decisionNote =
    typeof data.decisionNote === 'string' ? data.decisionNote.trim() : '';

  let status: AllowedStatus | undefined;
  if (data.status !== undefined) {
    if (isAllowedStatus(data.status)) {
      status = data.status;
    } else {
      errors.push('status must be APPROVED, CHANGES_REQUESTED or REJECTED.');
    }
  }

  // Reject and request-changes decisions must carry a message for the creator.
  if (status === 'CHANGES_REQUESTED' && !decisionNote) {
    errors.push('برای درخواست تغییر، پیام مدیر الزامی است.');
  }

  if (status === 'REJECTED' && !decisionNote) {
    errors.push('برای رد صفحه، دلیل رد الزامی است.');
  }

  const types = has('types') ? parseTypes(data.types) : null;
  const links = parseLinks(data.links);

  if (has('name')) {
    if (!name) errors.push('name is required.');
    else if (name.length > MAX_NAME_LENGTH) {
      errors.push(`name must be ${MAX_NAME_LENGTH} characters or fewer.`);
    }
  }

  if (has('types')) {
    if (!types || types.length === 0) {
      errors.push('types must contain at least one valid type.');
    } else if (types.length > MAX_TYPES) {
      errors.push(`types must contain at most ${MAX_TYPES} types.`);
    }
  }

  if (has('scope')) {
    if (!isLocationScope(scope)) {
      errors.push('scope must be a valid location scope.');
    } else if (
      (locationScope === 'PROVINCE' ||
        locationScope === 'CITY' ||
        locationScope === 'ADDRESS') &&
      !provinceSlug
    ) {
      errors.push('provinceSlug is required for this scope.');
    } else if (
      (locationScope === 'CITY' || locationScope === 'ADDRESS') &&
      !citySlug
    ) {
      errors.push('citySlug is required for city or address scope.');
    }
  }

  if (address !== undefined && address.length > MAX_ADDRESS_LENGTH) {
    errors.push(`address must be ${MAX_ADDRESS_LENGTH} characters or fewer.`);
  }
  if (description !== undefined && description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  if (workingHours !== undefined && workingHours.length > MAX_WORKING_HOURS_LENGTH) {
    errors.push(`workingHours must be ${MAX_WORKING_HOURS_LENGTH} characters or fewer.`);
  }
  if (imageUrl !== undefined && imageUrl && !isValidHttpUrl(imageUrl)) {
    errors.push('imageUrl must be a valid http(s) URL.');
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
        OR: isUuid
          ? [{ id: identifier }, { slug: identifier }]
          : [{ slug: identifier }],
      },
      select: {
        id: true,
        name: true,
        submittedById: true,
        description: true,
        workingHours: true,
        imageUrl: true,
        address: true,
        scope: true,
        provinceId: true,
        cityId: true,
        types: {
          select: { kind: true, type: { select: { label: true } } },
          orderBy: { order: 'asc' },
        },
        links: {
          select: { platform: true, label: true, value: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    }

    let provinceId: string | null = null;
    let cityId: string | null = null;

    if (has('scope')) {
      if (
        locationScope === 'PROVINCE' ||
        locationScope === 'CITY' ||
        locationScope === 'ADDRESS'
      ) {
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
    }

    // Did the admin actually change canonical content? Used to decide whether
    // an EDIT moderation log entry is warranted.
    let contentChanged = false;

    if (has('name') && (name ?? '') !== existing.name) contentChanged = true;
    if (
      description !== undefined &&
      (description || null) !== existing.description
    ) {
      contentChanged = true;
    }
    if (
      workingHours !== undefined &&
      (workingHours || null) !== existing.workingHours
    ) {
      contentChanged = true;
    }
    if (imageUrl !== undefined && (imageUrl || null) !== existing.imageUrl) {
      contentChanged = true;
    }
    if (address !== undefined && (address || null) !== existing.address) {
      contentChanged = true;
    }
    if (
      has('scope') &&
      (locationScope !== existing.scope ||
        provinceId !== existing.provinceId ||
        cityId !== existing.cityId)
    ) {
      contentChanged = true;
    }
    if (types !== null && !typesEqual(types, existing.types.map((t) => ({ label: t.type.label, kind: t.kind })))) {
      contentChanged = true;
    }
    if (
      links !== null &&
      !linksEqual(
        links,
        existing.links.map((l) => ({ platform: l.platform, label: l.label ?? undefined, value: l.value }))
      )
    ) {
      contentChanged = true;
    }

    const updatedTopic = await prisma.$transaction(async (tx) => {
      if (types !== null) {
        // Replace the page's types atomically.
        await tx.topicTypeTag.deleteMany({
          where: { topicId: existing.id },
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
              topicId: existing.id,
              typeId: suggestion.id,
              kind: type.kind,
              order: index,
            },
          });
        }
      }

      const updateData: Record<string, unknown> = {};

      if (has('name') && name) updateData.name = name;
      if (description !== undefined) updateData.description = description || null;
      if (workingHours !== undefined) updateData.workingHours = workingHours || null;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
      if (address !== undefined) updateData.address = address || null;

      if (has('scope')) {
        updateData.scope = locationScope;
        updateData.provinceId = provinceId;
        updateData.cityId = cityId;
      }

      if (status !== undefined) {
        updateData.status = status;
        updateData.approvedAt = status === 'APPROVED' ? new Date() : null;
      }

      const topic = await tx.topic.update({
        where: { id: existing.id },
        data: updateData,
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          approvedAt: true,
        },
      });

      if (links !== null) {
        // Replace the page's contact/social links atomically.
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

      if (status !== undefined) {
        await tx.submission.updateMany({
          where: { topicId: existing.id },
          data: {
            status,
            decisionNote: decisionNote || null,
            decidedById: admin.id,
            decidedAt: new Date(),
          },
        });
      }

      const submission = await tx.submission.findUnique({
        where: { topicId: existing.id },
        select: { id: true },
      });

      // Audit: log the field edits when the admin changed canonical content.
      if (contentChanged) {
        await tx.moderationLog.create({
          data: {
            action: 'EDIT',
            adminId: admin.id,
            topicId: existing.id,
            submissionId: submission?.id ?? null,
          },
        });
      }

      // Audit: log the moderation decision.
      if (status !== undefined) {
        await tx.moderationLog.create({
          data: {
            action: status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'REQUEST_CHANGES',
            reason: decisionNote || null,
            adminId: admin.id,
            topicId: existing.id,
            submissionId: submission?.id ?? null,
          },
        });

        // Inbox message to the page's creator with the admin's response.
        if (existing.submittedById && submission) {
          await createNotification(tx, {
            userId: existing.submittedById,
            kind: 'SUBMISSION_DECISION',
            topicId: existing.id,
            refId: submission.id,
            title:
              status === 'APPROVED'
                ? 'صفحه شما منتشر شد'
                : status === 'REJECTED'
                  ? 'صفحه شما رد شد'
                  : 'درخواست اصلاح برای صفحه شما',
            body:
              status === 'APPROVED'
                ? `صفحه «${existing.name}» تأیید و منتشر شد.`
                : decisionNote
                  ? `صفحه «${existing.name}»: ${decisionNote}`
                  : status === 'REJECTED'
                    ? `صفحه «${existing.name}» رد شد.`
                    : `صفحه «${existing.name}» نیاز به اصلاح دارد.`,
          });
        }
      }

      return topic;
    });

    return NextResponse.json(updatedTopic);
  } catch (error) {
    console.error('Failed to update page:', error);

    return NextResponse.json(
      { error: 'Failed to update page.' },
      { status: 500 }
    );
  }
}
