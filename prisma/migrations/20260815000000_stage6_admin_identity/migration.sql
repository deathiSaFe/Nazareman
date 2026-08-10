-- Stage 6: comment moderation audit actions (admin identity migration close-out).
-- Additive and data-preserving.

ALTER TYPE "ModerationAction" ADD VALUE 'COMMENT_APPROVE';
ALTER TYPE "ModerationAction" ADD VALUE 'COMMENT_REJECT';
