

## Plano: Bloqueados sem paginação + auto-reload pós-sync

### Arquivo alterado
- `src/pages/Clients.tsx` (único arquivo)

### 1. Flag derivada

```ts
const isBlockedView = statusFilter === 'blocked';
```

### 2. Refatorar `loadClients()`

**Modo normal** (quando `!isBlockedView`): manter exatamente como está — query com `.range(start, end)` e `ITEMS_PER_PAGE = 30`.

**Modo bloqueados** (quando `isBlockedView`): buscar todos os registros em chunks de 1000 usando loop com `.range()`:
- Montar a mesma query base com filtros (organização, busca, filial, status blocked)
- Executar em loop: `.range(0, 999)`, `.range(1000, 1999)`, etc., até receber menos de 1000 registros
- Concatenar todos os resultados
- Para o count, usar o primeiro request com `{ count: 'exact' }` para obter `totalCount`
- Setar `clients = allResults`

### 3. Ajustar cálculos de paginação

```ts
const totalPages = isBlockedView ? 1 : Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
const startIndex = isBlockedView ? 0 : (currentPage - 1) * ITEMS_PER_PAGE;
const endIndex = isBlockedView ? totalCount : Math.min(startIndex + clients.length, totalCount);
```

### 4. Esconder botões de navegação

Envolver os 4 botões de paginação (`<<`, `<`, `>`, `>>`) em `{!isBlockedView && (...)}`. Manter o botão refresh, history e plus visíveis.

### 5. Processamento auxiliar em chunks

`loadOverdueDays` e `loadLatestEvents` fazem `.in('timeline_id', timelineIds)`. Para listas grandes (>200 IDs), usar `fetchInChunks` já existente em `supabase-helpers.ts` para dividir a consulta. `loadOnlineStatus` já passa `client_ids` para a edge function, que processa internamente — sem alteração necessária.

### 6. Auto-reload pós-sync

Adicionar:
- State: `lastCompletedSyncAt: string | null`
- `useEffect` com `setInterval` de 60s que consulta:
  ```sql
  SELECT completed_at FROM integration_sync_log
  WHERE organization_id = ? AND status = 'completed'
  ORDER BY completed_at DESC LIMIT 1
  ```
- Na primeira leitura, apenas salva o valor sem recarregar
- Nas leituras seguintes, se `completed_at` for diferente e mais recente, atualiza state e chama `loadClients()`
- Cleanup no unmount

### O que NÃO muda
- Layout visual dos cards
- Edge functions
- Sincronização IXC
- Calendário
- Filtros Todos/Ativos/Inativos/Finalizados (paginação de 30)

