

## Plan: Show Latest Timeline Event Below Client Name

### Database Migration

Create a view `latest_client_events` that returns the most recent event per timeline, using the requested priority: `event_date DESC`, then `event_order DESC`, then `created_at DESC`.

```sql
CREATE OR REPLACE VIEW public.latest_client_events AS
SELECT DISTINCT ON (tl.timeline_id)
  tl.timeline_id,
  te.icon,
  te.event_date,
  te.description
FROM public.timeline_lines tl
JOIN public.timeline_events te ON te.line_id = tl.id
ORDER BY tl.timeline_id, te.event_date DESC, te.event_order DESC, te.created_at DESC;
```

### Frontend Changes (src/pages/Clients.tsx)

1. **New state**: `latestEventsMap: Map<string, { icon: string, event_date: string, description: string }>`

2. **New function `loadLatestEvents`**: After `loadClients` fetches data, extract all timeline IDs and query `latest_client_events` in bulk using `.in('timeline_id', ids)`. Populate the map.

3. **Call it** inside `loadClients` alongside `loadOverdueDays` (parallel, non-blocking).

4. **Card JSX** (around line 481-485): Add one line below the `<h3>` client name, inside the existing `flex-1 min-w-0` div:

```tsx
<div className="flex-1 min-w-0">
  <h3 className="text-card-foreground font-bold text-base uppercase tracking-wide truncate">
    {client.client_name}
  </h3>
  {latestEventsMap.get(client.id) && (
    <p className="text-xs text-muted-foreground mt-0.5 truncate">
      {latestEventsMap.get(client.id)!.icon} {latestEventsMap.get(client.id)!.event_date} {latestEventsMap.get(client.id)!.description}
    </p>
  )}
</div>
```

The indicators div (`flex-shrink-0`, line 487) remains completely untouched.

### Files Changed
- **Database migration**: Create `latest_client_events` view
- **src/pages/Clients.tsx**: Add state, fetch function, and render line

