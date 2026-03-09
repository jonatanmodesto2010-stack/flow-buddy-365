

## Plano: Formato com segundos e timestamp real do evento no alerta IXC

### Problema

1. A edge function usa `new Date()` (horário do runtime) para montar o timestamp — pode divergir do `created_at` do evento no banco
2. Formato atual é `[DD/MM/AAAA HH:MM]` sem segundos — dois eventos no mesmo minuto geram linhas idênticas
3. `ClientTimelineDialog.tsx` não mapeia `created_at` ao carregar eventos, impedindo a remoção precisa

### Mudanças

**1. Edge Function `supabase/functions/ixc-update-alert/index.ts`**

- Aceitar campo `event_created_at` (ISO datetime) no body
- Na action padrão (criação): usar `event_created_at` para montar timestamp em vez de `new Date()`
- Na action `remove`: usar `event_created_at` para reconstruir a linha exata
- Formato final: `[DD/MM/AAAA HH:MM:SS] descrição`

Trecho atual (linhas 170-176):
```typescript
const now = new Date();
const dd = String(now.getDate()).padStart(2, '0');
// ... monta timestamp sem segundos
const timestamp = `[${dd}/${mm}/${yyyy} ${hh}:${min}]`;
```

Trecho novo:
```typescript
function formatAlertTimestamp(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `[${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}]`;
}

// Na criação:
const timestamp = formatAlertTimestamp(event_created_at || new Date().toISOString());
const newEntry = `${timestamp} ${alert_text}`;

// Na remoção:
const expectedLine = `${formatAlertTimestamp(event_created_at)} ${alert_text}`;
const filtered = lines.filter(line => line !== expectedLine);
```

**2. `src/components/Timeline.tsx`**

- `handleSaveEvent` (linha 183-189): após o `updateLine`, buscar o `created_at` real do evento recém-salvo no banco e enviar `event_created_at` para a edge function
- `handleDeleteEvent` (linha 203-250): capturar `description` e `created_at` do evento antes de remover, invocar edge function com `action: 'remove'`, `alert_text`, e `event_created_at`

Problema: o evento novo ainda não tem `created_at` do banco no momento do save. Solução: após o `updateLine` (que salva no banco via prop), consultar `timeline_events` para obter o `created_at` real do evento recém-inserido.

**3. `src/components/ClientTimeline.tsx`**

- `handleSaveEvent` (linhas 224-261): mesmo padrão — após `saveLineToDatabase`, buscar `created_at` do evento no banco e enviar `event_created_at`
- `handleDeleteEvent` (linhas 267-281): capturar `description` e `created_at` antes de remover, invocar edge function com `action: 'remove'`

**4. `src/components/ClientTimelineDialog.tsx`**

- Linha 123-132: adicionar `created_at: e.created_at` no mapeamento de eventos (igual ao que `ClientTimeline.tsx` já faz na linha 138)

### Fluxo final

**Criação:**
1. Evento salvo no banco → `created_at` gerado pelo Postgres (`now()`)
2. Componente busca o `created_at` real do evento salvo
3. Envia `event_created_at` + `alert_text` para edge function
4. Edge function monta: `[09/03/2026 13:41:27] Aguardando retorno`

**Remoção:**
1. Componente captura `created_at` e `description` do evento
2. Envia `action: 'remove'`, `event_created_at`, `alert_text`
3. Edge function reconstrói: `[09/03/2026 13:41:27] Aguardando retorno`
4. Remove linha exata por igualdade de string — se não encontrar, não faz PUT

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/ixc-update-alert/index.ts` | Função `formatAlertTimestamp` com segundos, usar `event_created_at` |
| `src/components/Timeline.tsx` | Enviar `event_created_at` na criação e remoção |
| `src/components/ClientTimeline.tsx` | Enviar `event_created_at` na criação e remoção |
| `src/components/ClientTimelineDialog.tsx` | Mapear `created_at` ao carregar eventos |

