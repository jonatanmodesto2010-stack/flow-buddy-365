

## Análise: Reutilização do Card de Cliente para OS de Retirada

### Situação atual

**Card de cliente** — embutido diretamente no JSX de `src/pages/Clients.tsx` (linhas 498-573). Não é um componente separado. Estrutura:
```text
┌─────────────────────────────────────────────────┐
│ [Nome uppercase bold]           [badges] [botão]│
│ [emoji] descrição último evento   data          │
└─────────────────────────────────────────────────┘
```
- Estilos: `rounded-lg p-4 flex items-center gap-4`, cor dinâmica via `getCardStyle()`
- Lado direito: badges (dias atraso, 🔒, ON/OFF, Inativo) + botão circular `TrendingUp`

**Card de OS de Retirada** — embutido em `src/components/EquipmentRetrievalWidget.tsx` (linhas 166-186). Estrutura diferente:
```text
┌──────────────────────────────────────────────┐
│ 📦 [nome cliente]        [badge status] [copy]│
│    data • OS #id                              │
└──────────────────────────────────────────────┘
```
- Estilos: `p-3 rounded-lg border border-border`, sem cor dinâmica

### Conclusão

É possível unificar visualmente. A melhor abordagem é **extrair um componente base compartilhado** (`ClientCard`) que aceite props para os dados variáveis.

### Plano de implementação

**1. Criar `src/components/ClientCard.tsx`**

Componente reutilizável com props:
```typescript
interface ClientCardProps {
  title: string;           // nome (uppercase)
  subtitle?: string;       // linha secundária (último evento ou "data • OS #id")
  subtitleIcon?: string;   // emoji antes do subtitle
  cardStyle?: string;      // classes de cor/borda (default: bg-card border border-border)
  badges?: React.ReactNode; // conteúdo direito (badges, status, botões)
  onClick?: () => void;
}
```

Renderiza exatamente o mesmo layout visual: `rounded-lg p-4 flex items-center gap-4`, hover, cursor-pointer, truncate no título e subtitle.

**2. Atualizar `src/pages/Clients.tsx`**
- Substituir o bloco JSX inline (linhas 499-573) pelo `<ClientCard>` passando:
  - `title={client.client_name}`
  - `subtitle` com dados do `latestEventsMap`
  - `cardStyle={getCardStyle(info)}`
  - `badges` com os badges + botão TrendingUp existentes

**3. Atualizar `src/components/EquipmentRetrievalWidget.tsx`**
- Substituir o bloco JSX inline pelo `<ClientCard>` passando:
  - `title={os.cliente_nome}`
  - `subtitle={\`${formatDate(os.data_abertura)} • OS #${os.id}\`}`
  - `subtitleIcon="📦"`
  - `badges` com Badge de status + botão Copy

### Arquivos alterados
| Arquivo | Ação |
|---------|------|
| `src/components/ClientCard.tsx` | Criar (novo) |
| `src/pages/Clients.tsx` | Usar `<ClientCard>` |
| `src/components/EquipmentRetrievalWidget.tsx` | Usar `<ClientCard>` |

Resultado: ambos os cards ficam visualmente idênticos (mesma altura, borda, tipografia, hover) com conteúdo personalizado via props.

