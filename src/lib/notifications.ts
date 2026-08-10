import type { Prisma } from '@prisma/client';

export type NotificationKindValue =
  | 'SUBMISSION_DECISION'
  | 'SUGGESTION_DECISION'
  | 'OWNERSHIP_DECISION';

/**
 * Create a user-facing inbox message inside an admin-decision transaction.
 * `kind` + `refId` point back at the originating request row; `title`/`body`
 * are a snapshot of the admin's response. `topicId` gives the inbox entry its
 * page context for navigation.
 */
export function createNotification(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    kind: NotificationKindValue;
    topicId?: string | null;
    refId?: string | null;
    title: string;
    body: string;
  }
) {
  return tx.notification.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      topicId: input.topicId ?? null,
      refId: input.refId ?? null,
      title: input.title,
      body: input.body,
    },
  });
}
