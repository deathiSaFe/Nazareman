import type { User } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { validateAdminPassword } from '@/lib/admin-auth';

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

/**
 * True when the request carries a valid admin password. This reuses the single
 * existing admin mechanism (ADMIN_PASSWORD); it is not a second auth system.
 */
export function requestIsAdmin(request: NextRequest): boolean {
  const raw = request.headers.get('x-admin-password') ?? '';
  try {
    return validateAdminPassword(decodeURIComponent(raw));
  } catch {
    return validateAdminPassword(raw);
  }
}

export interface TopicPermissionFields {
  submittedById: string | null;
}

/**
 * Whether the session user may edit a topic. Admin is passed explicitly because
 * admin authentication currently uses ADMIN_PASSWORD rather than a User row.
 */
export function canEditTopic(
  user: User | null,
  topic: TopicPermissionFields,
  admin: boolean
): boolean {
  if (admin) return true;
  if (!user || !user.phoneVerified) return false;
  return topic.submittedById === user.id;
}

/** Whether the session user may view/edit a PENDING topic (creator or admin). */
export function canViewPendingTopic(
  user: User | null,
  topic: TopicPermissionFields,
  admin: boolean
): boolean {
  if (admin) return true;
  if (!user) return false;
  return topic.submittedById === user.id;
}
