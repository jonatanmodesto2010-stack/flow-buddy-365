CREATE OR REPLACE FUNCTION public.batch_upsert_boletos(p_ids uuid[], p_values numeric[], p_dates date[], p_statuses text[], p_values_open numeric[] DEFAULT NULL)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  UPDATE client_boletos SET
    boleto_value = d.val,
    due_date = d.dd,
    status = d.st,
    boleto_value_open = COALESCE(d.val_open, client_boletos.boleto_value_open),
    updated_at = now()
  FROM unnest(p_ids, p_values, p_dates, p_statuses, p_values_open) AS d(id, val, dd, st, val_open)
  WHERE client_boletos.id = d.id;
$$;