

## Problem Identified: Stale Closure in Auto-Reload

The auto-reload `useEffect` (line 330) captures a **stale version of `loadClients`** because its dependency array only includes `[organizationId]`. When the sync completes and calls `loadClients()`, it uses the filter values (`searchTerm`, `statusFilter`, `filialFilter`) from when the effect was first created -- not the current filter values.

This means:
- User sets filters (e.g. Status: Bloqueados) -- UI badges update correctly
- Auto-sync completes, triggers `loadClients()` with **old/default filter values** (statusFilter='all')
- Result: 1649 clients loaded ignoring the active filters, even though the filter badges still show correctly

## Fix

Store `loadClients` in a ref so the auto-reload effect always calls the latest version.

### File: `src/pages/Clients.tsx`

1. Add a `loadClientsRef` that always points to the current `loadClients` function
2. Update the auto-reload `useEffect` to call `loadClientsRef.current()` instead of `loadClients()`

```text
// Add after loadClients definition (~line 218):
const loadClientsRef = useRef(loadClients);
loadClientsRef.current = loadClients;

// In the auto-reload useEffect (line 354), change:
//   loadClients();
// to:
//   loadClientsRef.current();
```

This is a minimal, targeted fix -- only 3 lines changed. The filter state will be correctly applied even when the auto-reload triggers after a sync.

