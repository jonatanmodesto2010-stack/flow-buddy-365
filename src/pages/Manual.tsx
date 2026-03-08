import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { exportManualPDF } from '@/lib/manual-pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Users, Calendar, LayoutDashboard, BarChart3, Settings,
  Shield, BookOpen, Clock, Tag, Palette, Link2, FileText,
  UserPlus, Bell, Search, Filter, Plus, CheckCircle2,
  AlertTriangle, Info, Zap, Lock, Eye, X, Download
} from 'lucide-react';

// Searchable section definitions
interface ManualSection { value: string; title: string; keywords: string; restricted?: string; }

const SECTIONS: ManualSection[] = [
  { value: 'visao-geral', title: 'Visão Geral do Sistema', keywords: 'visão geral sistema plataforma gestão cobranças recursos perfis acesso viewer member admin owner super' },
  { value: 'clientes', title: 'Clientes', keywords: 'clientes adicionar novo busca filtros status tags ordenação prioridade detalhes boletos acordos concluir arquivar reativar timeline' },
  { value: 'timeline', title: 'Timeline de Cobrança', keywords: 'timeline cobrança eventos linhas criar evento ícone data horário descrição posição status criado resolvido sem resposta' },
  { value: 'calendario', title: 'Calendário', keywords: 'calendário eventos mensal indicadores dia ações régua cobrança agendados' },
  { value: 'dashboard', title: 'Dashboard', keywords: 'dashboard métricas indicadores clientes ativos valor aberto acordos vencidos ações pendentes filtros data período' },
  { value: 'relatorios', title: 'Relatórios', keywords: 'relatórios exportação inadimplentes pdf filtros período dados cobrança' },
  { value: 'acordos', title: 'Acordos e Negociações', keywords: 'acordos negociações dívida parcelas valor desconto pagamento vencidas cancelar ativo concluído' },
  { value: 'tags', title: 'Tags e Categorização', keywords: 'tags categorização atribuir filtrar cobrança negociação jurídico prioritário vip criar editar excluir cor' },
  { value: 'ia', title: 'Análise de Risco por IA', keywords: 'inteligência artificial ia risco score análise baixo médio alto crítico recomendações histórico estratégia' },
  { value: 'configuracoes', title: 'Configurações', keywords: 'configurações perfil usuários adicionar editar remover geral paleta cores tags ícones integrações ixc sincronização régua cobrança regras histórico auditoria', restricted: 'admin' },
  { value: 'superadmin', title: 'Painel Super Admin', keywords: 'super admin organizações criar plano suspender ativar expiração membros estatísticas', restricted: 'superadmin' },
  { value: 'dicas', title: 'Dicas e Boas Práticas', keywords: 'dicas boas práticas organização cobrança efetiva sincronização ixc segurança papéis viewers owners' },
];

