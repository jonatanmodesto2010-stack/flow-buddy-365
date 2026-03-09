

## Plano: Campo `ixc_alert_line` para sincronização robusta

### Resumo

Adicionar coluna `ixc_alert_line` na tabela `timeline_events` para guardar a linha exata enviada ao IXC. Na exclusão, usar essa linha diretamente sem reconstrução.

### 1. Migração SQL

```sql
ALTER TABLE timeline_events ADD COLUMN ixc_alert_line text;
```

### 2. Edge Function `ixc-update-alert/index.ts`

- Na **criação** (action padrão): retornar `alert_line` no response com a linha exata gerada
- Adicionar action `remove_line`: recebe `alert_line` (string exata), filtra por igualdade, faz PUT se encontrou match
- Manter action `remove` existente como fallback

Body novo para `remove_line`:
```json
{ "action": "remove_line", "organization_id": "...", "ixc_client_id": "...", "alert_line": "[09/03/2026 13:59:40] descrição" }
```

### 3. Interface Event — todos os arquivos

Adicionar `ixc_alert_line?: string` à interface `Event` em:
- `Timeline.tsx`
- `ClientTimeline.tsx`
- `ClientTimelineDialog.tsx`

### 4. Criação do evento — salvar `ixc_alert_line`

**Timeline.tsx** (`handleSaveEvent`, linha 172): após invocar `ixc-update-alert`, se sucesso, fazer `UPDATE timeline_events SET ixc_alert_line = result.alert_line WHERE description = ... AND line_id = ...`

**ClientTimeline.tsx** (`handleSaveEvent`, linha 203): mesmo padrão — após IXC sync, salvar `ixc_alert_line` no banco.

**ClientTimelineDialog.tsx** (`updateLine`, linha ~195): após invocar IXC, salvar `ixc_alert_line`.

### 5. Exclusão do evento — usar `ixc_alert_line`

**Timeline.tsx** (`handleDeleteEvent`, linhas 222-319): capturar `deletedEvent.ixc_alert_line` antes de remover. Se existir, chamar `action: 'remove_line'` com `alert_line`. Sem depender de `created_at`.

**ClientTimeline.tsx** (`handleDeleteEvent`, linhas 278-324): mesmo padrão.

**ClientTimelineDialog.tsx**: o `updateLine` prop já recebe os eventos — na exclusão o componente pai captura `ixc_alert_line` antes.

### 6. Mapeamento ao carregar

- `ClientTimeline.tsx` (linha 129-138): já mapeia `created_at`, adicionar `ixc_alert_line: e.ixc_alert_line`
- `ClientTimelineDialog.tsx` (linha 123-133): adicionar `ixc_alert_line: e.ixc_alert_line`

### 7. `saveLineToDatabase` em `ClientTimeline.tsx` (linha 376-419)

Incluir `ixc_alert_line` no insert para preservar o campo durante o ciclo delete+insert.

### Comportamento na exclusão

1. Captura `ixc_alert_line` do evento
2. Exclusão local acontece normalmente
3. Se `ixc_alert_line` existe, chama IXC em background (non-blocking)
4. Se falhar, apenas `console.warn` — sem rollback

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| Migração SQL | `ADD COLUMN ixc_alert_line text` |
| `supabase/functions/ixc-update-alert/index.ts` | Retornar `alert_line` na criação + action `remove_line` |
| `src/components/Timeline.tsx` | Interface + salvar/usar `ixc_alert_line` |
| `src/components/ClientTimeline.tsx` | Interface + mapear + salvar/usar `ixc_alert_line` + preservar em `saveLineToDatabase` |
| `src/components/ClientTimelineDialog.tsx` | Mapear `ixc_alert_line` + usar na exclusão |

