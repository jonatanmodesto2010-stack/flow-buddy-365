

# Diagnóstico: Tela Branca para paulasilva54970@gmail.com

## Problema Identificado

A tela branca ao clicar em qualquer opção indica que o React está "crashando" silenciosamente durante a navegação. Após investigação do código e dados:

1. **Dados da usuária estão corretos**: role `member`, org `a02a8920-...`, profile existe, filtros salvos OK.
2. **Sem subscription**: A org não tem assinatura, mas o código trata isso corretamente (retorna `null`).
3. **RLS permite acesso**: As políticas permitem que ela leia seus dados.

## Causa Provável

Duas questões técnicas combinadas:

### 1. Falta `resolve.dedupe` no Vite Config
O `vite.config.ts` não tem `resolve.dedupe`, o que pode causar múltiplas instâncias do React em memória (especialmente com `framer-motion` v12). Quando o React detecta hooks de instâncias diferentes, o app crasha com tela branca.

### 2. Sem Error Boundary
O app não tem nenhum Error Boundary. Qualquer erro não capturado em um componente derruba toda a árvore React, resultando em tela branca sem mensagem de erro visível.

## Plano de Correção

### Tarefa 1: Adicionar `resolve.dedupe` ao `vite.config.ts`
Adicionar `dedupe: ["react", "react-dom", "react/jsx-runtime"]` na configuração de `resolve` para forçar uma única instância do React.

### Tarefa 2: Criar Error Boundary Global
Criar um componente `ErrorBoundary` em `src/components/ErrorBoundary.tsx` que:
- Captura erros de renderização React
- Exibe uma mensagem amigável em português ("Algo deu errado") com botão para recarregar
- Faz `console.error` do erro para facilitar debug futuro

Envolver o `<AppContent />` no `App.tsx` com este ErrorBoundary.

### Tarefa 3: Adicionar logs de diagnóstico temporários
Adicionar `console.error` nos hooks críticos (`useUserRole`, `useCollectionStatusRules`) para capturar qualquer falha silenciosa que esteja ocorrendo.

## Impacto
- Corrige a causa raiz (instâncias duplicadas do React)
- Previne tela branca futura (Error Boundary mostra mensagem em vez de tela branca)
- Facilita debug (logs capturam erros que antes eram silenciosos)

