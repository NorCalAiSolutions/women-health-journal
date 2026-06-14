CREATE SCHEMA IF NOT EXISTS whjournal;

CREATE TABLE IF NOT EXISTS whjournal.schema_migrations (
  filename text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whjournal.users (
  id text PRIMARY KEY,
  login_id text UNIQUE,
  email text NOT NULL,
  email_verified_at timestamptz,
  password_hash text NOT NULL,
  display_name text,
  roles text[] NOT NULL DEFAULT ARRAY['user']::text[],
  must_change_password boolean NOT NULL DEFAULT false,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  age_range text CHECK (age_range IS NULL OR age_range IN ('13_17', '18_24', '25_34', '35_44', '45_plus', 'prefer_not_to_say')),
  period_started_age_range text CHECK (period_started_age_range IS NULL OR period_started_age_range IN ('before_10', '10_12', '13_15', '16_plus', 'not_started', 'not_sure', 'prefer_not_to_say')),
  hormonal_medication_context text CHECK (hormonal_medication_context IS NULL OR hormonal_medication_context IN ('none', 'contraception', 'hormonal_medication', 'both', 'unsure', 'prefer_not_to_say')),
  pregnancy_postpartum_status text CHECK (pregnancy_postpartum_status IS NULL OR pregnancy_postpartum_status IN ('not_pregnant_or_postpartum', 'pregnant', 'postpartum', 'trying_to_conceive', 'unsure', 'prefer_not_to_say')),
  cycle_baseline text CHECK (cycle_baseline IS NULL OR cycle_baseline IN ('regular', 'somewhat_irregular', 'irregular', 'no_periods', 'not_sure', 'prefer_not_to_say')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS login_id text;

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT ARRAY['user']::text[];

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_unique_idx
  ON whjournal.users(login_id)
  WHERE login_id IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS whjournal.consents (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (
    scope IN (
      'AI_ANALYSIS',
      'EXPORTS',
      'RESEARCH_OPT_IN',
      'TERMS_OF_USE',
      'PRIVACY_POLICY',
      'AI_DISCLOSURE',
      'DATA_RIGHTS'
    )
  ),
  granted boolean NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consents_user_scope_idx ON whjournal.consents(user_id, scope);

CREATE TABLE IF NOT EXISTS whjournal.journal_entries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  raw_text_ciphertext text NOT NULL,
  raw_text_nonce text NOT NULL,
  structured_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_entries_user_occurred_idx ON whjournal.journal_entries(user_id, occurred_at);

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

CREATE TABLE IF NOT EXISTS whjournal.ai_extractions (
  id text PRIMARY KEY,
  journal_entry_id text NOT NULL UNIQUE REFERENCES whjournal.journal_entries(id) ON DELETE CASCADE,
  model text NOT NULL,
  analysis_source text NOT NULL DEFAULT 'unknown' CHECK (analysis_source IN ('openai_llm', 'local_fallback', 'unknown')),
  extracted_json jsonb NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whjournal.ai_extractions
  ADD COLUMN IF NOT EXISTS analysis_source text NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_extractions_analysis_source_check'
      AND conrelid = 'whjournal.ai_extractions'::regclass
  ) THEN
    ALTER TABLE whjournal.ai_extractions
      ADD CONSTRAINT ai_extractions_analysis_source_check
      CHECK (analysis_source IN ('openai_llm', 'local_fallback', 'unknown'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS whjournal.pattern_observations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  journal_entry_id text REFERENCES whjournal.journal_entries(id) ON DELETE SET NULL,
  name text NOT NULL,
  window_days integer NOT NULL,
  trend text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  severity text NOT NULL CHECK (severity IN ('low', 'moderate', 'high', 'urgent')),
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pattern_observations_lookup_idx ON whjournal.pattern_observations(user_id, name, window_days, created_at);

CREATE TABLE IF NOT EXISTS whjournal.red_flag_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  journal_entry_id text NOT NULL REFERENCES whjournal.journal_entries(id) ON DELETE CASCADE,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('LOW', 'MODERATE', 'HIGH', 'URGENT')),
  matched_text text,
  guidance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS red_flag_events_lookup_idx ON whjournal.red_flag_events(user_id, severity, created_at);

CREATE TABLE IF NOT EXISTS whjournal.doctor_exports (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES whjournal.users(id) ON DELETE CASCADE,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  object_key text NOT NULL,
  checksum text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whjournal.audit_events (
  id text PRIMARY KEY,
  user_id text REFERENCES whjournal.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_user_created_idx ON whjournal.audit_events(user_id, created_at);
