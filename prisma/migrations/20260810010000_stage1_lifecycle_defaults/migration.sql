-- Stage 1: new Topics and Submissions default to DRAFT.
-- Split into its own migration so these statements run in a separate
-- transaction after the 'DRAFT' enum value exists.

ALTER TABLE "Topic" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "Submission" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
