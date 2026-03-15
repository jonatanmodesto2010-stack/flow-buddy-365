

## Diagnosis: Edge Function `create-or-add-user-to-organization` Crashing

### Root Cause

Line 37-38 calls `callerClient.auth.getClaims(token)` which **does not exist** in `@supabase/supabase-js@2`. The function crashes immediately at this line, before any business logic executes.

Evidence: Edge function logs show only `booted` and `shutdown` events with zero application-level logs.

### Fix Plan

**File:** `supabase/functions/create-or-add-user-to-organization/index.ts`

1. **Replace `getClaims()`** with `adminClient.auth.getUser(token)` to authenticate the caller. This returns `{ data: { user }, error }` with `user.id` as the caller ID.

2. **Add temporary `console.log` at each step** for debugging:
   - After auth validation
   - After permission check (super_admin / owner/admin)
   - After `check_org_user_limit`
   - After `get_user_id_by_email`
   - Before/after `createUser`
   - Before/after `profiles` upsert
   - Before/after `user_roles` insert
   - In Flow B (existing user linking)

### Code Change (lines 32-43)

Replace:
```typescript
const callerClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } },
});

const token = authHeader.replace("Bearer ", "");
const { data: claimsData, error: claimsError } =
  await callerClient.auth.getClaims(token);
if (claimsError || !claimsData?.claims) {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

const callerId = claimsData.claims.sub as string;
```

With:
```typescript
const token = authHeader.replace("Bearer ", "");
const adminClient = createClient(supabaseUrl, serviceRoleKey);

const { data: { user: callerUser }, error: authError } =
  await adminClient.auth.getUser(token);
if (authError || !callerUser) {
  console.log("[LOG] Auth failed:", authError?.message);
  return jsonResponse({ error: "Unauthorized" }, 401);
}

const callerId = callerUser.id;
console.log("[LOG] Caller authenticated:", callerId);
```

Also move `adminClient` creation before this block (it's currently on line 44, after the failing code).

Add `console.log` statements at every subsequent step for debugging.

### Files Changed

| File | Action |
|------|--------|
| `supabase/functions/create-or-add-user-to-organization/index.ts` | Fix auth + add debug logs |

