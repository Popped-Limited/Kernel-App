-- Onboarding walkthrough flag.
-- New orgs see the "Get started" checklist + guided tour on /home until they
-- complete or dismiss it. Existing orgs are opted out so paying customers
-- (e.g. Yep Kitchen) and the demo org aren't interrupted.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS onboarding_dismissed boolean NOT NULL DEFAULT false;

-- "New orgs only": hide it for every org that exists today.
UPDATE organisations SET onboarding_dismissed = true;

-- No RLS change needed: organisations is already org-scoped and users
-- already read their own row.
