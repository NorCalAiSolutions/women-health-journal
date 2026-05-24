ALTER TABLE whjournal.users
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS period_started_age_range text,
  ADD COLUMN IF NOT EXISTS hormonal_medication_context text,
  ADD COLUMN IF NOT EXISTS pregnancy_postpartum_status text,
  ADD COLUMN IF NOT EXISTS cycle_baseline text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_age_range_check'
      AND conrelid = 'whjournal.users'::regclass
  ) THEN
    ALTER TABLE whjournal.users
      ADD CONSTRAINT users_age_range_check
      CHECK (age_range IS NULL OR age_range IN ('13_17', '18_24', '25_34', '35_44', '45_plus', 'prefer_not_to_say'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_period_started_age_range_check'
      AND conrelid = 'whjournal.users'::regclass
  ) THEN
    ALTER TABLE whjournal.users
      ADD CONSTRAINT users_period_started_age_range_check
      CHECK (period_started_age_range IS NULL OR period_started_age_range IN ('before_10', '10_12', '13_15', '16_plus', 'not_started', 'not_sure', 'prefer_not_to_say'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_hormonal_medication_context_check'
      AND conrelid = 'whjournal.users'::regclass
  ) THEN
    ALTER TABLE whjournal.users
      ADD CONSTRAINT users_hormonal_medication_context_check
      CHECK (hormonal_medication_context IS NULL OR hormonal_medication_context IN ('none', 'contraception', 'hormonal_medication', 'both', 'unsure', 'prefer_not_to_say'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_pregnancy_postpartum_status_check'
      AND conrelid = 'whjournal.users'::regclass
  ) THEN
    ALTER TABLE whjournal.users
      ADD CONSTRAINT users_pregnancy_postpartum_status_check
      CHECK (pregnancy_postpartum_status IS NULL OR pregnancy_postpartum_status IN ('not_pregnant_or_postpartum', 'pregnant', 'postpartum', 'trying_to_conceive', 'unsure', 'prefer_not_to_say'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_cycle_baseline_check'
      AND conrelid = 'whjournal.users'::regclass
  ) THEN
    ALTER TABLE whjournal.users
      ADD CONSTRAINT users_cycle_baseline_check
      CHECK (cycle_baseline IS NULL OR cycle_baseline IN ('regular', 'somewhat_irregular', 'irregular', 'no_periods', 'not_sure', 'prefer_not_to_say'));
  END IF;
END $$;
