ALTER TABLE whjournal.users
  DROP CONSTRAINT IF EXISTS users_email_key;

DROP INDEX IF EXISTS whjournal.users_email_key;
