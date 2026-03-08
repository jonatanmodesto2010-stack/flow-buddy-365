
CREATE OR REPLACE FUNCTION public.batch_upsert_clients(p_ids uuid[], p_names text[], p_active boolean[], p_statuses text[], p_filial_ids text[] DEFAULT NULL, p_filial_names text[] DEFAULT NULL)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE client_timelines SET
    client_name = d.nm,
    is_active = d.act,
    status = d.st,
    ixc_filial_id = COALESCE(d.fid, client_timelines.ixc_filial_id),
    ixc_filial_name = COALESCE(d.fnm, client_timelines.ixc_filial_name),
    updated_at = now()
  FROM unnest(p_ids, p_names, p_active, p_statuses, p_filial_ids, p_filial_names) AS d(id, nm, act, st, fid, fnm)
  WHERE client_timelines.id = d.id;
$function$;
