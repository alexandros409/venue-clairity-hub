ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_observation_type_check;
ALTER TABLE public.audits
  ADD CONSTRAINT audits_observation_type_check
  CHECK (observation_type IN ('negative','positive','emotional','opportunity'));