-- Stage 5: OwnershipRequest + PageOwnership linkage + ownership moderation actions.
-- Additive and data-preserving (reuses the existing Stage 3 PageOwnership table).

CREATE TYPE "OwnershipRequestStatus" AS ENUM ('PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');

ALTER TYPE "ModerationAction" ADD VALUE 'OWNERSHIP_APPROVE';
ALTER TYPE "ModerationAction" ADD VALUE 'OWNERSHIP_REJECT';
ALTER TYPE "ModerationAction" ADD VALUE 'OWNERSHIP_REQUEST_CHANGES';

CREATE TABLE "OwnershipRequest" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "evidence" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "OwnershipRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "decidedById" UUID,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnershipRequest_topicId_status_idx" ON "OwnershipRequest"("topicId", "status");
CREATE INDEX "OwnershipRequest_userId_status_idx" ON "OwnershipRequest"("userId", "status");
CREATE INDEX "OwnershipRequest_decidedById_idx" ON "OwnershipRequest"("decidedById");

ALTER TABLE "OwnershipRequest"
    ADD CONSTRAINT "OwnershipRequest_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnershipRequest"
    ADD CONSTRAINT "OwnershipRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnershipRequest"
    ADD CONSTRAINT "OwnershipRequest_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PageOwnership" ADD COLUMN "ownershipRequestId" UUID;

ALTER TABLE "PageOwnership"
    ADD CONSTRAINT "PageOwnership_ownershipRequestId_fkey"
    FOREIGN KEY ("ownershipRequestId") REFERENCES "OwnershipRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PageOwnership_ownershipRequestId_key" ON "PageOwnership"("ownershipRequestId");

ALTER TABLE "ModerationLog" ADD COLUMN "ownershipRequestId" UUID;

ALTER TABLE "ModerationLog"
    ADD CONSTRAINT "ModerationLog_ownershipRequestId_fkey"
    FOREIGN KEY ("ownershipRequestId") REFERENCES "OwnershipRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ModerationLog_ownershipRequestId_idx" ON "ModerationLog"("ownershipRequestId");
