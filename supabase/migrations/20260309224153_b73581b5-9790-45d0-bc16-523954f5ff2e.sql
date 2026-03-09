
-- 1. Fix RLS: Drop all restrictive policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Members can cancel sync logs" ON public.integration_sync_log;
DROP POLICY IF EXISTS "Service role can manage sync logs" ON public.integration_sync_log;
DROP POLICY IF EXISTS "Super admins can view sync logs" ON public.integration_sync_log;
DROP POLICY IF EXISTS "Users can view sync logs from their organization" ON public.integration_sync_log;

-- Recreate as PERMISSIVE
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

-- 2. Create unique index on client_boletos(ixc_boleto_id) for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_boletos_ixc_id_unique 
  ON public.client_boletos(ixc_boleto_id) WHERE ixc_boleto_id IS NOT NULL;

-- 3. Clean up ALL stuck running syncs
UPDATE public.integration_sync_log
SET status = 'cancelled',
    error_message = 'Auto-cleanup: sync travada durante deploy',
    completed_at = now()
WHERE status = 'running'
