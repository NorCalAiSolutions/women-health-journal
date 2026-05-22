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
