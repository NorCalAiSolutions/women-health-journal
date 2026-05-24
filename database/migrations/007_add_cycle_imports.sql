CREATE TABLE IF NOT EXISTS whjournal.cycle_imports (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('txt', 'csv', 'pdf')),
  source_label text NOT NULL,
  sanitized_text_ciphertext text NOT NULL,
  sanitized_text_nonce text NOT NULL,
  normalized_json jsonb NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  ignored_identifiers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cycle_imports_user_created_idx
  ON whjournal.cycle_imports(user_id, created_at DESC);
