

## Plano: OS de Retirada de Equipamento no Dashboard

### 1. Migração SQL

```sql
ALTER TABLE organization_integrations ADD COLUMN ixc_os_retirada_assunto_id text;
```

### 2. IntegrationsSettings.tsx

- Add `ixc_os_retirada_assunto_id` to the `Integration` interface
- Add state `osRetiradaAssuntoId` 
- Add input field "ID do Assunto de Retirada (IXC)" after the contracts URL field
- Include in `handleSave` for both update and insert

### 3. Edge Function `ixc-os-retirada/index.ts`

New function following the same auth/CORS pattern as `ixc-update-alert`:

- Receives `organization_id` 
- Fetches IXC credentials + `ixc_os_retirada_assunto_id` from `organization_integrations`
- POSTs to `/webservice/v1/su_oss_chamado` with `grid_param` filtering by `id_assunto`
- Adds secondary filter for open/pending status if IXC supports it (field `su_oss_chamado.status` with common values like `A` for aberta, `EA` for em andamento)
- Limits to 50 records (`rp: "50"`)
- Dedupes `id_cliente` values, batch-fetches client names from `/webservice/v1/cliente/{id}` with in-memory cache
- Returns normalized array: `{ id, id_cliente, cliente_nome, data_abertura, status, descricao }`
- Status normalization map: `A` → `Aberta`, `EA` → `Em andamento`, etc. Unknown values pass through as-is
- Fallback: if client name not found → `"Cliente #ID"`

Config entry:
```toml
[functions.ixc-os-retirada]
verify_jwt = false
```

### 4. EquipmentRetrievalWidget.tsx

New component:
- Uses `useUserRole()` for `organizationId`
- Fetches via `supabase.functions.invoke('ixc-os-retirada', { body: { organization_id } })`
- Auto-refresh every 60 seconds via `setInterval`
- Local pagination: 10 items per page with Previous/Next controls
- Title: "📦 OS de Retirada de Equipamento"
- Each item shows: 📦 icon, `cliente_nome`, formatted `data_abertura` (DD/MM/AAAA), status badge with color coding
- Click behavior: navigate to `/clients` page (the main client route, since there's no individual client route) — or copy the OS ID with toast feedback if no matching client is found
- Loading: skeleton animation
- Empty state: "Nenhuma retirada de equipamento pendente"
- Error: silent console.error, shows empty state

Status badge colors:
- Aberta → yellow
- Em andamento → blue  
- Default → gray

### 5. Dashboard.tsx

Add `<EquipmentRetrievalWidget />` between `<CollectionActionsWidget />` and `<AgreementsOverdueWidget />` (line ~404).

### Files

| File | Action |
|------|--------|
| Migration SQL | `ADD COLUMN ixc_os_retirada_assunto_id text` |
| `supabase/config.toml` | Add `[functions.ixc-os-retirada]` entry |
| `supabase/functions/ixc-os-retirada/index.ts` | New edge function |
| `src/components/settings/IntegrationsSettings.tsx` | Add field for assunto ID |
| `src/components/EquipmentRetrievalWidget.tsx` | New widget component |
| `src/pages/Dashboard.tsx` | Import and render widget |

