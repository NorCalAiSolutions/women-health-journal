ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT ARRAY['user']::text[];

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

UPDATE whjournal.users
SET roles = ARRAY['user']::text[]
WHERE roles IS NULL OR array_length(roles, 1) IS NULL;
