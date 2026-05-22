SELECT current_database() AS database_name;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = 'whjournal'
    )
    THEN 'ok'
    ELSE 'missing'
  END AS whjournal_schema_status;

SELECT expected.table_name,
  CASE
    WHEN actual.table_name IS NULL THEN 'missing'
    ELSE 'ok'
  END AS status
FROM (
  VALUES
    ('users'),
    ('email_verification_codes'),
    ('password_reset_codes'),
    ('consents'),
    ('journal_entries'),
    ('ai_extractions'),
    ('pattern_observations'),
    ('red_flag_events'),
    ('doctor_exports'),
    ('audit_events'),
    ('schema_migrations')
) AS expected(table_name)
LEFT JOIN information_schema.tables actual
  ON actual.table_schema = 'whjournal'
 AND actual.table_name = expected.table_name
ORDER BY expected.table_name;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'whjournal'
ORDER BY tablename, indexname;

SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'whjournal'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'whjournal'
  AND table_name = 'users'
  AND column_name IN ('id', 'login_id', 'email', 'email_verified_at', 'password_hash')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'whjournal'
  AND table_name = 'ai_extractions'
  AND column_name IN ('id', 'journal_entry_id', 'model', 'analysis_source', 'extracted_json', 'confidence')
ORDER BY column_name;
