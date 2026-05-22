ALTER TABLE whjournal.consents
  DROP CONSTRAINT IF EXISTS consents_scope_check;

ALTER TABLE whjournal.consents
  ADD CONSTRAINT consents_scope_check
  CHECK (
    scope IN (
      'AI_ANALYSIS',
      'EXPORTS',
      'RESEARCH_OPT_IN',
      'TERMS_OF_USE',
      'PRIVACY_POLICY',
      'AI_DISCLOSURE',
      'DATA_RIGHTS'
    )
  );
