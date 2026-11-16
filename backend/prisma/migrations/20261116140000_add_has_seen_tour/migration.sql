-- First-login product tour (frontend AppTour): set once the user finishes or skips it.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "has_seen_tour" BOOLEAN NOT NULL DEFAULT false;
