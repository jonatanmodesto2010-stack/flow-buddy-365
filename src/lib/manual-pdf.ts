import jsPDF from 'jspdf';

interface ManualSection {
  title: string;
  content: string[];
  restricted?: string;
}

const MANUAL_SECTIONS: ManualSection[] = [
  {
    title: 'Visão Geral do Sistema',
    content: [
      'O sistema é uma plataforma completa de gestão de cobranças projetada para provedores de internet e empresas que precisam acompanhar clientes inadimplentes de forma organizada e eficiente.',
      '',
      'Principais Recursos:',
      '• Gestão de Clientes: Cadastro, acompanhamento e organização de clientes com timelines visuais',
      '• Timeline de Cobrança: Registro cronológico de todas as interações e ações de cobrança',
      '• Calendário: Visualização de eventos e ações programadas',
      '• Dashboard: Métricas e indicadores de desempenho em tempo real',
      '• Relatórios: Análises detalhadas e exportação de dados',
      '• Régua de Cobrança: Automação de ações baseadas em dias de atraso',
      '• Acordos: Gestão de negociações e parcelamentos',
      '• Integração IXC: Sincronização automática com o sistema IXC Provedor',
      '• Análise de Risco por IA: Avaliação inteligente do perfil de cada cliente',
      '',
      'Perfis de Acesso:',
      '• Viewer — Visualização apenas, sem permissão de edição',
      '• Member — Operações do dia a dia (criar eventos, gerenciar clientes)',
      '• Admin — Configurações da organização, gestão de usuários',
      '• Owner — Controle total da organização',
      '• Super Admin — Gestão de todas as organizações do sistema',
    ],
  },
  {
    title: 'Clientes',
    content: [
      'A tela de Clientes é o ponto central do sistema, onde você visualiza e gerencia todos os clientes da sua organização.',
      '',
      'Adicionar Cliente:',
      '1. Clique no botão "Novo Cliente" no canto superior',
      '2. Preencha o nome do cliente (obrigatório)',
      '3. Defina a data de início do acompanhamento',
      '4. Opcionalmente, informe o valor do boleto e a data de vencimento',
      '5. Clique em "Salvar"',
      '',
      'Busca e Filtros:',
      '• Busca por nome: Digite no campo de busca para encontrar clientes rapidamente',
      '• Filtro por status: Filtre entre clientes ativos, concluídos ou arquivados',
      '• Filtro por tags: Selecione tags para segmentar clientes',
      '• Ordenação: Ordene por nome, data de início ou valor',
      '• Lista de Prioridade: Visualize clientes ordenados por urgência de cobrança',
      '',
      'Detalhes do Cliente:',
      'Ao clicar em um cliente, você acessa o painel completo com:',
      '• Informações gerais: Nome, ID, status, filial IXC',
      '• Timeline visual: Histórico cronológico de eventos de cobrança',
      '• Boletos: Lista de boletos com valores e status',
      '• Tags: Etiquetas de categorização',
      '• Acordos: Negociações e parcelamentos ativos',
      '• Análise de IA: Avaliação de risco com score e recomendações',
      '',
      'Concluir / Arquivar Cliente:',
      '• Concluir: Marca o cliente como resolvido (pagou, negociou, etc.)',
      '• Arquivar: Remove da lista principal sem excluir os dados',
      '• Reativar: Volta um cliente concluído/arquivado para ativo',
    ],
  },
  {
    title: 'Timeline de Cobrança',
    content: [
      'A timeline é uma representação visual do histórico de interações com cada cliente. Os eventos ficam organizados cronologicamente em linhas horizontais.',
      '',
      'Estrutura da Timeline:',
      '• Linhas: Cada linha horizontal representa um período ou agrupamento de eventos',
      '• Eventos superiores (top): Ficam acima da linha central',
      '• Eventos inferiores (bottom): Ficam abaixo da linha central',
      '• Cada evento contém: ícone, data, horário, descrição e status',
      '',
      'Criar Evento:',
      '1. Na timeline do cliente, clique no botão "+"',
      '2. Selecione a data e horário do evento',
      '3. Escolha um ícone representativo (ex: 📞 ligação, 💬 mensagem)',
      '4. Escreva a descrição da ação realizada',
      '5. Defina a posição (superior ou inferior)',
      '6. Salve o evento',
      '',
      'Status dos Eventos:',
      '• Criado — Evento registrado, aguardando resolução',
      '• Resolvido — Ação concluída com sucesso',
      '• Sem Resposta — Cliente não respondeu ao contato',
      '',
      'Dicas de Uso:',
      '• Use ícones diferentes para cada tipo de ação (ligação, WhatsApp, visita, etc.)',
      '• Mantenha descrições objetivas e com informações úteis',
      '• Atualize o status dos eventos conforme o retorno do cliente',
    ],
  },
  {
    title: 'Calendário',
    content: [
      'O calendário oferece uma visão geral de todos os eventos e ações programadas por data.',
      '',
      'Funcionalidades:',
      '• Visualização mensal: Veja todos os eventos do mês em um calendário visual',
      '• Indicadores por dia: Dias com eventos são destacados com marcadores coloridos',
      '• Detalhes do dia: Clique em um dia para ver todos os eventos agendados',
      '• Ações da régua de cobrança: Ações automáticas aparecem no calendário',
    ],
  },
  {
    title: 'Dashboard',
    content: [
      'O dashboard apresenta métricas e indicadores chave para acompanhar o desempenho da cobrança.',
      '',
      'Métricas Disponíveis:',
      '• Total de clientes ativos: Quantidade de clientes em acompanhamento',
      '• Valor total em aberto: Soma dos valores de boletos pendentes',
      '• Acordos ativos: Negociações em andamento',
      '• Acordos vencidos: Parcelas de acordos em atraso',
      '• Ações pendentes: Ações da régua de cobrança aguardando execução',
      '',
      'Filtros de Data:',
      'Use os filtros de período para analisar dados de intervalos específicos (hoje, esta semana, este mês, período personalizado).',
    ],
  },
  {
    title: 'Relatórios',
    content: [
      'A seção de relatórios permite gerar análises detalhadas e exportar dados para uso externo.',
      '',
      'Recursos:',
      '• Exportação de inadimplentes: Gere relatórios em PDF com a lista de clientes devedores',
      '• Filtros por período: Selecione intervalos de data para análise',
      '• Dados de cobrança: Acompanhe a evolução das ações realizadas',
    ],
  },
  {
    title: 'Acordos e Negociações',
    content: [
      'O módulo de acordos permite registrar e acompanhar negociações de dívidas com clientes.',
      '',
      'Criar um Acordo:',
      '1. Acesse o painel do cliente',
      '2. Na aba "Acordos", clique em "Novo Acordo"',
      '3. Informe o valor original da dívida',
      '4. Defina o valor negociado e o percentual de desconto',
      '5. Escolha a quantidade de parcelas',
      '6. Adicione observações se necessário',
      '7. As parcelas são geradas automaticamente',
      '',
      'Gerenciar Parcelas:',
      '• Marcar como paga: Registre o pagamento de cada parcela',
      '• Parcelas vencidas: O sistema destaca automaticamente parcelas em atraso',
      '• Cancelar acordo: Cancela o acordo e todas as parcelas pendentes',
      '',
      'Status do Acordo:',
      '• Ativo — Acordo em andamento com parcelas a vencer',
      '• Concluído — Todas as parcelas foram pagas',
      '• Cancelado — Acordo foi cancelado',
    ],
  },
  {
    title: 'Tags e Categorização',
    content: [
      'Tags permitem categorizar e segmentar clientes para facilitar a organização e filtragem.',
      '',
      'Como Usar Tags:',
      '• Atribuir tag: No painel do cliente, use o seletor de tags para adicionar uma ou mais tags',
      '• Filtrar por tag: Na lista de clientes, use o filtro de tags para ver apenas clientes com tags específicas',
      '• Exemplos de uso: "COBRANÇA", "NEGOCIAÇÃO", "JURÍDICO", "PRIORITÁRIO", "VIP"',
      '',
      'Gerenciar Tags (Admin):',
      'Em Configurações → Tags, administradores podem:',
      '• Criar novas tags com nome e cor personalizada',
      '• Editar tags existentes',
      '• Excluir tags (remove a associação com todos os clientes)',
    ],
  },
  {
    title: 'Análise de Risco por IA',
    content: [
      'O sistema utiliza inteligência artificial para analisar o perfil de risco de cada cliente e sugerir a melhor estratégia de cobrança.',
      '',
      'Como Funciona:',
      '1. Acesse o painel do cliente',
      '2. Clique em "Analisar com IA"',
      '3. A IA avalia o histórico de eventos, boletos e interações',
      '4. Um relatório é gerado com nível de risco, score e recomendações',
      '',
      'Níveis de Risco:',
      '• Baixo — Cliente com bom histórico, provável pagamento',
      '• Médio — Necessita atenção, risco moderado',
      '• Alto — Risco elevado, ação urgente necessária',
      '• Crítico — Situação crítica, probabilidade alta de inadimplência',
      '',
      'Histórico de Análises:',
      'Todas as análises ficam salvas no histórico do cliente, permitindo acompanhar a evolução do risco ao longo do tempo.',
    ],
  },
  {
    title: 'Configurações (Admin)',
    restricted: 'admin',
    content: [
      'Meu Perfil:',
      'Edite seu nome, telefone e outras informações pessoais. Disponível para todos os usuários.',
      '',
      'Gestão de Usuários:',
      '• Adicionar usuário: Convide novos membros informando e-mail e definindo o papel (member, admin, owner)',
      '• Editar papel: Altere o nível de acesso de um usuário existente',
      '• Remover usuário: Remove o acesso de um membro à organização',
      '',
      'Configurações Gerais:',
      'Defina o nome da organização e outras preferências globais.',
      '',
      'Paleta de Cores:',
      'Personalize as cores do sistema para combinar com a identidade visual da sua empresa.',
      '',
      'Tags:',
      'Crie, edite e gerencie tags disponíveis para categorização de clientes.',
      '',
      'Ícones:',
      'Gerencie os ícones disponíveis para uso nos eventos da timeline. Adicione emojis personalizados com rótulos descritivos.',
      '',
      'Integrações:',
      'Configure a integração com o sistema IXC Provedor:',
      '• Informe a URL da API e o Token de autenticação',
      '• Opcionalmente, configure a URL da API de Contratos',
      '• Use "Testar Conexão" para validar as credenciais',
      '• Inicie a sincronização para importar clientes e boletos automaticamente',
      '• Acompanhe o progresso e o histórico de sincronizações',
      '',
      'Régua de Cobrança:',
      'Configure ações automáticas baseadas nos dias de atraso dos boletos:',
      '1. Crie regras definindo: nome, tipo de ação, dias de atraso e mensagem',
      '2. Ordene as regras por prioridade (arrastar e soltar)',
      '3. Ative/desative regras conforme necessário',
      '4. O sistema gerará ações automaticamente no calendário',
      '',
      'Histórico:',
      'Consulte o log de atividades e alterações realizadas no sistema (auditoria).',
    ],
  },
  {
    title: 'Painel Super Admin',
    restricted: 'superadmin',
    content: [
      'O painel Super Admin permite gerenciar todas as organizações do sistema.',
      '',
      'Dashboard Administrativo:',
      '• Visão geral de todas as organizações cadastradas',
      '• Métricas globais: total de organizações, usuários e clientes',
      '• Status de cada organização (ativo, suspenso)',
      '',
      'Gerenciar Organizações:',
      '• Criar organização: Cadastre novas empresas no sistema',
      '• Editar plano: Altere limites de usuários e clientes',
      '• Suspender/Ativar: Controle o acesso de cada organização',
      '• Expiração: Defina datas de expiração de assinaturas',
      '',
      'Detalhes da Organização:',
      'Ao clicar em uma organização, veja:',
      '• Estatísticas de uso (clientes ativos, total de usuários)',
      '• Lista de membros e seus papéis',
      '• Configurações do plano',
      '• Versão do aplicativo instalada',
    ],
  },
  {
    title: 'Dicas e Boas Práticas',
    content: [
      'Organização:',
      '• Use tags para categorizar clientes por tipo de situação',
      '• Mantenha a timeline atualizada após cada contato',
      '• Utilize a lista de prioridade para focar nos casos mais urgentes',
      '',
      'Cobrança Efetiva:',
      '• Configure a régua de cobrança para automatizar lembretes',
      '• Use a análise de IA para priorizar clientes de alto risco',
      '• Registre sempre o resultado do contato (resolvido ou sem resposta)',
      '• Negocie acordos para clientes com dificuldade de pagamento',
      '',
      'Sincronização IXC:',
      '• Mantenha a integração IXC configurada para dados sempre atualizados',
      '• Sincronize regularmente para captar novos boletos e clientes',
      '• Verifique o histórico de sincronizações para identificar erros',
      '',
      'Segurança:',
      '• Defina papéis adequados para cada membro da equipe',
      '• Viewers não podem alterar dados, apenas visualizar',
      '• Apenas Owners podem excluir integrações',
    ],
  },
];

