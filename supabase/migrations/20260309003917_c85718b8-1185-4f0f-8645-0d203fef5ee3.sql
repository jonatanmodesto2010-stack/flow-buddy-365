-- Fix linter WARN: Extension in Public
-- Recreate pg_net in extensions schema (pg_net does not support ALTER EXTENSION ... SET SCHEMA)

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_net'
  ) THEN
    DROP EXTENSION pg_net;
  END IF;

  -- Install into extensions schema
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
END $$;