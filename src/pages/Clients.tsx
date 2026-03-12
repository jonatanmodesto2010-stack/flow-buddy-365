import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, History, TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Building2, Wifi, WifiOff, ArrowDownUp } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { ClientDashboardModal } from '@/components/ClientDashboardModal';
import { ClientSearchFilters } from '@/components/ClientSearchFilters';
import { CalendarView } from '@/components/CalendarView';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { supabaseClient } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { calculateOverdueDays, type ClientTimeline, type GroupedClient } from '@/lib/client-utils';
import type { User } from '@supabase/supabase-js';
import { ClientTimelineDialog } from '@/components/ClientTimelineDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ITEMS_PER_PAGE = 30;

const CLIENT_COLUMNS = 'id, client_name, client_id, status, is_active, organization_id, ixc_filial_id, ixc_filial_name, start_date, created_at, updated_at, user_id, completed_at, completion_notes, boleto_value, due_date';

const Clients = () => {

  const [clients, setClients] = useState<ClientTimeline[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [overdueDaysMap, setOverdueDaysMap] = useState<Map<string, number>>(new Map());
  const [latestEventsMap, setLatestEventsMap] = useState<Map<string, { icon: string; event_date: string; description: string }>>(new Map());
  const latestEventsRequestIdRef = useRef(0);
  const [onlineClients, setOnlineClients] = useState<Set<string>>(new Set());
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [overdueDaysLoading, setOverdueDaysLoading] = useState(false);
  const { organizationId, isLoading: roleLoading } = useUserRole();
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({
    client_name: '',
    client_id: '',
    start_date: new Date().toISOString().split('T')[0]
  });
  const [showClientTimelineDialog, setShowClientTimelineDialog] = useState(false);
  const [clientForTimeline, setClientForTimeline] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filialFilter, setFilialFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'default' | 'overdue_desc' | 'overdue_asc'>('default');
  const [filiais, setFiliais] = useState<[string, string][]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);else
      navigate('/auth');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) setUser(session.user);else
      navigate('/auth');
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Realtime subscription for timeline_events changes
  useEffect(() => {
    if (!organizationId || clients.length === 0) return;

    const refreshLatestEvents = () => {
      void loadLatestEvents(clients);
    };

    const channel = supabase
      .channel('timeline-events-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'timeline_events',
        },
        refreshLatestEvents
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'timeline_events',
        },
        refreshLatestEvents
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, clients]);

  // Load filiais once
  useEffect(() => {
    if (!organizationId) return;
    loadFiliais();
  }, [organizationId]);

  // Load clients when filters/page change
  useEffect(() => {
    if (organizationId) loadClients();
  }, [organizationId, currentPage, searchTerm, statusFilter, filialFilter]);

  const loadFiliais = async () => {
    if (!organizationId) return;
    try {
      const { data } = await (supabaseClient as any).
      from('unique_client_timelines').
      select('ixc_filial_id, ixc_filial_name').
      eq('organization_id', organizationId).
      not('ixc_filial_id', 'is', null).
      not('ixc_filial_name', 'is', null);

      if (data) {
        const map = new Map<string, string>();
        for (const t of data) {
          if (t.ixc_filial_id && t.ixc_filial_name) {
            map.set(t.ixc_filial_id, t.ixc_filial_name);
          }
        }
        setFiliais(Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1])));
      }
    } catch (err) {
      console.error('Error loading filiais:', err);
    }
  };

  const loadClients = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);

      // Build server-side query
      let query = (supabaseClient as any).
      from('unique_client_timelines').
      select(CLIENT_COLUMNS, { count: 'exact' }).
      eq('organization_id', organizationId);

      // Server-side filters
      if (filialFilter !== 'all') {
        query = query.eq('ixc_filial_id', filialFilter);
      }

      if (searchTerm) {
        // Search by name or client_id
        query = query.or(`client_name.ilike.%${searchTerm}%,client_id.ilike.%${searchTerm}%`);
      }

      if (statusFilter === 'active') {
        query = query.eq('is_active', true).eq('status', 'active');
      } else if (statusFilter === 'blocked') {
        query = query.eq('is_active', false).not('status', 'in', '("archived","completed")');
      } else if (statusFilter === 'inactive') {
        query = query.eq('status', 'archived');
      } else if (statusFilter === 'completed') {
        query = query.eq('status', 'completed');
      }
      // 'overdue' filter handled after boleto load
      // 'all' = no extra filter

      // Sort: blocked first (is_active asc), then by name
      query = query.
      order('is_active', { ascending: true }).
      order('client_name', { ascending: true });

      // Paginate server-side
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE - 1;
      query = query.range(start, end);

      const { data, count, error } = await query;
      if (error) throw error;

      setClients(data || []);
      setTotalCount(count || 0);

      // Load overdue days in background for visible clients only
      if (data && data.length > 0) {
        loadOverdueDays(data);
        loadLatestEvents(data);
        // Load online status for blocked clients
        const blockedClients = data.filter((c) => !c.is_active && c.status !== 'archived' && c.status !== 'completed');
        if (blockedClients.length > 0) {
          loadOnlineStatus(blockedClients);
        } else {
          setOnlineClients(new Set());
        }
      } else {
        setOverdueDaysMap(new Map());
        setLatestEventsMap(new Map());
        setOnlineClients(new Set());
      }
    } catch (error: any) {
      console.error('Error loading clients:', error);
      toast({ title: 'Erro ao carregar clientes', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadOverdueDays = async (timelines: ClientTimeline[]) => {
    try {
      setOverdueDaysLoading(true);
      const timelineIds = timelines.map((t) => t.id);

      const { data: boletos } = await supabaseClient.
      from('client_boletos').
      select('timeline_id, due_date, status').
      in('timeline_id', timelineIds);

      const boletosMap = new Map<string, {due_date: string;status: string;}[]>();
      for (const b of boletos || []) {
        if (!boletosMap.has(b.timeline_id)) boletosMap.set(b.timeline_id, []);
        boletosMap.get(b.timeline_id)!.push(b);
      }

      const map = new Map<string, number>();
      for (const t of timelines) {
        const clientBoletos = boletosMap.get(t.id) || [];
        const days = calculateOverdueDays(clientBoletos);
        if (days > 0) map.set(t.id, days);
      }
      setOverdueDaysMap(map);
    } catch (err) {
      console.error('Error loading overdue days:', err);
    } finally {
      setOverdueDaysLoading(false);
    }
  };
  const loadOnlineStatus = async (blockedClients: ClientTimeline[]) => {
    try {
      setOnlineLoading(true);
      const clientIds = blockedClients.map((c) => c.client_id).filter(Boolean);
      if (clientIds.length === 0) {
        setOnlineClients(new Set());
        return;
      }

      const { data, error } = await supabase.functions.invoke('ixc-check-online', {
        body: { organization_id: organizationId, client_ids: clientIds }
      });

      if (error) {
        console.error('Error checking online status:', error);
        return;
      }

      if (data?.online_clients) {
        setOnlineClients(new Set(data.online_clients.map(String)));
      }
    } catch (err) {
      console.error('Error loading online status:', err);
    } finally {
      setOnlineLoading(false);
    }
  };
  const loadLatestEvents = async (timelines: ClientTimeline[]) => {
    const requestId = ++latestEventsRequestIdRef.current;

    try {
      const timelineIds = timelines.map((t) => t.id);

      if (timelineIds.length === 0) {
        if (requestId === latestEventsRequestIdRef.current) {
          setLatestEventsMap(new Map());
        }
        return;
      }

      const { data, error } = await (supabaseClient as any)
        .from('latest_client_events')
        .select('timeline_id, icon, event_date, description')
        .in('timeline_id', timelineIds);

      if (error) {
        console.error('Error loading latest events:', error);
        return;
      }

      if (requestId !== latestEventsRequestIdRef.current) return;

      const map = new Map<string, { icon: string; event_date: string; description: string }>();
      for (const evt of data || []) {
        map.set(evt.timeline_id, {
          icon: evt.icon || '',
          event_date: evt.event_date || '',
          description: evt.description || '',
        });
      }
      setLatestEventsMap(map);
    } catch (err) {
      console.error('Error loading latest events:', err);
    }
  };


  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, filialFilter]);

  // Sort clients based on sortBy option
  const sortedClients = useMemo(() => {
    if (sortBy === 'default') return clients;
    return [...clients].sort((a, b) => {
      const daysA = overdueDaysMap.get(a.id) || 0;
      const daysB = overdueDaysMap.get(b.id) || 0;
      return sortBy === 'overdue_desc' ? daysB - daysA : daysA - daysB;
    });
  }, [clients, overdueDaysMap, sortBy]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + clients.length, totalCount);

  const handleOpenModal = (client: ClientTimeline) => {
    setSelectedClient(client);
    setModalOpen(true);
  };

  const handleOpenTimelineDialog = (client: ClientTimeline) => {
    setClientForTimeline(client);
    setShowClientTimelineDialog(true);
  };

  const handleSaveClient = async (updatedData: any) => {
    if (!selectedClient) return;
    try {
      const { error } = await supabaseClient.from('client_timelines').update(updatedData).eq('id', selectedClient.id);
      if (error) throw error;
      await loadClients();
      toast({ title: 'Cliente atualizado', description: 'As informações foram atualizadas com sucesso.' });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const handleCreateClient = async () => {
    if (!organizationId) return;
    const clientNameTrimmed = newClientData.client_name.trim();
    if (!clientNameTrimmed) {
      toast({ title: 'Nome obrigatório', description: 'Por favor, insira o nome do cliente.', variant: 'destructive' });
      return;
    }

    try {
      const { data: existing } = await supabaseClient.
      from('client_timelines').select('id').eq('organization_id', organizationId).ilike('client_name', clientNameTrimmed);
      if (existing && existing.length > 0) {
        toast({ title: 'Nome duplicado', description: `Já existe um cliente com o nome "${clientNameTrimmed}".`, variant: 'destructive' });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabaseClient.
      from('client_timelines').
      insert({
        client_name: clientNameTrimmed,
        client_id: newClientData.client_id.trim() || null,
        start_date: newClientData.start_date,
        is_active: true,
        status: 'active',
        organization_id: organizationId,
        user_id: user.id
      }).
      select().
      single();

      if (error) throw error;
      await loadClients();
      setNewClientModalOpen(false);
      toast({ title: 'Cliente criado', description: `Cliente "${clientNameTrimmed}" foi adicionado com sucesso.` });
      if (data) {setSelectedClient(data);setModalOpen(true);}
      setNewClientData({ client_name: '', client_id: '', start_date: new Date().toISOString().split('T')[0] });
    } catch (error: any) {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
    }
  };

  const getClientBadgeInfo = (client: ClientTimeline) => {
    const overdueDays = overdueDaysMap.get(client.id) || 0;
    const isBlocked = !client.is_active && client.status !== 'archived' && client.status !== 'completed';
    const isOverdue = client.is_active && client.status === 'active' && overdueDays > 0;
    const isInactive = client.status === 'archived';
    const isCompleted = client.status === 'completed';

    return { overdueDays, isBlocked, isOverdue, isInactive, isCompleted };
  };

  const getCardStyle = (info: ReturnType<typeof getClientBadgeInfo>) => {
    if (info.isBlocked) return 'bg-red-500/10 border border-red-500/30';
    if (info.isOverdue) return 'bg-yellow-500/10 border border-yellow-500/30';
    if (info.isInactive || info.isCompleted) return 'bg-muted border border-border opacity-70';
    return 'bg-card border border-border';
  };

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            <div className="h-9 w-48 bg-muted animate-pulse rounded mb-6" />
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((i) =>
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!organizationId) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Nenhuma organização encontrada</h2>
            <p className="text-muted-foreground">
              Você precisa estar vinculado a uma organização para acessar os clientes.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (loading && clients.length === 0) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            <div className="h-9 w-48 bg-muted animate-pulse rounded mb-6" />
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((i) =>
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6">
          <div className="max-w-[1600px] mx-auto flex gap-6">
            {/* Left Column - Client List (35%) */}
            <div className="w-[40%] min-w-0 flex-shrink-0">
              <div className="animate-fade-in">
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Clientes</h2>
                  <span className="text-sm text-muted-foreground">
                    {totalCount > 0 ? `${startIndex + 1} - ${endIndex} / ${totalCount}` : '0 clientes'}
                  </span>
                  {filiais.length > 0 &&
                <Select value={filialFilter} onValueChange={setFilialFilter}>
                      <SelectTrigger className="w-[220px] h-9">
                        <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Todas filiais" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas filiais</SelectItem>
                        {filiais.map(([id, name]) =>
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                    )}
                      </SelectContent>
                    </Select>
                }
                </div>

                <ClientSearchFilters
                onFilterChange={(filters) => {
                  setSearchTerm(filters.searchTerm || '');
                  setStatusFilter(filters.statusFilter || 'all');
                }}
                organizationId={organizationId}
                pageName="clients" />
              

                {/* Pagination Controls */}
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Primeira página">
                      <ChevronsLeft size={16} />
                    </button>
                    <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Página anterior">
                      <ChevronLeft size={16} />
                    </button>
                    <button onClick={loadClients} className="p-1.5 rounded hover:bg-muted transition-colors" title="Atualizar">
                      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Próxima página">
                      <ChevronRight size={16} />
                    </button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Última página">
                      <ChevronsRight size={16} />
                    </button>
                   </div>

                  <div className="flex items-center gap-3">
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                      <SelectTrigger className="w-[200px] h-9">
                        <ArrowDownUp className="w-4 h-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Ordenação" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Ordenação padrão</SelectItem>
                        <SelectItem value="overdue_desc">Maior atraso primeiro</SelectItem>
                        <SelectItem value="overdue_asc">Menor atraso primeiro</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                    onClick={() => navigate('/history')}
                    className="p-2 bg-primary/10 text-primary rounded-lg font-semibold hover:bg-primary/20 transition-all flex items-center justify-center whitespace-nowrap">
                      <History size={18} />
                    </button>

                    <button
                    onClick={() => setNewClientModalOpen(true)}
                    className="p-2 bg-gradient-primary text-primary-foreground rounded-lg font-semibold hover:bg-gradient-hover transition-all flex items-center justify-center whitespace-nowrap">
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* Client List */}
                {clients.length === 0 && !loading ?
              <div className="text-center py-20 text-muted-foreground">
                    <p>Nenhum cliente encontrado</p>
                  </div> :

              <div className="flex flex-col gap-2 w-full">
                    {sortedClients.map((client) => {
                  const info = getClientBadgeInfo(client);
                  return (
                    <div
                      key={client.id}
                      className={`w-full rounded-lg p-4 flex items-center gap-4 transition-all duration-150 hover:opacity-90 cursor-pointer ${getCardStyle(info)}`}
                      onClick={() => handleOpenModal(client)}>
                      
                          <div className="flex-1 min-w-0">
                            <h3 className="text-card-foreground font-bold text-base uppercase tracking-wide truncate">
                              {client.client_name}
                            </h3>
                            {latestEventsMap.get(client.id) && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {latestEventsMap.get(client.id)!.icon} {latestEventsMap.get(client.id)!.event_date} {latestEventsMap.get(client.id)!.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {info.overdueDays > 0 &&
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${info.isBlocked ? 'bg-red-500 text-white' : info.isOverdue ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'}`}>
                                {info.overdueDays}d
                              </div>
                        }

                            {info.isBlocked &&
                        <>
                                <div className="px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1 font-semibold border border-red-500/30">
                                  🔒
                                </div>
                                {client.client_id && (
                          onlineClients.has(client.client_id) ?
                          <div className="px-2.5 py-1 text-xs rounded-full flex items-center gap-1 font-semibold border border-green-500/30 text-muted-foreground bg-emerald-500">
                                      <Wifi size={11} />
                                      ON
                                    </div> :
                          !onlineLoading ?
                          <div className="px-2.5 py-1 text-muted-foreground text-xs rounded-full flex items-center gap-1 font-semibold border border-border bg-red-500">
                                      <WifiOff size={11} />
                                      OFF
                                    </div> :
                          null)
                          }
                              </>
                        }

                            {info.isInactive &&
                        <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">
                                Inativo
                              </div>
                        }

                            {info.isCompleted &&
                        <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">
                                Finalizado
                              </div>
                        }

                            <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTimelineDialog(client);
                          }}
                          className="border-green-500/30 hover:bg-green-500/10 text-green-400 hover:text-green-300"
                          title="Ver Timeline">
                          
                              <TrendingUp className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>);

                })}
                  </div>
              }
              </div>
            </div>

            {/* Right Column - Calendar (65%) */}
            <div className="hidden lg:block flex-1 min-w-0">
              <CalendarView
                onClientClick={(name) => setSearchTerm(name)}
                hideTitle
                hideStats
              />
            </div>
          </div>
        </div>

      {/* New Client Modal */}
      <Dialog open={newClientModalOpen} onOpenChange={setNewClientModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Novo Cliente</DialogTitle>
            <DialogDescription>Preencha as informações básicas do novo cliente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="new-client-name" className="text-sm font-medium">Nome do Cliente *</label>
              <Input
                id="new-client-name"
                placeholder="Ex: João Silva"
                value={newClientData.client_name}
                onChange={(e) => setNewClientData((prev) => ({ ...prev, client_name: e.target.value }))}
                autoFocus
                onKeyDown={(e) => {if (e.key === 'Enter') {e.preventDefault();handleCreateClient();}}} />
              
            </div>
            <div className="space-y-2">
              <label htmlFor="new-client-id" className="text-sm font-medium">ID do Cliente</label>
              <Input
                id="new-client-id"
                placeholder="Ex: 00064"
                value={newClientData.client_id}
                onChange={(e) => setNewClientData((prev) => ({ ...prev, client_id: e.target.value }))} />
              
            </div>
            <div className="space-y-2">
              <label htmlFor="new-client-date" className="text-sm font-medium">Data de Cadastro</label>
              <Input
                id="new-client-date"
                type="date"
                value={newClientData.start_date}
                onChange={(e) => setNewClientData((prev) => ({ ...prev, start_date: e.target.value }))} />
              
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setNewClientModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateClient} className="bg-gradient-primary hover:bg-gradient-hover">Criar Cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedClient &&
      <ClientDashboardModal
        client={selectedClient}
        isOpen={modalOpen}
        onClose={() => {setModalOpen(false);setSelectedClient(null);}}
        onSave={handleSaveClient} />

      }

      {clientForTimeline &&
      <ClientTimelineDialog
        client={clientForTimeline}
        isOpen={showClientTimelineDialog}
        onClose={() => {
          setShowClientTimelineDialog(false);
          setClientForTimeline(null);
          // Refresh latest events after closing timeline dialog
          if (clients.length > 0) loadLatestEvents(clients);
        }} />

      }
    </AppLayout>);

};

export default Clients;