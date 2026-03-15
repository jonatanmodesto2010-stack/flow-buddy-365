

## Plano: Edge Function `create-or-add-user-to-organization`

### 1. Criar Edge Function

**Arquivo:** `supabase/functions/create-or-add-user-to-organization/index.ts`

**Input:** `{ email, password?, full_name, organization_id, role }`
- `password` obrigatório apenas quando usuário não existe

**Autenticação (verify_jwt = true):**
- Extrair JWT do header Authorization
- Usar `supabase.auth.getUser()` para obter `user_id`
- Consultar `user_roles` com service_role para verificar se o chamador tem role `owner` ou `admin` na `organization_id` informada
- Rejeitar com 403 se não tiver permissão

**Busca de usuário existente:**
```sql
SELECT id FROM auth.users WHERE email = $1
```
Usando client com `service_role` (query direta, não `listUsers`)

**Fluxo se NÃO existe:**
1. `adminClient.auth.admin.createUser()` com `email_confirm: true`
2. Inserir em `profiles` (id, full_name, organization_id)
3. Inserir em `user_roles` (user_id, organization_id, role)
4. Se passo 2 ou 3 falhar → deletar usuário criado (`admin.deleteUser`)
5. Retornar `{ created: true, linked: true, user_id }`

**Fluxo se JÁ existe:**
1. Verificar se já tem registro em `user_roles` para essa org
2. Se sim → retornar `{ created: false, linked: false, message: "Usuário já pertence à organização" }`
3. Se não → inserir em `user_roles` + atualizar `profiles.organization_id`
4. Retornar `{ created: false, linked: true, user_id }`

**Verificação de limite:** chamar `check_org_user_limit` antes de inserir

### 2. Atualizar `AddUserDialog.tsx`

- Remover `supabase.auth.signUp()` e `waitForProfile()`
- Chamar `supabase.functions.invoke('create-or-add-user-to-organization', { body: {...} })`
- Tratar resposta: mensagem diferente se criou ou apenas vinculou
- Manter validação zod e UX existente
- Tornar campo `password` opcional (exibir nota: "necessário apenas para novos usuários")

### 3. Atualizar `AdminOrganizationDetail.tsx`

- `handleAddUser` passa a chamar a mesma edge function
- Remover chamada a `admin-create-organization` com `action: 'add_user_to_org'`

### Arquivos

| Arquivo | Ação |
|---------|------|
| `supabase/functions/create-or-add-user-to-organization/index.ts` | Criar |
| `src/components/settings/AddUserDialog.tsx` | Alterar |
| `src/pages/admin/AdminOrganizationDetail.tsx` | Alterar |

**Nota:** `config.toml` não precisa de alteração pois `verify_jwt = true` é o padrão.

