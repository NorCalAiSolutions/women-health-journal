ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS whjournal.email_verification_codes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_codes_lookup_idx
  ON whjournal.email_verification_codes(user_id, expires_at, used_at);

CREATE TABLE IF NOT EXISTS whjournal.password_reset_codes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_codes_lookup_idx
  ON whjournal.password_reset_codes(user_id, expires_at, used_at);
