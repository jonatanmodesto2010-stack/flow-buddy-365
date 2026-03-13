

## Plano Final: Log de Atualizações do Sistema

### 1. Migração SQL

Criar tabela `system_changelog` com os campos adicionais solicitados:

```sql
CREATE TABLE public.system_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid,
  version text,
  module text NOT NULL,
  change_type text NOT NULL,
  summary text NOT NULL,
  details text,
  files_changed text[],
  expected_impact text,
  risk_level text DEFAULT 'low',
  status text DEFAULT 'applied',
  environment text DEFAULT 'production',
  error_notes text,
  result text,
  is_rollback boolean DEFAULT false,
  rollback_of uuid REFERENCES public.system_changelog(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_changelog ENABLE ROW LEVEL SECURITY;

-- Trigger para updated_at automático
CREATE TRIGGER update_system_changelog_updated_at
  BEFORE UPDATE ON public.system_changelog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: visualizar na org
CREATE POLICY "Users can view changelog from their org"
  ON public.system_changelog FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

-- RLS: admin/owner pode inserir
CREATE POLICY "Admins can insert changelog"
  ON public.system_changelog FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );

-- RLS: admin/owner pode atualizar
CREATE POLICY "Admins can update changelog"
  ON public.system_changelog FOR UPDATE
  USING (
    organization_id = get_user_organization(auth.uid())
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );
```

### 2. Novo componente: `SystemChangelogSettings.tsx`

**Listagem com filtros:**
- Busca textual (summary + details via `.or()` + `.ilike()`)
- Filtros: módulo, tipo, versão, status, risco, date range
- Cards com Accordion para expandir detalhes

**Card visual:**
```text
┌──────────────────────────────────────────────────┐
│ 🔴 v2.4.1 • 13/03/2026 14:30 • João             │
│ [bugfix] [clients] [risco: alto] [status: failed]│
│ "Corrigido último evento não atualizando"        │
│ ▶ Expandir detalhes                              │
└──────────────────────────────────────────────────┘
```

Destaque visual por **risco** (borda) + **status** (badge):
- `critical` → borda vermelha | `high` → laranja | `medium` → amarela | `low` → padrão
- `applied` → verde | `validated` → azul | `failed` → vermelho | `rolled_back` → cinza | `planned` → amarelo

Ao expandir: detalhes técnicos, arquivos (chips), impacto, resultado, error_notes, environment, botão "Marcar Rollback".

**Formulário de registro** (dialog, admin/owner):
- Versão (auto `APP_VERSION`)
- Módulo (select)
- Tipo (select)
- Resumo (input)
- Detalhes técnicos (textarea)
- Arquivos alterados (input com chips)
- Impacto esperado (textarea)
- Nível de risco (select)
- **Status** (select: planned, applied, validated, failed, rolled_back)
- **Environment** (select: dev, staging, production)
- **Error Notes** (textarea)
- Resultado (textarea)

### 3. Alteração em `Settings.tsx`

A aba "Histórico" passa a conter **duas sub-abas** via Tabs internos:
- **Log de Atualizações** → `SystemChangelogSettings`
- **Cobranças Finalizadas** → `HistorySettings` (zero alterações)

### 4. Arquivos

| Arquivo | Ação |
|---------|------|
| Migração SQL | Criar tabela + RLS + trigger |
| `src/components/settings/SystemChangelogSettings.tsx` | Criar |
| `src/pages/Settings.tsx` | Alterar aba Histórico para sub-abas |
| `src/components/settings/HistorySettings.tsx` | Sem alteração |

