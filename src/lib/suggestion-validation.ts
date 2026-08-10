import type { LocationScope } from '@/types/topic';
import { prisma } from '@/lib/prisma';

/**
 * Server-side field whitelist for Suggestion proposals.
 *
 * Only these canonical Topic fields may ever be modified by an approved
 * suggestion. Location is proposed through slugs (the same convention the rest
 * of the app uses) and resolved to provinceId/cityId at apply time.
 */
export const SUGGESTION_FIELDS_WHITELIST = [
  'name',
  'description',
  'workingHours',
  'imageUrl',
  'scope',
  'provinceSlug',
  'citySlug',
  'address',
  'latitude',
  'longitude',
] as const;

const LOCATION_SCOPES: readonly LocationScope[] = ['NATIONAL', 'PROVINCE', 'CITY', 'ADDRESS'];

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_WORKING_HOURS_LENGTH = 500;
const MAX_ADDRESS_LENGTH = 200;

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

function isNullableNumber(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Format-validate a proposed `changes` object against the whitelist.
 *
 * Returns a normalized copy containing only allowed keys (or `{ ok: false,
 * errors }`). It does NOT decide whether enough was proposed — the caller
 * enforces the per-kind requirements.
 */
export function validateSuggestionChanges(
  changes: unknown
): { ok: true; changes: Record<string, unknown> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const out: Record<string, unknown> = {};

  if (changes === undefined || changes === null) {
    return { ok: true, changes: {} };
  }

  if (typeof changes !== 'object' || Array.isArray(changes)) {
    return { ok: false, errors: ['changes must be an object.'] };
  }

  const data = changes as Record<string, unknown>;

  for (const key of Object.keys(data)) {
    if (!(SUGGESTION_FIELDS_WHITELIST as readonly string[]).includes(key)) {
      errors.push(`فیلد «${key}» قابل پیشنهاد نیست.`);
    }
  }

  if (data.name !== undefined) {
    const value = typeof data.name === 'string' ? data.name.trim() : '';
    if (!value) errors.push('نام صفحه نمی‌تواند خالی باشد.');
    else if (value.length > MAX_NAME_LENGTH) {
      errors.push(`نام صفحه باید حداکثر ${MAX_NAME_LENGTH} نویسه باشد.`);
    } else out.name = value;
  }

  if (data.description !== undefined) {
    const value = typeof data.description === 'string' ? data.description.trim() : '';
    if (value.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`معرفی باید حداکثر ${MAX_DESCRIPTION_LENGTH} نویسه باشد.`);
    } else out.description = value;
  }

  if (data.workingHours !== undefined) {
    const value = typeof data.workingHours === 'string' ? data.workingHours.trim() : '';
    if (value.length > MAX_WORKING_HOURS_LENGTH) {
      errors.push(`ساعات کاری باید حداکثر ${MAX_WORKING_HOURS_LENGTH} نویسه باشد.`);
    } else out.workingHours = value;
  }

  if (data.imageUrl !== undefined) {
    const value = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
    if (value && !isValidHttpUrl(value)) {
      errors.push('نشانی تصویر باید یک URL معتبر http(s) باشد.');
    } else out.imageUrl = value;
  }

  if (data.scope !== undefined) {
    if (!isLocationScope(data.scope)) {
      errors.push('scope باید یکی از محدوده‌های معتبر باشد.');
    } else out.scope = data.scope;
  }

  if (data.address !== undefined) {
    const value = typeof data.address === 'string' ? data.address.trim() : '';
    if (value.length > MAX_ADDRESS_LENGTH) {
      errors.push(`آدرس باید حداکثر ${MAX_ADDRESS_LENGTH} نویسه باشد.`);
    } else out.address = value;
  }

  if (data.provinceSlug !== undefined) {
    const value = typeof data.provinceSlug === 'string' ? data.provinceSlug.trim() : '';
    out.provinceSlug = value;
  }

  if (data.citySlug !== undefined) {
    const value = typeof data.citySlug === 'string' ? data.citySlug.trim() : '';
    out.citySlug = value;
  }

  if (data.latitude !== undefined) {
    if (!isNullableNumber(data.latitude)) errors.push('latitude باید عدد باشد.');
    else out.latitude = data.latitude;
  }

  if (data.longitude !== undefined) {
    if (!isNullableNumber(data.longitude)) errors.push('longitude باید عدد باشد.');
    else out.longitude = data.longitude;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, changes: out };
}

