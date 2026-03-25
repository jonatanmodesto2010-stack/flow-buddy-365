
ALTER TABLE public.organization_integrations 
ADD COLUMN IF NOT EXISTS sync_interval_minutes integer NOT NULL DEFAULT 10;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
