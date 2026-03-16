
CREATE TABLE public.collection_status_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  min_days integer NOT NULL,
  max_days integer,
  bg_color text NOT NULL DEFAULT '#ef4444',
  text_color text NOT NULL DEFAULT '#ffffff',
  label text NOT NULL DEFAULT 'ATRASO',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.collection_status_rules ENABLE ROW LEVEL SECURITY;

-- Read: all org members
CREATE POLICY "Users can view status rules from their organization"
  ON public.collection_status_rules FOR SELECT
  TO public
  USING (organization_id = get_user_organization(auth.uid()));

-- Insert: owner/admin only
CREATE POLICY "Owners and admins can insert status rules"
  ON public.collection_status_rules FOR INSERT
  TO public
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Update: owner/admin only
CREATE POLICY "Owners and admins can update status rules"
  ON public.collection_status_rules FOR UPDATE
  TO public
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Delete: owner/admin only
CREATE POLICY "Owners and admins can delete status rules"
  ON public.collection_status_rules FOR DELETE
  TO public
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Super admin full access
CREATE POLICY "Super admins can manage all status rules"
  ON public.collection_status_rules FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
