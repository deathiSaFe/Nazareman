import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE = 'nazareman_session';

const SESSION_MAX_AGE_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a server-recognized session and return the opaque client token. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return token;
}

/** Store the session token in an HttpOnly cookie. */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
  });
}

/** Destroy the current session (DB row + cookie). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }

  store.delete(SESSION_COOKIE);
}

/**
 * Resolve the currently signed-in user from the session cookie, or null.
 * The identity always comes from the server-side session — never from a value
 * supplied by the browser.
 */
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  return session.user;
}

export type PublicUser = {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  phoneVerified: boolean;
  role: 'USER' | 'ADMIN';
};

/** A safe, client-facing representation of a user (no session/secrets). */
export function publicUser(user: {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  phoneVerified: boolean;
  role: 'USER' | 'ADMIN';
}): PublicUser {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    displayName: user.displayName,
    phoneVerified: user.phoneVerified,
    role: user.role,
  };
}
