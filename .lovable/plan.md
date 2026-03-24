

## Plano: Mover filtro de Filial para dentro dos Filtros Avançados

### Problema
O filtro de filial existe como um `<Select>` separado no header da página de Clientes (linha 512-525 de `Clients.tsx`), mas não aparece dentro do popover de Filtros Avançados do componente `ClientSearchFilters`. O usuário espera encontrá-lo no painel de filtros avançados.

### Solução
Adicionar o campo "Filial" dentro do popover de filtros avançados em `ClientSearchFilters`, e remover o `<Select>` standalone do header em `Clients.tsx`.

### Arquivos alterados

#### 1. `src/hooks/useOrganizationFilters.tsx`
- Adicionar `filialFilter: string` ao `FilterValues` interface (default: `'all'`)
- Adicionar ao `DEFAULT_FILTERS`

#### 2. `src/components/ClientSearchFilters.tsx`
- Receber `filiais: [string, string][]` como prop
- Adicionar um `<Select>` de "Filial" no popover, entre Status e Ordenação
- Incluir `filialFilter !== 'all'` no `activeFiltersCount`
- Adicionar badge ativo para filial no display de filtros ativos

#### 3. `src/pages/Clients.tsx`
- Remover o `<Select>` de filial standalone do header (linhas 512-525)
- Remover o state `filialFilter` local — usar o valor vindo do `onFilterChange`
- Passar `filiais` como prop para `<ClientSearchFilters>`
- Ler `filialFilter` dos filtros retornados pelo callback `onFilterChange`

### Detalhes técnicos

**Nova prop em ClientSearchFilters:**
```ts
interface ClientSearchFiltersProps {
  onFilterChange: (filters: FilterValues) => void;
  organizationId: string | null;
  pageName: string;
  filiais?: [string, string][]; // novo
}
```

**Novo campo no popover (após Status, antes de Ordenação):**
```text
Filial
[Select: Todas filiais / filial1 / filial2 / ...]
```

Só renderiza se `filiais.length > 0`.

**Badge ativo:**
```text
Filial: <nome_da_filial> [X]
```

### O que NÃO muda
- Lógica de carregamento de filiais (`loadFiliais` em Clients.tsx)
- Query de filtragem por `ixc_filial_id`
- Outras páginas (Dashboard mantém seu filtro próprio)

