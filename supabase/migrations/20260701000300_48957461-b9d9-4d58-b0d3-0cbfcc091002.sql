
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS observation_type text NOT NULL DEFAULT 'negative',
  ADD COLUMN IF NOT EXISTS experience_impact text;

UPDATE public.audits
  SET observation_type = CASE WHEN is_positive THEN 'positive' ELSE 'negative' END
  WHERE observation_type = 'negative';

ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_observation_type_check;
ALTER TABLE public.audits
  ADD CONSTRAINT audits_observation_type_check
  CHECK (observation_type IN ('negative','positive','emotional'));

ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_experience_impact_check;
ALTER TABLE public.audits
  ADD CONSTRAINT audits_experience_impact_check
  CHECK (experience_impact IS NULL OR experience_impact IN ('high','medium','low'));
