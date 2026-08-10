import { NextRequest, NextResponse } from 'next/server';

/**
 * Minimal in-memory fixed-window rate limiter for the current single-instance
 * deployment. It is intentionally simple and easy to swap for a distributed
 * store (e.g. Redis) later — guarded routes only depend on `isRateLimited()`
 * and `rateLimitResponse()`.
 *
 * In-memory state is per-process: with multiple server instances the effective
 * limits scale by instance count. That is acceptable for this stage and the
 * API surface is designed so a stronger limiter can replace this file without
 * touching the routes.
 */

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

/** Prune the map once it grows past this size, to bound memory usage. */
const MAX_WINDOWS = 10_000;

const windows = new Map<string, RateLimitWindow>();

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Best-effort client IP from the request headers. */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * True when the caller has exceeded the limit for the given key. Each key is
 * scoped to the caller's IP, so a shared key (e.g. `'create-topic'`) is
 * effectively per-IP; callers may append an identifier (phone, user id) to the
 * key to get per-caller windows on top of the IP window.
 */
export function isRateLimited(
  request: NextRequest,
  key: string,
  options: RateLimitOptions
): boolean {
  const now = Date.now();

  if (windows.size > MAX_WINDOWS) {
    for (const [candidateKey, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(candidateKey);
    }
  }

  const fullKey = `${clientIp(request)}:${key}`;
  const entry = windows.get(fullKey);

  if (!entry || entry.resetAt <= now) {
    windows.set(fullKey, { count: 1, resetAt: now + options.windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > options.limit;
}

/** Standard 429 response used by the guarded endpoints. */
export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: 'درخواست‌های زیادی انجام شد. کمی بعد دوباره تلاش کنید.' },
    { status: 429 }
  );
}