/**
 * Verify that any provided location slugs resolve to real provinces/cities.
 * Returns a list of errors (empty when valid). Called at submission time so a
 * proposal with a bad slug is rejected up front.
 */
export async function validateSuggestionLocationSlugs(
  changes: Record<string, unknown>
): Promise<string[]> {
  const errors: string[] = [];
  const provinceSlug =
    typeof changes.provinceSlug === 'string' ? changes.provinceSlug.trim() : '';
  const citySlug = typeof changes.citySlug === 'string' ? changes.citySlug.trim() : '';

  if (provinceSlug) {
    const province = await prisma.province.findUnique({
      where: { slug: provinceSlug },
      select: { id: true },
    });
    if (!province) errors.push('استان مشخص‌شده یافت نشد.');
  }

  if (citySlug) {
    if (!provinceSlug) {
      errors.push('برای مشخص کردن شهر، استان را نیز مشخص کنید.');
    } else {
      const province = await prisma.province.findUnique({
        where: { slug: provinceSlug },
        select: { id: true },
      });

      if (!province) {
        errors.push('استان مشخص‌شده یافت نشد.');
      } else {
        const city = await prisma.city.findUnique({
          where: { provinceId_slug: { provinceId: province.id, slug: citySlug } },
          select: { id: true },
        });
        if (!city) errors.push('شهر مشخص‌شده یافت نشد.');
      }
    }
  }

  return errors;
}

/**
 * Apply an approved suggestion's whitelisted `changes` to the canonical Topic.
 * Must be called inside the same transaction that marks the Suggestion
 * APPROVED. Location slugs are resolved to ids here; the Topic stays in its
 * current (APPROVED) state — this is a correction, not a new submission.
 */
export async function applySuggestionChanges(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  topicId: string,
  changes: Record<string, unknown>
): Promise<void> {
  const topic = await tx.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      scope: true,
      provinceId: true,
      cityId: true,
    },
  });

  if (!topic) {
    throw new Error('Topic not found.');
  }

  const update: Record<string, unknown> = {};

  if (changes.name !== undefined) update.name = changes.name;
  if (changes.description !== undefined) {
    update.description = changes.description === '' ? null : changes.description;
  }
  if (changes.workingHours !== undefined) {
    update.workingHours = changes.workingHours === '' ? null : changes.workingHours;
  }
  if (changes.imageUrl !== undefined) {
    update.imageUrl = changes.imageUrl === '' ? null : changes.imageUrl;
  }
  if (changes.address !== undefined) {
    update.address = changes.address === '' ? null : changes.address;
  }
  if (changes.latitude !== undefined) update.latitude = changes.latitude;
  if (changes.longitude !== undefined) update.longitude = changes.longitude;

  const hasLocationChange =
    changes.scope !== undefined ||
    changes.provinceSlug !== undefined ||
    changes.citySlug !== undefined;

  if (hasLocationChange) {
    const scope =
      changes.scope !== undefined ? (changes.scope as LocationScope) : topic.scope;
    let provinceId = topic.provinceId;
    let cityId = topic.cityId;

    if (changes.provinceSlug !== undefined) {
      const provinceSlug = changes.provinceSlug as string;
      if (!provinceSlug) {
        provinceId = null;
        cityId = null;
      } else {
        const province = await tx.province.findUnique({
          where: { slug: provinceSlug },
          select: { id: true },
        });
        if (!province) throw new Error('Province not found.');
        provinceId = province.id;
      }
    }

    if (changes.citySlug !== undefined) {
      const citySlug = changes.citySlug as string;
      if (!citySlug) {
        cityId = null;
      } else {
        if (!provinceId) throw new Error('Province not found.');
        const city = await tx.city.findUnique({
          where: { provinceId_slug: { provinceId, slug: citySlug } },
          select: { id: true },
        });
        if (!city) throw new Error('City not found.');
        cityId = city.id;
      }
    }

    if (scope === 'NATIONAL') {
      provinceId = null;
      cityId = null;
    }

    update.scope = scope;
    update.provinceId = provinceId;
    update.cityId = cityId;
  }

  await tx.topic.update({
    where: { id: topicId },
    data: update,
  });
}
