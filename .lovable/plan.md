

## Plano: Exibir tempo de conexão ao lado do badge ON/OFF

### 1. `src/lib/client-utils.ts` — Adicionar função utilitária

Criar `formatConnectionDuration(since: string | null | undefined): string | null`:
- Calcula `now - since` em milissegundos
- Se `since` inválido/nulo/NaN → retorna `null`
- `>= 1 dia` → `Xd Yh`
- `>= 1 hora` → `Xh Ym`
- `< 1 hora` → `Xm`

### 2. `src/pages/Clients.tsx` — State + fetch + polling + renderização

**State** (linha ~32):
- Adicionar `connectionTimes: Map<string, { since: string; online: boolean }>`

**loadOnlineStatus** (linha ~208):
- Após capturar `data.online_clients`, também capturar `data.connection_times` e popular o state

**Polling 60s**:
- Adicionar `useEffect` com `setInterval` de 60s que:
  1. Re-chama `loadOnlineStatus` para os clientes bloqueados visíveis (re-fetch dos dados)
  2. Incrementa um contador `tick` para forçar re-render do tempo formatado (garante que o texto não fique "travado")

**Renderização badges** (linhas ~490-498):
- Antes do badge ON/OFF, buscar `connectionTimes.get(client.client_id)`
- Se existir `since` válido, renderizar duração formatada em `text-xs text-muted-foreground` antes do badge
- Se não existir, mostrar apenas ON/OFF como hoje

Exemplo visual no card:
```text
[1d 4h] 🟢 ON
[3h 20m] 🔴 OFF
```

### Arquivos alterados
- `src/lib/client-utils.ts`
- `src/pages/Clients.tsx`

### O que NÃO muda
- Edge function `ixc-check-online` (já retorna `connection_times`)
- Cards, busca, filtros, paginação, calendário

