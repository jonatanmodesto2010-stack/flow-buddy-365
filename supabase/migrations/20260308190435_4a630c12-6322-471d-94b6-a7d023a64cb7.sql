CREATE OR REPLACE VIEW public.unique_client_timelines WITH (security_invoker = true) AS
SELECT DISTINCT ON (organization_id, COALESCE(client_id, id::text))
  id, client_name, client_id, status, is_active, organization_id,
  ixc_filial_id, ixc_filial_name, start_date, created_at, updated_at,
  user_id, completed_at, completion_notes, boleto_value, due_date
FROM client_timelines
ORDER BY
  organization_id,
  COALESCE(client_id, id::text),
  CASE
    WHEN NOT is_active AND status NOT IN ('archived', 'completed') THEN 0
    WHEN is_active AND status = 'active' THEN 1
    WHEN status = 'archived' THEN 2
    WHEN status = 'completed' THEN 3
    ELSE 4
  END,
  updated_at DESC NULLS LAST;