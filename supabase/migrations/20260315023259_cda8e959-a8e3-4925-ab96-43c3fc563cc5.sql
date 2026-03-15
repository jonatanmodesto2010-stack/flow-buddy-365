
-- Create a secure public view that excludes sensitive fields
CREATE VIEW public.organization_integrations_public
WITH (security_invoker = on) AS
SELECT
  id,
  organization_id,
  integration_type,
  is_active,
  ixc_os_retirada_assunto_id,
  last_sync_at,
  last_boleto_sync_at,
  created_at,
  updated_at
FROM public.organization_integrations;

-- Add SELECT policy for all org members on the base table
-- This works because security_invoker=on makes the view use the caller's permissions
CREATE POLICY "Members can view non-sensitive integration config"
ON public.organization_integrations
FOR SELECT
TO authenticated
USING (organization_id = get_user_organization(auth.uid()));
