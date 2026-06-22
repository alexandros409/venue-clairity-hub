
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS concept_type text,
  ADD COLUMN IF NOT EXISTS tables integer,
  ADD COLUMN IF NOT EXISTS avg_covers_per_table numeric,
  ADD COLUMN IF NOT EXISTS avg_check_per_person numeric,
  ADD COLUMN IF NOT EXISTS cycles_per_shift numeric;
