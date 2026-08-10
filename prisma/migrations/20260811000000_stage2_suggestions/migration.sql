-- Stage 2: Suggestions / Edit Proposals for published pages.
--
-- All additive and data-preserving:
--   * new SuggestionKind / SuggestionStatus enums
--   * ModerationAction gains SUGGESTION_* values
--   * new Suggestion table
--   * ModerationLog gains suggestionId for audit linkage

CREATE TYPE "SuggestionKind" AS ENUM ('FIELD_CHANGE', 'CLOSED', 'MOVED', 'MISSING_INFO', 'PHOTO', 'GENERAL');

CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');

ALTER TYPE "ModerationAction" ADD VALUE 'SUGGESTION_APPROVE';
ALTER TYPE "ModerationAction" ADD VALUE 'SUGGESTION_REJECT';
ALTER TYPE "ModerationAction" ADD VALUE 'SUGGESTION_REQUEST_CHANGES';

CREATE TABLE "Suggestion" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "changes" JSONB,
    "note" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "decidedById" UUID,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Suggestion_topicId_status_idx" ON "Suggestion"("topicId", "status");
CREATE INDEX "Suggestion_authorId_status_idx" ON "Suggestion"("authorId", "status");

ALTER TABLE "Suggestion"
    ADD CONSTRAINT "Suggestion_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Suggestion"
    ADD CONSTRAINT "Suggestion_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Suggestion"
    ADD CONSTRAINT "Suggestion_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationLog" ADD COLUMN "suggestionId" UUID;

ALTER TABLE "ModerationLog"
    ADD CONSTRAINT "ModerationLog_suggestionId_fkey"
    FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ModerationLog_suggestionId_idx" ON "ModerationLog"("suggestionId");
