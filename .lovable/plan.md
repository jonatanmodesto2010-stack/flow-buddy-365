

## Plan: Integrar Descrição do Evento com Campo `alerta` do IXC

### Arquivos a criar/editar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/ixc-update-alert/index.ts` | **Criar** |
| `src/components/ClientTimeline.tsx` | **Editar** — adicionar sync IXC após salvar evento |
| `src/components/Timeline.tsx` | **Editar** — adicionar sync IXC após salvar evento |

### 1. Edge Function `ixc-update-alert`

Recebe `{ organization_id, ixc_client_id, alert_text }`.

**Fluxo:**
1. Busca credenciais IXC em `organization_integrations` (api_url, api_token)
2. Normaliza `api_url` — remove trailing slash, garante que termina com `/webservice/v1`. Se já contém `/webservice/v1`, usa direto. Se não, appenda. Sem regex frágil.
3. **Leitura** do cliente: `POST {base}/cliente/{id}` com header `ixcsoft: listar` — mesmo padrão do `ixc-sync`
4. Extrai campo `alerta` atual do registro retornado
5. **Concatena** com formato: `\n[DD/MM/YYYY HH:MM] texto`
6. **Limita a 10 registros**: split por padrão `\n[`, mantém os 10 mais recentes
7. Monta payload completo com todos os campos do cliente, alterando apenas `alerta`
8. **PUT** `{base}/cliente/{id}` com payload completo
9. Retorna JSON com logs: ixc_client_id, mensagem enviada, sucesso/erro

**Auth**: `verify_jwt = false` no config.toml, validação via `getClaims()` internamente.

**Teste real**: Após deploy, invocar a function com action `test_read` para buscar um cliente por ID e retornar o payload bruto — confirmar que a leitura funciona antes de ativar o PUT.

### 2. ClientTimeline.tsx — `handleSaveEvent` (linha ~222)

Após `await saveLineToDatabase(...)`:
- Buscar `client_id` e `organization_id` de `client_timelines` usando `clientId` (que é `client_timelines.id`)
- Se `client_id` existe e `event.description` não está vazio:
  - `await supabase.functions.invoke('ixc-update-alert', { body: { organization_id, ixc_client_id: client_id, alert_text: event.description } })`
  - Se erro: toast de aviso ("Evento salvo, mas falha ao atualizar alerta no IXC")
  - Se sucesso: toast de sucesso incluindo info do IXC

### 3. Timeline.tsx — `handleSaveEvent` (linha ~172)

Após `updateLine(...)`:
- `timeline.clientInfo.clientId` é o IXC client ID, `timeline.organization_id` disponível
- Mesmo padrão: se clientId e description existem, `await` na edge function
- Toast de aviso se falhar, sem rollback

### Regras de segurança

- Evento salva primeiro, IXC sync é secundário (sem rollback)
- `await` na resposta para feedback claro
- Busca cadastro completo antes do PUT
- Altera apenas `alerta`
- Máximo 10 entradas concatenadas no campo
- Logs claros com IDs e resultado

