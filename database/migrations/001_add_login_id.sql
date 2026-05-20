ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS login_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_unique_idx
  ON whjournal.users(login_id)
  WHERE login_id IS NOT NULL;
