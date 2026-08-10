import type { User } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';

/** A permission failure carrying its HTTP status. */
export class PermissionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PermissionError';
    this.status = status;
  }
}

/** The signed-in user or 401. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new PermissionError(401, 'برای این کار باید وارد حساب کاربری شوید.');
  }
  return user;
}

/** The signed-in, phone-verified user or 401/403. */
export async function requireVerifiedUser(): Promise<User> {
  const user = await requireUser();
  if (!user.phoneVerified) {
    throw new PermissionError(403, 'برای این کار باید شماره موبایل شما تأیید شده باشد.');
  }
  return user;
}

/** True when the given user is an admin (UserRole.ADMIN on the session user). */
export function isAdminUser(user: User | null): boolean {
  return Boolean(user && user.role === 'ADMIN');
}

/** The signed-in admin user (role ADMIN) or 401/403. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') {
    throw new PermissionError(403, 'برای این کار به دسترسی مدیریت نیاز دارید.');
  }
  return user;
}

/** The signed-in admin user, or null when the caller is not an admin. */
export async function getAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return isAdminUser(user) ? user : null;
}

/** The moderation statuses a Topic can be in. */
export type TopicStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REJECTED';

export interface TopicPermissionFields {
  id: string;
  submittedById: string | null;
  status: TopicStatus;
}

/**
 * Statuses a verified creator may directly edit. APPROVED pages are canonical
 * public data and are NOT included — they are immutable to everyone except
 * admins. PENDING_REVIEW is locked while the admin is reviewing it.
 */
const CREATOR_EDITABLE_STATUSES: readonly TopicStatus[] = [
  'DRAFT',
  'CHANGES_REQUESTED',
  'REJECTED',
];

/**
 * Statuses a creator may explicitly submit for review. Submitting is a
 * creator-only action; admins change status through their own endpoints.
 */
const CREATOR_SUBMITTABLE_STATUSES: readonly TopicStatus[] = [
  'DRAFT',
  'CHANGES_REQUESTED',
  'REJECTED',
];

/**
 * Whether the session user may directly modify a topic's fields.
 *
 * - Admin: any status.
 * - Verified creator of the topic: only their own DRAFT / CHANGES_REQUESTED /
 *   REJECTED topics (never APPROVED or PENDING_REVIEW).
 * - Anyone else: never.
 */
export function canDirectlyEditTopic(
  user: User | null,
  topic: TopicPermissionFields,
  admin: boolean
): boolean {
  if (admin) return true;
  if (!user || !user.phoneVerified) return false;
  if (topic.submittedById !== user.id) return false;
  return CREATOR_EDITABLE_STATUSES.includes(topic.status);
}

/**
 * Whether the session user may submit their own topic for review. The creator
 * may only submit DRAFT / CHANGES_REQUESTED / REJECTED topics.
 */
export function canSubmitTopic(
  user: User | null,
  topic: TopicPermissionFields
): boolean {
  if (!user || !user.phoneVerified) return false;
  if (topic.submittedById !== user.id) return false;
  return CREATOR_SUBMITTABLE_STATUSES.includes(topic.status);
}

/**
 * Whether the session user may view a non-public topic (anything that is not
 * APPROVED). Only the submitting creator or an admin may see these; everyone
 * else gets a clean 404 so the page's existence stays hidden.
 */
export function canViewNonPublicTopic(
  user: User | null,
  topic: TopicPermissionFields,
  admin: boolean
): boolean {
  if (admin) return true;
  if (!user) return false;
  return topic.submittedById === user.id;
}
