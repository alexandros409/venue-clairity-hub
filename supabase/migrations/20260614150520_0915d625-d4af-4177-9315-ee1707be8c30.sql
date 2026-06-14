
CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT ALL ON public.venues TO service_role;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage venues" ON public.venues FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  audit_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('morning','evening')),
  bottleneck text NOT NULL,
  problem_category text NOT NULL CHECK (problem_category IN (
    'kitchen_pass','billing_checkout','service_flow','staff_fatigue','leadership_boundaries'
  )),
  diagnosis_type text NOT NULL CHECK (diagnosis_type IN ('structure','emotion','both')),
  estimated_loss_eur numeric(12,2) NOT NULL DEFAULT 0,
  bsps_solution text NOT NULL CHECK (bsps_solution IN ('BSPS-01','BSPS-02','BSPS-03')),
  actionable_steps text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audits TO authenticated;
GRANT ALL ON public.audits TO service_role;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage audits" ON public.audits FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX audits_venue_idx ON public.audits(venue_id);
CREATE INDEX audits_owner_idx ON public.audits(owner_id);
