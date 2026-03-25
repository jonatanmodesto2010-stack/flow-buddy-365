

## Plano: Login com screenshots reais do sistema + logo Provedor Ligado

### Resumo
Substituir os mockups CSS do `DashboardShowcase` por screenshots reais das funcionalidades do sistema (cards de clientes, calendário, timeline) exibidos como imagens com efeito glassmorphism, e adicionar a logo "Provedor Ligado" no topo da coluna esquerda e no formulário de login.

### Arquivos alterados
- `src/pages/Auth.tsx` — reescrever o `DashboardShowcase`
- Copiar 4 imagens para `public/`:
  - `user-uploads://image-54.png` → `public/images/showcase-clients.png`
  - `user-uploads://image-55.png` → `public/images/showcase-calendar.png`
  - `user-uploads://image-56.png` → `public/images/showcase-timeline.png`
  - `user-uploads://image-57.png` → `public/images/logo-provedor-ligado.png`

### Layout da coluna esquerda

```text
┌─────────────────────────────────────┐
│  [Logo Provedor Ligado]             │
│                                     │
│  ┌─────────┐  ┌─────────────────┐   │
│  │ Clientes │  │   Calendário    │   │
│  │ (img-54) │  │   (img-55)     │   │
│  └─────────┘  └─────────────────┘   │
│       ┌─────────────────────┐       │
│       │  Timeline (img-56)  │       │
│       └─────────────────────┘       │
│                                     │
│  "Gestão completa de cobranças"     │
│  "Clientes, calendário, timeline"   │
│  Fundo gradiente escuro + estrelas  │
└─────────────────────────────────────┘
```

### Detalhes

**Imagens do sistema:**
- Cada screenshot dentro de um container com `rounded-xl`, `shadow-2xl`, `border border-white/10`, leve rotação/tilt via `transform rotate` para efeito de profundidade
- Sobreposição parcial entre imagens (absolute positioning) criando efeito de "floating cards"
- Escala reduzida (~60-70% do tamanho original) para caber no espaço

**Logo Provedor Ligado:**
- Exibida no topo da coluna esquerda (centralizada, ~200px de largura)
- Também substitui o ícone genérico de `BarChart3` no formulário de login à direita

**Fundo:** mantém gradiente escuro + estrelas + glow (já existentes)

**Texto de marketing:** atualizado para refletir as funcionalidades mostradas:
- Título: "Gestão inteligente de cobranças"
- Subtítulo: "Controle de clientes, calendário de ações e timeline completa em um só lugar"

**Coluna direita:** sem mudanças na lógica, apenas troca o ícone do logo pela imagem `logo-provedor-ligado.png`

### O que NÃO muda
- Toda lógica de autenticação
- Responsividade (mobile esconde coluna esquerda)
- Animações existentes

