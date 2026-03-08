
ALTER TABLE public.client_timelines 
ADD COLUMN IF NOT EXISTS ixc_filial_id text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ixc_filial_name text DEFAULT NULL;
