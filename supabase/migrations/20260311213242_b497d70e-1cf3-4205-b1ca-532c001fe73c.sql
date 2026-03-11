CREATE OR REPLACE VIEW public.latest_client_events AS
SELECT DISTINCT ON (tl.timeline_id)
  tl.timeline_id,
  te.icon,
  te.event_date,
  te.description
FROM public.timeline_lines tl
JOIN public.timeline_events te ON te.line_id = tl.id
ORDER BY tl.timeline_id, te.event_date DESC, te.event_order DESC, te.created_at DESC;