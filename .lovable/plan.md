

## Plan: Fix 409 Error Handling in Sync

### Root Cause
`supabase.functions.invoke()` wraps non-2xx responses into a generic `FunctionsHttpError` with message "Edge Function returned a non-2xx status code". The current code checks `errorMsg.includes('409')` which never matches this generic message. The actual response body (with the 409 details) is available in `result.data` even when `result.error` is set.

### Fix (1 file)

**`src/components/settings/IntegrationsSettings.tsx`** — Rewrite `startSync` error handling:

1. When `result.error` exists, check `result.data` for the response body (Supabase client populates `data` with parsed JSON even on non-2xx)
2. Detect 409 by checking if `result.data?.error` contains "em andamento" or if the error message includes "non-2xx" and data has `running_sync_id`
3. On 409: show informational toast (no `variant: 'destructive'`), log details to console, and pick up the running sync for polling
4. On other errors: keep current destructive toast behavior
5. Add `console.log` with HTTP status context, response body, and action for debugging

```typescript
const startSync = async (syncAction: string) => {
  // ...existing running check...
  try {
    const result = await supabase.functions.invoke('ixc-sync', {
      body: { action: syncAction, organization_id: organizationId },
    });

    // Log for debugging
    console.log('[startSync]', { action: syncAction, error: result.error?.message, data: result.data });

    if (result.error) {
      // Check if response data indicates a 409 conflict
      const responseData = result.data;
      const is409 = responseData?.running_sync_id || 
                     responseData?.error?.includes('em andamento') ||
                     result.error.message?.includes('em andamento');
      
      if (is409) {
        toast({ title: 'Sincronização já em andamento', description: 'Aguarde finalizar antes de iniciar outra.' });
        // Pick up running sync for progress...
        return;
      }
      // Other errors → destructive toast
      toast({ title: 'Erro ao iniciar sincronização', description: result.error.message, variant: 'destructive' });
      return;
    }
    // ...existing success polling...
  }
};
```

### Technical Detail
The Supabase JS client v2 (`@supabase/supabase-js ^2.74.0`) returns parsed response JSON in `result.data` regardless of HTTP status. When the edge function returns `new Response(JSON.stringify({error: "...", running_sync_id: "..."}), { status: 409 })`, the `result.data` will contain `{ error: "...", running_sync_id: "..." }` and `result.error` will have the generic message.

