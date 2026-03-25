

## Plano: Redesign da tela de login - Layout split SaaS moderno

### Resumo
Substituir o layout centralizado simples do `Auth.tsx` por um layout dividido em duas colunas: showcase visual à esquerda (60%) e formulário de login à direita (40%). Toda a lógica de autenticação permanece intacta.

### Arquivo alterado
- `src/pages/Auth.tsx` (único arquivo - apenas UI)

### Layout

```text
┌──────────────────────────────┬────────────────────┐
│                              │  🇧🇷 Português  ☀  │
│   [Dashboard mockup visual]  │                    │
│   Gráficos, cards, métricas  │   Logo (favicon)   │
│   Fundo gradiente escuro     │                    │
│   roxo/azul com estrelas     │  Entre em sua conta │
│                              │  Subtítulo          │
│                              │                    │
│   "Novo formato de análise   │  [E-mail]           │
│    de dados"                 │  [Senha]       👁   │
│   "Gráficos interativos..." │                    │
│                              │  ☐ Lembrar e-mail  │
│           60%                │  Esqueceu senha?    │
│                              │                    │
│                              │  [ Entrar ]         │
│                              │       40%           │
└──────────────────────────────┴────────────────────┘
```

### Detalhes da implementação

**Coluna esquerda (hidden no mobile):**
- `w-[60%]` com gradiente `from-[#0f0a2e] via-[#1a1145] to-[#0d1b3e]`
- Pontos/estrelas decorativos via pseudo-elements CSS (pequenos circles absolutos com opacity)
- Dashboard mockup: cards SVG/div simulando gráficos (donut chart, line chart, ranking table) com glassmorphism (`bg-white/10 backdrop-blur`)
- Texto de marketing na parte inferior
- Efeito de glow sutil via box-shadow radial

**Coluna direita:**
- `w-[40%]` (100% no mobile), fundo `bg-card`
- Topo direito: seletor de idioma estático (🇧🇷 Português) + botão toggle tema (já existe ThemeContext)
- Logo: usar `/favicon.png` no topo
- Título: "Entre em sua conta"
- Subtítulo: "Gerencie seus clientes e operações com eficiência"
- Inputs com estilo refinado: bordas arredondadas, focus glow via `ring-primary/50`
- Campo senha com botão mostrar/ocultar (eye icon)
- Checkbox "Lembrar e-mail" com localStorage
- Link "Esqueceu sua senha?" alinhado à direita do checkbox
- Botão "Entrar" com gradiente roxo e hover glow

**Estados preservados:**
- `isForgotPassword` → formulário de recuperação (na mesma coluna direita)
- `isResetMode` → formulário de nova senha (na mesma coluna direita)
- Toda lógica de `handleAuth`, `handleForgotPassword`, `handleResetPassword` permanece idêntica

**Responsividade (< 768px):**
- Coluna esquerda: `hidden`
- Coluna direita: `w-full`, centralizada, padding adequado

**Animações:**
- `motion.div` fade-in no container direito
- Inputs com `transition-all focus:ring-2 focus:ring-primary/50 focus:shadow-lg`
- Botão com `hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]`

**Funcionalidade "Lembrar e-mail":**
- State `rememberEmail` + `useEffect` para ler/gravar `localStorage.getItem('remembered_email')`
- No submit bem-sucedido, salva ou limpa conforme checkbox

**Toggle mostrar/ocultar senha:**
- State `showPassword` boolean
- Input type alternando entre `password` e `text`
- Ícone `Eye` / `EyeOff` do lucide-react

### O que NÃO muda
- Lógica de autenticação (signIn, resetPassword, etc.)
- Rotas
- Validações (zod)
- Nenhum outro arquivo do projeto

