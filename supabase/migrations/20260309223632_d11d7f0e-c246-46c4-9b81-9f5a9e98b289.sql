
-- Fix: The "Members can cancel sync logs" policy is RESTRICTIVE, but there are NO permissive policies.
-- In PostgreSQL, without a permissive policy, all operations are denied by default.
-- Solution: Drop the restrictive policy and recreate it as PERMISSIVE.

DROP POLICY IF EXISTS "Members can cancel sync logs" ON public.integration_sync_log;

CREATE POLICY "Members can cancel sync logs"
ON public.integration_sync_log
FOR UPDATE
TO authenticated
USING (organization_id = get_user_organization(auth.uid()))
WITH CHECK (organization_id = get_user_organization(auth.uid()));

-- Also make the SELECT policy permissive so users can actually read their logs
DROP POLICY IF EXISTS "Users can view sync logs from their organization" ON public.integration_sync_log;

CREATE POLICY "Users can view sync logs from their organization"
ON public.integration_sync_log
FOR SELECT
TO authenticated
USING (organization_id = get_user_organization(auth.uid()));