export function exportManualPDF(options: { isAdmin: boolean; isSuperAdmin: boolean }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addPageIfNeeded = (requiredSpace: number) => {
    if (y + requiredSpace > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Cover page
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Manual do Sistema', pageWidth / 2, pageHeight / 2 - 20, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('Guia completo de todas as funcionalidades', pageWidth / 2, pageHeight / 2 + 5, { align: 'center' });

  const now = new Date();
  doc.setFontSize(10);
  doc.text(
    `Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    pageWidth / 2,
    pageHeight / 2 + 25,
    { align: 'center' }
  );

  // Table of contents
  doc.addPage();
  y = margin;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Sumário', margin, y);
  y += 15;

  const visibleSections = MANUAL_SECTIONS.filter(s => {
    if (s.restricted === 'admin' && !options.isAdmin) return false;
    if (s.restricted === 'superadmin' && !options.isSuperAdmin) return false;
    return true;
  });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  visibleSections.forEach((section, idx) => {
    addPageIfNeeded(8);
    const label = section.restricted ? `${section.title} ★` : section.title;
    doc.text(`${idx + 1}. ${label}`, margin + 5, y);
    y += 8;
  });

  // Content pages
  visibleSections.forEach((section, idx) => {
    doc.addPage();
    y = margin;

    // Section title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(41, 98, 255);
    doc.text(`${idx + 1}. ${section.title}`, margin, y);
    y += 4;

    // Underline
    doc.setDrawColor(41, 98, 255);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentWidth, y);
    y += 10;

    // Content
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    section.content.forEach((line) => {
      if (line === '') {
        y += 4;
        return;
      }

      // Detect sub-headers (lines ending with ":")
      const isSubHeader = /^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÚÇ][^•\d].*:$/.test(line) && !line.startsWith('•');

      if (isSubHeader) {
        addPageIfNeeded(14);
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(line, margin, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
      } else {
        const indent = line.startsWith('•') || /^\d+\./.test(line) ? 5 : 0;
        const lines = doc.splitTextToSize(line, contentWidth - indent);
        addPageIfNeeded(lines.length * 5 + 2);
        doc.text(lines, margin + indent, y);
        y += lines.length * 5 + 1;
      }
    });
  });

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i - 1} de ${totalPages - 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  doc.save('manual-do-sistema.pdf');
}
