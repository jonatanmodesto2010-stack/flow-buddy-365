
-- Fix integration_sync_log RLS: drop RESTRICTIVE policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Members can cancel sync logs" ON public.integration_sync_log;
DROP POLICY IF EXISTS "Service role can manage sync logs" ON public.integration_sync_log;
DROP POLICY IF EXISTS "Super admins can manage sync logs" ON public.integration_sync_log;
DROP POLICY IF EXISTS "Users can view sync logs from their organization" ON public.integration_sync_log;

CREATE POLICY "Users can view sync logs from their organization"
  ON public.integration_sync_log FOR SELECT TO authenticated
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Members can cancel sync logs"
  ON public.integration_sync_log FOR UPDATE TO authenticated
  USING (organization_id = get_user_organization(auth.uid()))
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Super admins can manage sync logs"
  ON public.integration_sync_log FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Service role can manage sync logs"
  ON public.integration_sync_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
