

## Plano: Corrigir exibição do tempo de conexão

### Problema
Os logs mostram `radacct: found times for 0 clients` — a busca no `radacct` não encontra correspondências por username. Porém, a tabela `radusuarios` (já consultada) possui os campos necessários:
- `ultima_conexao_inicial` → início da última conexão
- `ultima_conexao_final` → fim da última conexão
- `online` → S ou N

### Solução
Eliminar a consulta ao `radacct` e extrair os tempos diretamente de `radusuarios` no `processRecords`.

### Alteração: `supabase/functions/ixc-check-online/index.ts`

**No `processRecords`** (linha ~107), além de capturar `online` e `login`, popular `connectionTimes` diretamente:

```
if online === 'S' e ultima_conexao_inicial existe:
  connectionTimes[clientId] = { since: ultima_conexao_inicial, online: true }
senão se ultima_conexao_final existe:
  connectionTimes[clientId] = { since: ultima_conexao_final, online: false }
```

**Remover** todo o bloco de consulta ao `radacct` (linhas 138-203), já que não é mais necessário.

### Resultado
- Zero chamadas extras à API IXC (sem radacct)
- Tempo de conexão aparece imediatamente nos cards
- Performance melhorada (menos requests)

### Arquivos alterados
- `supabase/functions/ixc-check-online/index.ts`

### O que NÃO muda
- Frontend (`Clients.tsx`) — já consome `connection_times` corretamente
- `client-utils.ts` — `formatConnectionDuration` já funciona

