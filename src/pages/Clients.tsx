import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, History, TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Building2, Wifi, WifiOff } from 'lucide-react';
import { fetchInChunks } from '@/lib/supabase-helpers';
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
import { calculateOverdueDays, getClientBadgeInfo, getCardStyle, formatConnectionDuration, type ClientTimeline, type GroupedClient } from '@/lib/client-utils';
import type { User } from '@supabase/supabase-js';
import { ClientTimelineDialog } from '@/components/ClientTimelineDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientCard } from '@/components/ClientCard';
import { OverdueBadge } from '@/components/OverdueBadge';
import { useCollectionStatusRules } from '@/hooks/useCollectionStatusRules';

const ITEMS_PER_PAGE = 30;

const CLIENT_COLUMNS = 'id, client_name, client_id, status, is_active, organization_id, ixc_filial_id, ixc_filial_name, start_date, created_at, updated_at, user_id, completed_at, completion_notes, boleto_value, due_date';

const Clients = () => {

  const [clients, setClients] = useState<ClientTimeline[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [overdueDaysMap, setOverdueDaysMap] = useState<Map<string, number>>(new Map());
  const [onlineClients, setOnlineClients] = useState<Set<string>>(new Set());
  const [connectionTimes, setConnectionTimes] = useState<Map<string, { since: string; online: boolean }>>(new Map());
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [latestEventsMap, setLatestEventsMap] = useState<Map<string, {icon: string;description: string;event_date: string;}>>(new Map());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [overdueDaysLoading, setOverdueDaysLoading] = useState(false);
  const { organizationId, isLoading: roleLoading } = useUserRole();
  const { rules: statusRules } = useCollectionStatusRules();
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
  const [lastCompletedSyncAt, setLastCompletedSyncAt] = useState<string | null>(null);
  const lastCompletedSyncAtRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const isBlockedView = statusFilter === 'blocked';

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

      // Build base query builder function
      const buildBaseQuery = () => {
        let query = (supabaseClient as any).
        from('unique_client_timelines').
        select(CLIENT_COLUMNS, { count: 'exact' }).
        eq('organization_id', organizationId);

        if (filialFilter !== 'all') {
          query = query.eq('ixc_filial_id', filialFilter);
        }

        if (searchTerm) {
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

        query = query.
        order('is_active', { ascending: true }).
        order('client_name', { ascending: true });

        return query;
      };

      let data: any[] | null = null;
      let count: number | null = null;

      if (isBlockedView) {
        // Fetch ALL blocked clients in chunks of 1000
        const allResults: any[] = [];
        let from = 0;
        const CHUNK_SIZE = 1000;
        let hasMore = true;
        let totalFromServer: number | null = null;

        while (hasMore) {
          const query = buildBaseQuery().range(from, from + CHUNK_SIZE - 1);
          const result = await query;
          if (result.error) throw result.error;

          if (totalFromServer === null) {
            totalFromServer = result.count;
          }

          if (result.data && result.data.length > 0) {
            allResults.push(...result.data);
            from += CHUNK_SIZE;
            hasMore = result.data.length === CHUNK_SIZE;
          } else {
            hasMore = false;
          }
        }

        data = allResults;
        count = totalFromServer ?? allResults.length;
      } else {
        // Standard paginated mode
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE - 1;
        const query = buildBaseQuery().range(start, end);

        const result = await query;
        if (result.error) throw result.error;
        data = result.data;
        count = result.count;
      }

      setClients(data || []);
      setTotalCount(count || 0);

      // Load overdue days + latest events in background for visible clients only
      if (data && data.length > 0) {
        loadOverdueDays(data);
        loadLatestEvents(data);
        // Load online status for blocked clients
        const blockedClients = data.filter((c: any) => !c.is_active && c.status !== 'archived' && c.status !== 'completed');
        if (blockedClients.length > 0) {
          loadOnlineStatus(blockedClients);
        } else {
          setOnlineClients(new Set());
        }
      } else {
        setOverdueDaysMap(new Map());
        setOnlineClients(new Set());
        setLatestEventsMap(new Map());
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

      // Use fetchInChunks for large lists
      const boletos = timelineIds.length > 200
        ? await fetchInChunks('client_boletos', 'timeline_id', timelineIds, 'timeline_id, due_date, status')
        : await (async () => {
            const { data } = await supabaseClient.from('client_boletos').select('timeline_id, due_date, status').in('timeline_id', timelineIds);
            return data || [];
          })();

      const boletosMap = new Map<string, {due_date: string;status: string;}[]>();
      for (const b of boletos) {
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
      if (data?.connection_times) {
        const map = new Map<string, { since: string; online: boolean }>();
        for (const [cid, info] of Object.entries(data.connection_times as Record<string, { since: string; online: boolean }>)) {
          map.set(cid, info);
        }
        setConnectionTimes(map);
      }
    } catch (err) {
      console.error('Error loading online status:', err);
    } finally {
      setOnlineLoading(false);
    }
  };

  const loadLatestEvents = async (timelines: ClientTimeline[]) => {
    try {
      const timelineIds = timelines.map((t) => t.id);
      const { data, error } = await (supabaseClient as any).
      from('latest_client_events').
      select('timeline_id, icon, description, event_date').
      in('timeline_id', timelineIds);
      if (error) throw error;
      const map = new Map<string, {icon: string;description: string;event_date: string;}>();
      for (const e of data || []) {
        if (e.timeline_id) {
          map.set(e.timeline_id, { icon: e.icon || '💬', description: e.description || '', event_date: e.event_date || '' });
        }
      }
      setLatestEventsMap(map);
    } catch (err) {
      console.error('Error loading latest events:', err);
    }
  };


  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, filialFilter]);

  // Polling: re-fetch online status + tick for duration re-render every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      const blockedClients = clients.filter((c) => !c.is_active && c.status !== 'archived' && c.status !== 'completed');
      if (blockedClients.length > 0) {
        loadOnlineStatus(blockedClients);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [clients, organizationId]);

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

  const getClientInfo = (client: ClientTimeline) => getClientBadgeInfo(client, overdueDaysMap);

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
      </AppLayout>);

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
      </AppLayout>);

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
      </AppLayout>);

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
                  setSortBy((filters.sortBy as any) || 'default');
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
                  const info = getClientInfo(client);
                  const evt = latestEventsMap.get(client.id);
                  return (
                    <ClientCard
                      key={client.id}
                      title={client.client_name}
                      subtitle={evt ? `${evt.event_date}  ${evt.description}` : undefined}
                      subtitleIcon={evt?.icon}
                      cardStyle={getCardStyle(info)}
                      onClick={() => handleOpenModal(client)}
                      badges={<>
                        {info.overdueDays > 0 &&
                          <OverdueBadge overdueDays={info.overdueDays} rules={statusRules} />
                        }
                        {info.isBlocked && <>
                          
                          {client.client_id && (() => {
                            const connInfo = connectionTimes.get(client.client_id!);
                            const duration = connInfo ? formatConnectionDuration(connInfo.since) : null;
                            const isOnline = onlineClients.has(client.client_id!);
                            if (isOnline) {
                              return (
                                <div className="px-2.5 py-1 text-xs rounded-full flex items-center gap-1 font-semibold border border-green-500/30 text-muted-foreground bg-emerald-500">
                                  {duration && <span className="opacity-80">[{duration}]</span>}
                                  <Wifi size={11} /> ON
                                </div>
                              );
                            }
                            if (!onlineLoading) {
                              return (
                                <div className="px-2.5 py-1 text-muted-foreground text-xs rounded-full flex items-center gap-1 font-semibold border border-border bg-red-500">
                                  {duration && <span className="opacity-80">[{duration}]</span>}
                                  <WifiOff size={11} /> OFF
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </>}
                        {info.isInactive && <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">Inativo</div>}
                        {info.isCompleted && <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">Finalizado</div>}
                        <Button variant="outline" size="icon" onClick={(e) => {e.stopPropagation();handleOpenTimelineDialog(client);}} className="border-green-500/30 hover:bg-green-500/10 text-green-400 hover:text-green-300" title="Ver Timeline">
                          <TrendingUp className="w-4 h-4" />
                        </Button>
                      </>} />);


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
              hideStats />
            
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
        onClose={() => {setModalOpen(false);setSelectedClient(null);loadLatestEvents(clients);}}
        onSave={handleSaveClient} />

      }

      {clientForTimeline &&
      <ClientTimelineDialog
        client={clientForTimeline}
        isOpen={showClientTimelineDialog}
        onClose={() => {setShowClientTimelineDialog(false);setClientForTimeline(null);loadLatestEvents(clients);}} />

      }
    </AppLayout>);

};

export default Clients;