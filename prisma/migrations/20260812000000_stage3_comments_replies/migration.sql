-- Stage 3: comment replies, top-level uniqueness, and the PageOwnership model.
--
-- Additive and data-preserving:
--   * Comment.parentId self-relation (replies), one level deep by convention
--   * unique (topicId, authorId) — one contribution per user per topic
--     (legacy NULL authorId rows are exempt in Postgres)
--   * PageOwnership table (model only; the creation flow is a later stage)
--
-- Pre-condition: the known duplicate (topicId, authorId) pair was resolved
-- beforehand (see Stage 3 report); no conflicting non-null pairs remain.

ALTER TABLE "Comment" ADD COLUMN "parentId" UUID;

ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Comment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

CREATE UNIQUE INDEX "Comment_topicId_authorId_key" ON "Comment"("topicId", "authorId");

CREATE TABLE "PageOwnership" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageOwnership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageOwnership_topicId_userId_key" ON "PageOwnership"("topicId", "userId");
CREATE INDEX "PageOwnership_userId_idx" ON "PageOwnership"("userId");

ALTER TABLE "PageOwnership"
    ADD CONSTRAINT "PageOwnership_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageOwnership"
    ADD CONSTRAINT "PageOwnership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
