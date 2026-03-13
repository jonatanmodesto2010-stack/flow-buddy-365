

## Plano: Unificação completa dos filtros de Clients.tsx

### Arquivos a modificar

**1. `src/hooks/useOrganizationFilters.tsx`**
- Adicionar `filialFilter: string` ao `FilterValues` com default `'all'`

**2. `src/pages/Clients.tsx`** (refatoração principal)
- Remover estados locais: `searchTerm`, `statusFilter`, `filialFilter`
- Adicionar estado único `filters: FilterValues` com valor inicial dos defaults
- Adicionar `searchDebounceRef` para debounce de 300ms apenas no searchTerm
- Reorganizar `loadClients(filtersToApply)` com funções auxiliares modulares
- Mover seletor de filial para dentro de `ClientSearchFilters`

Estrutura do novo `loadClients()`:

```text
loadClients(filters)
  ├── Se tagsFilter ativo → fetchTimelineIdsByTags() → Set<id>
  ├── Se boletoFilter ativo → fetchTimelineIdsByBoletos() → Set<id>
  ├── Se iconsFilter ativo → fetchTimelineIdsByIcons() → Set<id>
  │     (busca em timeline_events JOIN timeline_lines, histórico completo)
  ├── Se timelineFilter ativo → fetchTimelineIdsByTimeline() → Set<id>
  │     (with_events/no_events via timeline_events, with_analysis via client_analysis_history)
  ├── intersectIdSets(...sets) → finalIds | null
  │     SE algum set retornou vazio (0 resultados) → retorna lista vazia, totalCount=0, PARA
  ├── buildClientQuery(filters, finalIds)
  │     ├── .eq('organization_id', orgId)
  │     ├── searchTerm → .or('client_name.ilike.%, client_id.ilike.%')
  │     ├── statusFilter → .eq('status', ...) / .eq('is_active', ...)
  │     ├── filialFilter → .eq('ixc_filial_id', ...)
  │     ├── dateFrom/dateTo → .gte/.lte em start_date
  │     ├── updateDateFrom/updateDateTo → .gte/.lte em updated_at
  │     ├── finalIds → .in('id', Array.from(finalIds))
  │     └── .order() + .range()
  └── Execute query → setClients, setTotalCount
```

Subconsultas de ícones e timeline usam o histórico completo:
- `iconsFilter`: busca `timeline_events.icon IN (selectedIcons)` via JOIN `timeline_lines` → coleta `timeline_id`s distintos
- `timelineFilter`: `with_events` = timeline_ids que têm pelo menos 1 evento; `no_events` = inverso; `with_analysis` = busca em `client_analysis_history`

Curto-circuito: se qualquer subconsulta retorna conjunto vazio, `loadClients` retorna imediatamente com lista vazia e `totalCount = 0`.

**Debounce**: `useEffect` que observa `filters` usa `searchDebounceRef` com 300ms se apenas `searchTerm` mudou; demais filtros disparam imediatamente.

**3. `src/components/ClientSearchFilters.tsx`**
- Receber `filiais` como prop e renderizar o seletor de filial dentro do componente
- Adicionar `filialFilter` ao `clearFilters()` e ao badge de filtros ativos
- Carregar ícones de `organization_icons` em vez da lista hardcoded
- Fallback: se `organization_icons` vazio, usar lista padrão
- Estruturar interface `{ id, icon, label }` preparada para futuro `icon_key`

### Todos os filtros são server-side
Nenhum pós-filtro client-side. Paginação 100% consistente.

### Resumo de mudanças
| Antes | Depois |
|-------|--------|
| 3 estados locais + hook separado | 1 estado `filters` centralizado |
| Filtros avançados ignorados na query | Todos aplicados via subconsulta + query |
| Sem debounce na busca | 300ms debounce no searchTerm |
| Ícones hardcoded | Ícones dinâmicos de `organization_icons` |
| iconsFilter/timelineFilter não funcionavam | Subconsultas server-side no histórico completo |
| filialFilter fora do objeto de filtros | Dentro do `FilterValues` unificado |

