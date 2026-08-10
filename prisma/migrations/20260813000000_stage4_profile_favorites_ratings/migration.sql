-- Stage 4: profile avatar, favorites, and 1-5 star ratings.
-- Additive and data-preserving.

ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

CREATE TABLE "Favorite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Favorite_userId_topicId_key" ON "Favorite"("userId", "topicId");
CREATE INDEX "Favorite_topicId_idx" ON "Favorite"("topicId");
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

ALTER TABLE "Favorite"
    ADD CONSTRAINT "Favorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite"
    ADD CONSTRAINT "Favorite_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Rating" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Rating_topicId_userId_key" ON "Rating"("topicId", "userId");
CREATE INDEX "Rating_topicId_idx" ON "Rating"("topicId");
CREATE INDEX "Rating_userId_idx" ON "Rating"("userId");

ALTER TABLE "Rating"
    ADD CONSTRAINT "Rating_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Rating"
    ADD CONSTRAINT "Rating_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
