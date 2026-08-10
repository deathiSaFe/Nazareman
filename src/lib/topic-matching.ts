/**
 * Duplicate-topic detection scoring.
 *
 * Three hard gates, then a weighted confidence score:
 *   1. Type     — the PRIMARY type must match exactly (see multiTypeSimilarity;
 *                 this is the seam where a future taxonomy/synonym system can
 *                 widen the match, e.g. «مکانیکی» ~ «تعمیرگاه خودرو»).
 *   2. Location — candidates must be in a compatible area. Same city is the
 *                 strongest, then same province, then nationwide. A different
 *                 city is never a candidate unless the existing page is
 *                 province-based or nationwide.
 *   3. Name     — the main signal once the first two gates pass. Names must
 *                 share meaningful overlap; short generic single-word names
 *                 (e.g. «علی») are never enough on their own.
 *
 * So "دکتر علی" + «پزشک» in a city will match another «پزشک» with the same
 * name, but never «کافی‌شاپ علی» + «کافی‌شاپ», even in the same city.
 */
import { normalizePersian, tokenizePersian } from './persian-text';
import type { LocationScope } from '@/types/topic';

/** Only candidates scoring at or above this are surfaced. */
export const MATCH_THRESHOLD = 0.8;

/** Below this, the names do not overlap meaningfully — no match. */
export const MIN_NAME_SCORE = 0.5;

const WEIGHT_NAME = 0.5;
const WEIGHT_TYPE = 0.2;
const WEIGHT_LOCATION = 0.3;

const SECONDARY_TYPE_BOOST = 0.1;

type LocationTier = 'SAME_CITY' | 'SAME_PROVINCE' | 'NATIONAL' | 'NONE';

const LOCATION_TIER_SCORE: Record<LocationTier, number> = {
  SAME_CITY: 1,
  SAME_PROVINCE: 0.7,
  NATIONAL: 0.5,
  NONE: 0,
};

export interface DuplicateQuery {
  name: string;
  /** Ordered type labels — the primary type comes first. */
  types?: string[];
  scope?: LocationScope;
  provinceId?: string;
  cityId?: string;
}

export interface TopicForMatch {
  id: string;
  slug: string;
  name: string;
  /** Ordered type labels — the primary type comes first. */
  types: string[];
  status: 'APPROVED' | 'DRAFT' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED';
  provinceId: string | null;
  cityId: string | null;
}

/**
 * Similarity of two topic names (0..1).
 *
 * Single-word names (e.g. «علی», «مکانیکی») are too generic to signal a
 * duplicate on their own, so any single-word involvement stays weak. Multi-word
 * names use token overlap / containment.
 */
export function nameSimilarity(left: string, right: string): number {
  const a = normalizePersian(left);
  const b = normalizePersian(right);

  if (!a || !b) return 0;

  const aTokens = tokenizePersian(a);
  const bTokens = tokenizePersian(b);

  if (aTokens.length < 2 || bTokens.length < 2) {
    // «علی» vs «علی» → weak; «علی» vs «دکتر علی» → weak.
    return a === b ? 0.25 : 0.2;
  }

  if (a === b) return 1;

  // One multi-word name fully contained in the other, e.g. «مکانیکی علی»
  // vs «مکانیکی علی جنوبی».
  if (a.includes(b) || b.includes(a)) return 0.9;

  const shared = aTokens.filter((token) => bTokens.includes(token)).length;

  if (shared === 0) return 0;

  return shared / Math.max(aTokens.length, bTokens.length);
}

/**
 * Multi-type gate. For now the PRIMARY type must match exactly (normalized);
 * shared secondary types only add a small boost and can never create a match
 * on their own.
 *
 * FUTURE TAXONOMY: replace the exact comparison with group/synonym expansion
 * (e.g. «مکانیکی» ~ «تعمیرگاه خودرو» ~ «گاراژ») without changing callers.
 */
export function multiTypeSimilarity(
  queryTypes: string[],
  topicTypes: string[]
): number {
  const queryPrimary = normalizePersian(queryTypes[0] ?? '');
  const topicPrimary = normalizePersian(topicTypes[0] ?? '');

  if (!queryPrimary || queryPrimary !== topicPrimary) return 0;

  const querySecondary = new Set(queryTypes.slice(1).map(normalizePersian));
  const sharedSecondary = topicTypes
    .slice(1)
    .filter((label) => querySecondary.has(normalizePersian(label))).length;

  return Math.min(1, 1 + sharedSecondary * SECONDARY_TYPE_BOOST);
}

/** Compatible-location tier between the query and an existing page. */
function locationTier(query: DuplicateQuery, topic: TopicForMatch): LocationTier {
  const topicLocated = Boolean(topic.provinceId || topic.cityId);

  if (query.cityId) {
    if (topic.cityId === query.cityId) return 'SAME_CITY';
    if (topicLocated && topic.provinceId === query.provinceId) return 'SAME_PROVINCE';
    if (!topicLocated) return 'NATIONAL';
    return 'NONE';
  }

  if (query.provinceId) {
    if (topicLocated && topic.provinceId === query.provinceId) return 'SAME_PROVINCE';
    if (!topicLocated) return 'NATIONAL';
    return 'NONE';
  }

  // Nationwide query: only nationwide pages are considered.
  return topicLocated ? 'NONE' : 'NATIONAL';
}

/** Location overlap between the query and an existing page (0..1). */
export function locationScore(query: DuplicateQuery, topic: TopicForMatch): number {
  return LOCATION_TIER_SCORE[locationTier(query, topic)];
}

/**
 * Combined duplicate score (0..1).
 * Returns 0 when any gate fails — different type, incompatible location, or
 * names without meaningful overlap — so unrelated pages are never surfaced
 * even when they share a city.
 */
export function scoreTopic(query: DuplicateQuery, topic: TopicForMatch): number {
  const typeScore = multiTypeSimilarity(query.types ?? [], topic.types);

  if (typeScore === 0) return 0;

  const location = locationScore(query, topic);

  if (location === 0) return 0;

  const nameScore = nameSimilarity(query.name, topic.name);

  if (nameScore < MIN_NAME_SCORE) return 0;

  return WEIGHT_NAME * nameScore + WEIGHT_TYPE * typeScore + WEIGHT_LOCATION * location;
}
