

## Correção: Skeleton Infinito em Clients.tsx

### Causa Raiz

`Clients.tsx` linha 34 usa `useUserRole()` mas **não consome `isLoading`** do hook. O estado local `loading` (linha 32) começa `true` e só muda para `false` dentro de `loadClients()`, que só roda se `organizationId` for truthy (linha 74). Sem sessão válida, `organizationId` fica `null` para sempre → skeleton eterno.

### Trecho Atual (linhas 32-34, 333-348)

```tsx
// linha 32-34
const [loading, setLoading] = useState(true);
const [overdueDaysLoading, setOverdueDaysLoading] = useState(false);
const { organizationId } = useUserRole();

// linha 333-348
if (loading && clients.length === 0) {
  return (
    <AppLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="h-9 w-48 bg-muted animate-pulse rounded mb-6" />
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) =>
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
```

### Trecho Novo

```tsx
// linha 32-34 → extrair isLoading do hook
const [loading, setLoading] = useState(true);
const [overdueDaysLoading, setOverdueDaysLoading] = useState(false);
const { organizationId, isLoading: roleLoading } = useUserRole();

// linha 333-348 → substituir por:

// 1. Enquanto role ainda carrega, mostrar skeleton
if (roleLoading) {
  return (
    <AppLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="h-9 w-48 bg-muted animate-pulse rounded mb-6" />
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) =>
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// 2. Role carregou mas sem organização → estado claro
if (!organizationId) {
  return (
    <AppLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Nenhuma organização encontrada</h2>
          <p className="text-muted-foreground">
            Você precisa estar vinculado a uma organização para acessar os clientes.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

// 3. Tem organização mas clientes ainda carregando
if (loading && clients.length === 0) {
  return (
    <AppLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="h-9 w-48 bg-muted animate-pulse rounded mb-6" />
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) =>
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
```

### O que muda

| Cenário | Antes | Depois |
|---------|-------|--------|
| Role ainda carregando | Skeleton (correto por acidente) | Skeleton (explícito) |
| Sem sessão / sem organização | **Skeleton infinito** | Mensagem "Nenhuma organização encontrada" |
| Autenticado com org, clientes carregando | Skeleton | Skeleton (sem mudança) |
| Autenticado com org, clientes carregados | Lista normal | Lista normal (sem mudança) |

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Clients.tsx` | Linha 34: extrair `isLoading` como `roleLoading`. Linhas 333-348: substituir por 3 blocos condicionais (roleLoading → sem org → loading clientes). |

O ícone `Building2` já está importado na linha 3. Nenhuma dependência nova.

