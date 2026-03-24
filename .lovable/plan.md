

## Plano: Refatorar sync de boletos para buscar via contratos

### Problema confirmado
O sync atual busca todos os registros de `fn_areceber` do IXC e mapeia cada boleto para uma timeline local via `id_cliente` (linha 865-867). Boletos cujo `id_cliente` no IXC não corresponde diretamente ao `client_id` local são silenciosamente descartados. Isso causa boletos faltando (ex: cliente 2159).

### Solução
Adicionar um mapa secundário `contrato → timeline_id` construído a partir dos contratos do IXC (`cliente_contrato`), para que boletos que não mapeiem via `id_cliente` possam ser mapeados via `id_contrato`.

### Arquivo alterado
- `supabase/functions/ixc-sync/index.ts`

### Alterações detalhadas

#### 1. No bloco SYNC BOLETOS (linha ~805-810), após carregar timelines e construir `clientToTimeline`

Adicionar:
- Buscar todos os contratos do IXC via `fetchAllIxcRecords(contractsUrl || api_url, token, 'cliente_contrato')`
- Construir mapa `contractToTimeline: Map<string, string>` onde para cada contrato, `id_contrato → timeline_id` (usando `contrato.id_cliente → clientToTimeline`)
- Logar quantos contratos foram mapeados

```text
contractsUrl = integration.api_url_contracts || api_url
contracts = fetchAllIxcRecords(contractsUrl, token, 'cliente_contrato')
contractToTimeline = new Map()
for each contract:
  clientId = String(contract.id_cliente)
  timelineId = clientToTimeline.get(clientId)
  if timelineId:
    contractToTimeline.set(String(contract.id), timelineId)
```

#### 2. Na callback de processamento de boletos (linha ~864-867)

Alterar a resolução de `timelineId` para usar fallback via contrato:

```text
// Antes:
const timelineId = clientToTimeline.get(clientId);
if (!timelineId) continue;

// Depois:
let timelineId = clientToTimeline.get(clientId);
if (!timelineId) {
  const contratoId = String(boleto.id_contrato || '');
  timelineId = contractToTimeline.get(contratoId);
}
if (!timelineId) {
  unmappedCount++;
  continue;
}
```

#### 3. Adicionar contador de boletos não mapeados

- Criar variável `let unmappedCount = 0` antes do stream processing
- Após o stream, logar: `console.log(\`[sync_boletos] ${unmappedCount} boletos sem mapeamento\`)`
- Incluir `unmappedCount` no `sync_metadata` do log

#### 4. Replicar a mesma lógica no bloco SYNC ARECEBER (linha ~1042-1048)

O bloco `sync_areceber` (action `sync_areceber`) tem a mesma lógica de mapeamento por `id_cliente`. Aplicar a mesma correção de fallback via contrato.

### O que NÃO muda
- Layout da página de Clientes
- Lógica de sync de clientes
- Mapeamento de status de boletos (`pago`, `pendente`, `cancelado`)
- Estrutura da tabela `client_boletos`
- Edge functions de diagnóstico

### Por que isso resolve
O boleto de março/2026 da cliente 2159 tem `id_contrato` no IXC que aponta para o `id_cliente = 2159`. Hoje o sync tenta mapear direto via `id_cliente` do boleto, que pode divergir. Com o fallback via contrato, o sync resolve `id_contrato → id_cliente → timeline_id`, garantindo que o boleto entre no banco local.

### Cuidados de performance
- `cliente_contrato` é uma tabela pequena (já buscada no sync de clientes) — custo mínimo
- O mapa `contractToTimeline` é construído uma vez antes do stream, sem impacto no loop principal
- Nenhum request adicional ao IXC por boleto individual

