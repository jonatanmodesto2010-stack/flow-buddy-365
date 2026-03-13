CREATE TABLE public.system_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  version text,
  module text NOT NULL,
  change_type text NOT NULL,
  summary text NOT NULL,
  details text,
  files_changed text[],
  expected_impact text,
  risk_level text DEFAULT 'low',
  status text DEFAULT 'applied',
  environment text DEFAULT 'production',
  error_notes text,
  result text,
  is_rollback boolean DEFAULT false,
  rollback_of uuid REFERENCES public.system_changelog(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_changelog ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_system_changelog_updated_at
  BEFORE UPDATE ON public.system_changelog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Users can view changelog from their org"
  ON public.system_changelog FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Admins can insert changelog"
  ON public.system_changelog FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Admins can update changelog"
  ON public.system_changelog FOR UPDATE
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );