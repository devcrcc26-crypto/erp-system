-- Phase 1: link change requests to issues (mirrors RFI linked_cr_ids).
ALTER TABLE issue
  ADD COLUMN IF NOT EXISTS linked_cr_ids TEXT[] DEFAULT '{}';
