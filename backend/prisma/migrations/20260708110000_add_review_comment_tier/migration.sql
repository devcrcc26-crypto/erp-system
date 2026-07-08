-- Additive migration: adds a nullable reviewTier column to review_comment.
-- Existing 18 rows get NULL (per-comment tier was never tracked before this
-- change, and ReviewSession.currentTier is a live pointer that has since
-- moved on for closed sessions, so there is no reliable backfill). Every new
-- comment created going forward is populated at creation time in application
-- code (ReviewWorkflowService.addReviewComment / batchReturnEdvs).

ALTER TABLE review_comment ADD COLUMN review_tier "ReviewTier";