const Manual = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { canManageUsers, canManageSettings, isLoading } = useUserRole();
  const { isSuperAdmin } = useSuperAdmin();
  const navigate = useNavigate();

  const filteredSections = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return SECTIONS.filter(s => {
      // Check role restrictions
      if (s.restricted === 'admin' && !canManageSettings) return false;
      if (s.restricted === 'superadmin' && !isSuperAdmin) return false;
      // Check search
      if (!term) return true;
      return s.title.toLowerCase().includes(term) || s.keywords.includes(term);
    });
  }, [searchTerm, canManageSettings, isSuperAdmin]);

  const openValues = useMemo(() => {
    if (!searchTerm.trim()) return ['visao-geral'];
    return filteredSections.map(s => s.value);
  }, [searchTerm, filteredSections]);

  const isVisible = (value: string) => filteredSections.some(s => s.value === value);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      setIsAuthenticated(true);
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/auth');
      else setIsAuthenticated(true);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!isAuthenticated || isLoading) return null;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Manual do Sistema</h1>
              <p className="text-muted-foreground">Guia completo de todas as funcionalidades</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => exportManualPDF({ isAdmin: canManageSettings, isSuperAdmin })}
            className="gap-2 shrink-0"
          >
            <Download className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" /> Todos</Badge>
          {canManageUsers && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Admin</Badge>}
          {isSuperAdmin && <Badge className="gap-1"><Shield className="h-3 w-3" /> Super Admin</Badge>}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar no manual... (ex: boleto, acordo, IXC, tags)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {searchTerm && filteredSections.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum resultado encontrado</p>
            <p className="text-sm">Tente buscar por outro termo</p>
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-320px)]">
          <Accordion type="multiple" value={openValues} className="space-y-2">

            {/* VISÃO GERAL */}
            {isVisible('visao-geral') && <AccordionItem value="visao-geral" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Visão Geral do Sistema</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>O sistema é uma plataforma completa de <strong>gestão de cobranças</strong> projetada para provedores de internet e empresas que precisam acompanhar clientes inadimplentes de forma organizada e eficiente.</p>
                <h4>Principais Recursos:</h4>
                <ul>
                  <li><strong>Gestão de Clientes:</strong> Cadastro, acompanhamento e organização de clientes com timelines visuais</li>
                  <li><strong>Timeline de Cobrança:</strong> Registro cronológico de todas as interações e ações de cobrança</li>
                  <li><strong>Calendário:</strong> Visualização de eventos e ações programadas</li>
                  <li><strong>Dashboard:</strong> Métricas e indicadores de desempenho em tempo real</li>
                  <li><strong>Relatórios:</strong> Análises detalhadas e exportação de dados</li>
                  <li><strong>Régua de Cobrança:</strong> Automação de ações baseadas em dias de atraso</li>
                  <li><strong>Acordos:</strong> Gestão de negociações e parcelamentos</li>
                  <li><strong>Integração IXC:</strong> Sincronização automática com o sistema IXC Provedor</li>
                  <li><strong>Análise de Risco por IA:</strong> Avaliação inteligente do perfil de cada cliente</li>
                </ul>
                <h4>Perfis de Acesso:</h4>
                <ul>
                  <li><Badge variant="outline" className="text-xs">Viewer</Badge> — Visualização apenas, sem permissão de edição</li>
                  <li><Badge variant="outline" className="text-xs">Member</Badge> — Operações do dia a dia (criar eventos, gerenciar clientes)</li>
                  <li><Badge variant="secondary" className="text-xs">Admin</Badge> — Configurações da organização, gestão de usuários</li>
                  <li><Badge variant="secondary" className="text-xs">Owner</Badge> — Controle total da organização</li>
                  <li><Badge className="text-xs">Super Admin</Badge> — Gestão de todas as organizações do sistema</li>
                </ul>
              </AccordionContent>
            </AccordionItem>}

            {/* CLIENTES */}
            {isVisible('clientes') && <AccordionItem value="clientes" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Clientes</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>A tela de Clientes é o ponto central do sistema, onde você visualiza e gerencia todos os clientes da sua organização.</p>

                <h4><Plus className="h-4 w-4 inline" /> Adicionar Cliente</h4>
                <ol>
                  <li>Clique no botão <strong>"Novo Cliente"</strong> no canto superior</li>
                  <li>Preencha o nome do cliente (obrigatório)</li>
                  <li>Defina a data de início do acompanhamento</li>
                  <li>Opcionalmente, informe o valor do boleto e a data de vencimento</li>
                  <li>Clique em <strong>"Salvar"</strong></li>
                </ol>

                <h4><Search className="h-4 w-4 inline" /> Busca e Filtros</h4>
                <ul>
                  <li><strong>Busca por nome:</strong> Digite no campo de busca para encontrar clientes rapidamente</li>
                  <li><strong>Filtro por status:</strong> Filtre entre clientes ativos, concluídos ou arquivados</li>
                  <li><strong>Filtro por tags:</strong> Selecione tags para segmentar clientes</li>
                  <li><strong>Ordenação:</strong> Ordene por nome, data de início ou valor</li>
                  <li><strong>Lista de Prioridade:</strong> Visualize clientes ordenados por urgência de cobrança</li>
                </ul>

                <h4><FileText className="h-4 w-4 inline" /> Detalhes do Cliente</h4>
                <p>Ao clicar em um cliente, você acessa o painel completo com:</p>
                <ul>
                  <li><strong>Informações gerais:</strong> Nome, ID, status, filial IXC</li>
                  <li><strong>Timeline visual:</strong> Histórico cronológico de eventos de cobrança</li>
                  <li><strong>Boletos:</strong> Lista de boletos com valores e status</li>
                  <li><strong>Tags:</strong> Etiquetas de categorização</li>
                  <li><strong>Acordos:</strong> Negociações e parcelamentos ativos</li>
                  <li><strong>Análise de IA:</strong> Avaliação de risco com score e recomendações</li>
                </ul>

                <h4>Concluir / Arquivar Cliente</h4>
                <ul>
                  <li><strong>Concluir:</strong> Marca o cliente como resolvido (pagou, negociou, etc.)</li>
                  <li><strong>Arquivar:</strong> Remove da lista principal sem excluir os dados</li>
                  <li><strong>Reativar:</strong> Volta um cliente concluído/arquivado para ativo</li>
                </ul>
              </AccordionContent>
            </AccordionItem>}

            {/* TIMELINE */}
            {isVisible('timeline') && <AccordionItem value="timeline" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Timeline de Cobrança</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>A timeline é uma representação visual do histórico de interações com cada cliente. Os eventos ficam organizados cronologicamente em linhas horizontais.</p>

                <h4>Estrutura da Timeline</h4>
                <ul>
                  <li><strong>Linhas:</strong> Cada linha horizontal representa um período ou agrupamento de eventos</li>
                  <li><strong>Eventos superiores (top):</strong> Ficam acima da linha central</li>
                  <li><strong>Eventos inferiores (bottom):</strong> Ficam abaixo da linha central</li>
                  <li>Cada evento contém: ícone, data, horário, descrição e status</li>
                </ul>

                <h4>Criar Evento</h4>
                <ol>
                  <li>Na timeline do cliente, clique no botão <strong>"+"</strong></li>
                  <li>Selecione a data e horário do evento</li>
                  <li>Escolha um ícone representativo (ex: 📞 ligação, 💬 mensagem)</li>
                  <li>Escreva a descrição da ação realizada</li>
                  <li>Defina a posição (superior ou inferior)</li>
                  <li>Salve o evento</li>
                </ol>

                <h4>Status dos Eventos</h4>
                <ul>
                  <li><Badge variant="outline" className="text-xs">Criado</Badge> — Evento registrado, aguardando resolução</li>
                  <li><Badge variant="secondary" className="text-xs bg-green-100 text-green-800">Resolvido</Badge> — Ação concluída com sucesso</li>
                  <li><Badge variant="secondary" className="text-xs bg-red-100 text-red-800">Sem Resposta</Badge> — Cliente não respondeu ao contato</li>
                </ul>

                <h4>Dicas de Uso</h4>
                <ul>
                  <li>Use ícones diferentes para cada tipo de ação (ligação, WhatsApp, visita, etc.)</li>
                  <li>Mantenha descrições objetivas e com informações úteis</li>
                  <li>Atualize o status dos eventos conforme o retorno do cliente</li>
                </ul>
              </AccordionContent>
            </AccordionItem>}

            {/* CALENDÁRIO */}
            {isVisible('calendario') && <AccordionItem value="calendario" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Calendário</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>O calendário oferece uma visão geral de todos os eventos e ações programadas por data.</p>
                <h4>Funcionalidades:</h4>
                <ul>
                  <li><strong>Visualização mensal:</strong> Veja todos os eventos do mês em um calendário visual</li>
                  <li><strong>Indicadores por dia:</strong> Dias com eventos são destacados com marcadores coloridos</li>
                  <li><strong>Detalhes do dia:</strong> Clique em um dia para ver todos os eventos agendados</li>
                  <li><strong>Ações da régua de cobrança:</strong> Ações automáticas aparecem no calendário</li>
                </ul>
              </AccordionContent>
            </AccordionItem>}

            {/* DASHBOARD */}
            {isVisible('dashboard') && <AccordionItem value="dashboard" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Dashboard</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>O dashboard apresenta métricas e indicadores chave para acompanhar o desempenho da cobrança.</p>

                <h4>Métricas Disponíveis:</h4>
                <ul>
                  <li><strong>Total de clientes ativos:</strong> Quantidade de clientes em acompanhamento</li>
                  <li><strong>Valor total em aberto:</strong> Soma dos valores de boletos pendentes</li>
                  <li><strong>Acordos ativos:</strong> Negociações em andamento</li>
                  <li><strong>Acordos vencidos:</strong> Parcelas de acordos em atraso</li>
                  <li><strong>Ações pendentes:</strong> Ações da régua de cobrança aguardando execução</li>
                </ul>

                <h4>Filtros de Data:</h4>
                <p>Use os filtros de período para analisar dados de intervalos específicos (hoje, esta semana, este mês, período personalizado).</p>
              </AccordionContent>
            </AccordionItem>}

            {/* RELATÓRIOS */}
            {isVisible('relatorios') && <AccordionItem value="relatorios" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Relatórios</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>A seção de relatórios permite gerar análises detalhadas e exportar dados para uso externo.</p>
                <h4>Recursos:</h4>
                <ul>
                  <li><strong>Exportação de inadimplentes:</strong> Gere relatórios em PDF com a lista de clientes devedores</li>
                  <li><strong>Filtros por período:</strong> Selecione intervalos de data para análise</li>
                  <li><strong>Dados de cobrança:</strong> Acompanhe a evolução das ações realizadas</li>
                </ul>
              </AccordionContent>
            </AccordionItem>}

            {/* ACORDOS */}
            {isVisible('acordos') && <AccordionItem value="acordos" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Acordos e Negociações</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>O módulo de acordos permite registrar e acompanhar negociações de dívidas com clientes.</p>

                <h4>Criar um Acordo</h4>
                <ol>
                  <li>Acesse o painel do cliente</li>
                  <li>Na aba <strong>"Acordos"</strong>, clique em <strong>"Novo Acordo"</strong></li>
                  <li>Informe o valor original da dívida</li>
                  <li>Defina o valor negociado e o percentual de desconto</li>
                  <li>Escolha a quantidade de parcelas</li>
                  <li>Adicione observações se necessário</li>
                  <li>As parcelas são geradas automaticamente</li>
                </ol>

                <h4>Gerenciar Parcelas</h4>
                <ul>
                  <li><strong>Marcar como paga:</strong> Registre o pagamento de cada parcela</li>
                  <li><strong>Parcelas vencidas:</strong> O sistema destaca automaticamente parcelas em atraso</li>
                  <li><strong>Cancelar acordo:</strong> Cancela o acordo e todas as parcelas pendentes</li>
                </ul>

                <h4>Status do Acordo:</h4>
                <ul>
                  <li><Badge variant="outline" className="text-xs">Ativo</Badge> — Acordo em andamento com parcelas a vencer</li>
                  <li><Badge variant="secondary" className="text-xs bg-green-100 text-green-800">Concluído</Badge> — Todas as parcelas foram pagas</li>
                  <li><Badge variant="secondary" className="text-xs bg-red-100 text-red-800">Cancelado</Badge> — Acordo foi cancelado</li>
                </ul>
              </AccordionContent>
            </AccordionItem>}

            {/* TAGS */}
            {isVisible('tags') && <AccordionItem value="tags" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Tags e Categorização</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>Tags permitem categorizar e segmentar clientes para facilitar a organização e filtragem.</p>
                <h4>Como Usar Tags:</h4>
                <ul>
                  <li><strong>Atribuir tag:</strong> No painel do cliente, use o seletor de tags para adicionar uma ou mais tags</li>
                  <li><strong>Filtrar por tag:</strong> Na lista de clientes, use o filtro de tags para ver apenas clientes com tags específicas</li>
                  <li><strong>Exemplos de uso:</strong> "COBRANÇA", "NEGOCIAÇÃO", "JURÍDICO", "PRIORITÁRIO", "VIP"</li>
                </ul>
                {canManageSettings && (
                  <>
                    <h4 className="flex items-center gap-1"><Lock className="h-4 w-4" /> Gerenciar Tags (Admin)</h4>
                    <p>Em <strong>Configurações → Tags</strong>, administradores podem:</p>
                    <ul>
                      <li>Criar novas tags com nome e cor personalizada</li>
                      <li>Editar tags existentes</li>
                      <li>Excluir tags (remove a associação com todos os clientes)</li>
                    </ul>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>}

            {/* ANÁLISE DE IA */}
            {isVisible('ia') && <AccordionItem value="ia" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Análise de Risco por IA</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <p>O sistema utiliza inteligência artificial para analisar o perfil de risco de cada cliente e sugerir a melhor estratégia de cobrança.</p>

                <h4>Como Funciona:</h4>
                <ol>
                  <li>Acesse o painel do cliente</li>
                  <li>Clique em <strong>"Analisar com IA"</strong></li>
                  <li>A IA avalia o histórico de eventos, boletos e interações</li>
                  <li>Um relatório é gerado com nível de risco, score e recomendações</li>
                </ol>

                <h4>Níveis de Risco:</h4>
                <ul>
                  <li><Badge variant="outline" className="text-xs bg-green-100 text-green-800">Baixo</Badge> — Cliente com bom histórico, provável pagamento</li>
                  <li><Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800">Médio</Badge> — Necessita atenção, risco moderado</li>
                  <li><Badge variant="outline" className="text-xs bg-orange-100 text-orange-800">Alto</Badge> — Risco elevado, ação urgente necessária</li>
                  <li><Badge variant="outline" className="text-xs bg-red-100 text-red-800">Crítico</Badge> — Situação crítica, probabilidade alta de inadimplência</li>
                </ul>

                <h4>Histórico de Análises:</h4>
                <p>Todas as análises ficam salvas no histórico do cliente, permitindo acompanhar a evolução do risco ao longo do tempo.</p>
              </AccordionContent>
            </AccordionItem>}

            {/* CONFIGURAÇÕES - ADMIN */}
            {isVisible('configuracoes') && (
              <AccordionItem value="configuracoes" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Configurações</span>
                    <Badge variant="secondary" className="text-xs">Admin</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="prose prose-sm max-w-none text-foreground">
                  <h4>Meu Perfil</h4>
                  <p>Edite seu nome, telefone e outras informações pessoais. Disponível para todos os usuários.</p>

                  <h4><UserPlus className="h-4 w-4 inline" /> Gestão de Usuários</h4>
                  <ul>
                    <li><strong>Adicionar usuário:</strong> Convide novos membros informando e-mail e definindo o papel (member, admin, owner)</li>
                    <li><strong>Editar papel:</strong> Altere o nível de acesso de um usuário existente</li>
                    <li><strong>Remover usuário:</strong> Remove o acesso de um membro à organização</li>
                  </ul>

                  <h4>Configurações Gerais</h4>
                  <p>Defina o nome da organização e outras preferências globais.</p>

                  <h4><Palette className="h-4 w-4 inline" /> Paleta de Cores</h4>
                  <p>Personalize as cores do sistema para combinar com a identidade visual da sua empresa.</p>

                  <h4><Tag className="h-4 w-4 inline" /> Tags</h4>
                  <p>Crie, edite e gerencie tags disponíveis para categorização de clientes.</p>

                  <h4>Ícones</h4>
                  <p>Gerencie os ícones disponíveis para uso nos eventos da timeline. Adicione emojis personalizados com rótulos descritivos.</p>

                  <h4><Link2 className="h-4 w-4 inline" /> Integrações</h4>
                  <p>Configure a integração com o sistema <strong>IXC Provedor</strong>:</p>
                  <ul>
                    <li>Informe a URL da API e o Token de autenticação</li>
                    <li>Opcionalmente, configure a URL da API de Contratos</li>
                    <li>Use <strong>"Testar Conexão"</strong> para validar as credenciais</li>
                    <li>Inicie a sincronização para importar clientes e boletos automaticamente</li>
                    <li>Acompanhe o progresso e o histórico de sincronizações</li>
                  </ul>

                  <h4><Bell className="h-4 w-4 inline" /> Régua de Cobrança</h4>
                  <p>Configure ações automáticas baseadas nos dias de atraso dos boletos:</p>
                  <ol>
                    <li>Crie regras definindo: nome, tipo de ação, dias de atraso e mensagem</li>
                    <li>Ordene as regras por prioridade (arrastar e soltar)</li>
                    <li>Ative/desative regras conforme necessário</li>
                    <li>O sistema gerará ações automaticamente no calendário</li>
                  </ol>

                  <h4>Histórico</h4>
                  <p>Consulte o log de atividades e alterações realizadas no sistema (auditoria).</p>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* SUPER ADMIN */}
            {isVisible('superadmin') && (
              <AccordionItem value="superadmin" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Painel Super Admin</span>
                    <Badge className="text-xs">Super Admin</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="prose prose-sm max-w-none text-foreground">
                  <p>O painel Super Admin permite gerenciar todas as organizações do sistema.</p>

                  <h4>Dashboard Administrativo</h4>
                  <ul>
                    <li>Visão geral de todas as organizações cadastradas</li>
                    <li>Métricas globais: total de organizações, usuários e clientes</li>
                    <li>Status de cada organização (ativo, suspenso)</li>
                  </ul>

                  <h4>Gerenciar Organizações</h4>
                  <ul>
                    <li><strong>Criar organização:</strong> Cadastre novas empresas no sistema</li>
                    <li><strong>Editar plano:</strong> Altere limites de usuários e clientes</li>
                    <li><strong>Suspender/Ativar:</strong> Controle o acesso de cada organização</li>
                    <li><strong>Expiração:</strong> Defina datas de expiração de assinaturas</li>
                  </ul>

                  <h4>Detalhes da Organização</h4>
                  <p>Ao clicar em uma organização, veja:</p>
                  <ul>
                    <li>Estatísticas de uso (clientes ativos, total de usuários)</li>
                    <li>Lista de membros e seus papéis</li>
                    <li>Configurações do plano</li>
                    <li>Versão do aplicativo instalada</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* DICAS E BOAS PRÁTICAS */}
            {isVisible('dicas') && <AccordionItem value="dicas" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Dicas e Boas Práticas</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm max-w-none text-foreground">
                <h4>Organização</h4>
                <ul>
                  <li>Use tags para categorizar clientes por tipo de situação</li>
                  <li>Mantenha a timeline atualizada após cada contato</li>
                  <li>Utilize a lista de prioridade para focar nos casos mais urgentes</li>
                </ul>

                <h4>Cobrança Efetiva</h4>
                <ul>
                  <li>Configure a régua de cobrança para automatizar lembretes</li>
                  <li>Use a análise de IA para priorizar clientes de alto risco</li>
                  <li>Registre sempre o resultado do contato (resolvido ou sem resposta)</li>
                  <li>Negocie acordos para clientes com dificuldade de pagamento</li>
                </ul>

                <h4>Sincronização IXC</h4>
                <ul>
                  <li>Mantenha a integração IXC configurada para dados sempre atualizados</li>
                  <li>Sincronize regularmente para captar novos boletos e clientes</li>
                  <li>Verifique o histórico de sincronizações para identificar erros</li>
                </ul>

                <h4>Segurança</h4>
                <ul>
                  <li>Defina papéis adequados para cada membro da equipe</li>
                  <li>Viewers não podem alterar dados, apenas visualizar</li>
                  <li>Apenas Owners podem excluir integrações</li>
                </ul>
              </AccordionContent>
            </AccordionItem>}

          </Accordion>
        </ScrollArea>
      </div>
    </AppLayout>
  );
};

export default Manual;
