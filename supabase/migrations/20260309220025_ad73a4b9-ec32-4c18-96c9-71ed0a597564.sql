
-- Add incremental sync cursor columns
ALTER TABLE public.organization_integrations 
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_boleto_sync_at timestamptz DEFAULT NULL;

-- Add sync_metadata jsonb to integration_sync_log for execution summary
ALTER TABLE public.integration_sync_log 
  ADD COLUMN IF NOT EXISTS sync_metadata jsonb DEFAULT NULL;

-- Create unique index on ixc_boleto_id for native upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_boletos_ixc_id_unique 
  ON public.client_boletos (ixc_boleto_id) WHERE ixc_boleto_id IS NOT NULL;
