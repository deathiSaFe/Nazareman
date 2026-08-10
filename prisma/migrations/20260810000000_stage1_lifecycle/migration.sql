-- Stage 1: lifecycle moderation statuses + Submission review metadata.
--
-- Data-preserving strategy:
--   * PENDING  -> PENDING_REVIEW  (rename, keeps all live rows)
--   * + DRAFT, + CHANGES_REQUESTED (additive enum values)
--   * + REQUEST_CHANGES, + EDIT on ModerationAction (additive)
--   * Submission gains decidedById / decisionNote (nullable, additive)
--
-- This is the shared ModerationStatus enum, so Comment.status and
-- TopicTypeSuggestion.status rows that were 'PENDING' also become
-- 'PENDING_REVIEW'. Application code was updated to match.

ALTER TYPE "ModerationStatus" RENAME VALUE 'PENDING' TO 'PENDING_REVIEW';
ALTER TYPE "ModerationStatus" ADD VALUE 'DRAFT';
ALTER TYPE "ModerationStatus" ADD VALUE 'CHANGES_REQUESTED';

ALTER TYPE "ModerationAction" ADD VALUE 'REQUEST_CHANGES';
ALTER TYPE "ModerationAction" ADD VALUE 'EDIT';

ALTER TABLE "Submission" ADD COLUMN "decidedById" UUID;
ALTER TABLE "Submission" ADD COLUMN "decisionNote" TEXT;

ALTER TABLE "Submission"
    ADD CONSTRAINT "Submission_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Submission_decidedById_idx" ON "Submission"("decidedById");
