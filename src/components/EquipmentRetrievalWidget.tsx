import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ChevronLeft, ChevronRight, Copy, Settings, TrendingUp, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseClient } from '@/lib/supabase-client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ClientCard } from '@/components/ClientCard';
import { ClientTimelineDialog } from '@/components/ClientTimelineDialog';
import { calculateOverdueDays, getClientBadgeInfo, getCardStyle, type ClientTimeline } from '@/lib/client-utils';

interface OSRetirada {
  id: string;
  id_cliente: string;
  cliente_nome: string;
  data_abertura: string;
  status: string;
  descricao: string;
}

const STATUS_COLORS: Record<string, string> = {
  'Aberta': 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  'Nova': 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  'Em andamento': 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  'Executando': 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  'Aguardando': 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
};

function getStatusClass(status: string): string {
  return STATUS_COLORS[status] || 'bg-muted text-muted-foreground border-border';
}

function formatDate(raw: string): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return raw;
  }
}

const PAGE_SIZE = 10;

export const EquipmentRetrievalWidget = () => {
  const [osList, setOsList] = useState<OSRetirada[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [notConfigured, setNotConfigured] = useState(false);

  // Enrichment state
  const [timelineMap, setTimelineMap] = useState<Map<string, ClientTimeline>>(new Map());
  const [latestEventsMap, setLatestEventsMap] = useState<Map<string, { icon: string; description: string; event_date: string }>>(new Map());
  const [overdueDaysMap, setOverdueDaysMap] = useState<Map<string, number>>(new Map());
  const [onlineClients, setOnlineClients] = useState<Set<string>>(new Set());
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [showTimelineDialog, setShowTimelineDialog] = useState(false);
  const [clientForTimeline, setClientForTimeline] = useState<any>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { organizationId } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchOS = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('ixc_os_retirada_assunto_id')
        .eq('organization_id', organizationId)
        .eq('integration_type', 'ixc')
        .eq('is_active', true)
        .maybeSingle();

      if (!integration?.ixc_os_retirada_assunto_id) {
        setNotConfigured(true);
        setLoading(false);
        return;
      }
      setNotConfigured(false);
    } catch (err) {
      console.error('[EquipmentRetrievalWidget] Erro ao verificar configuração:', err);
    }

    try {
      const { data, error } = await supabase.functions.invoke('ixc-os-retirada', {
        body: { organization_id: organizationId },
      });
      if (error) {
        console.error('[EquipmentRetrievalWidget] Erro na edge function:', error);
        setLoading(false);
        return;
      }
      const list: OSRetirada[] = data?.os_list || [];
      setOsList(list);

      // Enrich with client timeline data
      if (list.length > 0) {
        enrichWithClientData(list);
      }
    } catch (err) {
      console.error('[EquipmentRetrievalWidget] Erro geral:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const enrichWithClientData = useCallback(async (list: OSRetirada[]) => {
    if (!organizationId) return;

    const clientIds = [...new Set(list.map(os => os.id_cliente).filter(Boolean))];
    if (clientIds.length === 0) return;

    try {
      // 1. Find timelines by client_id
      const { data: timelines } = await (supabaseClient as any)
        .from('unique_client_timelines')
        .select('id, client_name, client_id, status, is_active, organization_id, ixc_filial_id, ixc_filial_name, start_date, created_at, updated_at, user_id, completed_at, completion_notes, boleto_value, due_date')
        .eq('organization_id', organizationId)
        .in('client_id', clientIds);

      const tMap = new Map<string, ClientTimeline>();
      if (timelines) {
        for (const t of timelines) {
          if (t.client_id) tMap.set(t.client_id, t);
        }
      }
      setTimelineMap(tMap);

      const timelineIds = timelines?.map((t: any) => t.id).filter(Boolean) || [];
      if (timelineIds.length === 0) return;

      // 2. Load latest events + boletos in parallel
      const [eventsResult, boletosResult] = await Promise.all([
        (supabaseClient as any)
          .from('latest_client_events')
          .select('timeline_id, icon, description, event_date')
          .in('timeline_id', timelineIds),
        supabaseClient
          .from('client_boletos')
          .select('timeline_id, due_date, status')
          .in('timeline_id', timelineIds),
      ]);

      // Events map
      const evtMap = new Map<string, { icon: string; description: string; event_date: string }>();
      for (const e of eventsResult.data || []) {
        if (e.timeline_id) {
          evtMap.set(e.timeline_id, { icon: e.icon || '💬', description: e.description || '', event_date: e.event_date || '' });
        }
      }
      setLatestEventsMap(evtMap);

      // Overdue days map
      const boletosMap = new Map<string, { due_date: string; status: string }[]>();
      for (const b of boletosResult.data || []) {
        if (!boletosMap.has(b.timeline_id)) boletosMap.set(b.timeline_id, []);
        boletosMap.get(b.timeline_id)!.push(b);
      }
      const odMap = new Map<string, number>();
      for (const t of timelines || []) {
        const clientBoletos = boletosMap.get(t.id) || [];
        const days = calculateOverdueDays(clientBoletos);
        if (days > 0) odMap.set(t.id, days);
      }
      setOverdueDaysMap(odMap);

      // 3. Check online for blocked clients
      const blocked = (timelines || []).filter((c: any) => !c.is_active && c.status !== 'archived' && c.status !== 'completed');
      if (blocked.length > 0) {
        loadOnlineStatus(blocked.map((c: any) => c.client_id).filter(Boolean));
      }
    } catch (err) {
      console.error('[EquipmentRetrievalWidget] Erro ao enriquecer dados:', err);
    }
  }, [organizationId]);

  const loadOnlineStatus = async (clientIds: string[]) => {
    if (clientIds.length === 0) return;
    try {
      setOnlineLoading(true);
      const { data } = await supabase.functions.invoke('ixc-check-online', {
        body: { organization_id: organizationId, client_ids: clientIds },
      });
      if (data?.online_clients) {
        setOnlineClients(new Set(data.online_clients.map(String)));
      }
    } catch (err) {
      console.error('[EquipmentRetrievalWidget] Erro ao verificar online:', err);
    } finally {
      setOnlineLoading(false);
    }
  };

  useEffect(() => {
    if (!organizationId) return;
    fetchOS();
    intervalRef.current = setInterval(fetchOS, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [organizationId, fetchOS]);

  const totalPages = Math.max(1, Math.ceil(osList.length / PAGE_SIZE));
  const pagedItems = osList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleItemClick = (os: OSRetirada) => {
    if (os.id_cliente) {
      navigate(`/clients?search=${encodeURIComponent(os.cliente_nome)}`);
    } else {
      navigator.clipboard.writeText(os.id);
      toast({ title: 'ID copiado', description: `OS #${os.id} copiado para a área de transferência` });
    }
  };

  const handleCopyId = (e: React.MouseEvent, os: OSRetirada) => {
    e.stopPropagation();
    navigator.clipboard.writeText(os.id);
    toast({ title: 'ID copiado', description: `OS #${os.id}` });
  };

  const handleOpenTimeline = (e: React.MouseEvent, os: OSRetirada) => {
    e.stopPropagation();
    const timeline = timelineMap.get(os.id_cliente);
    if (timeline) {
      setClientForTimeline(timeline);
      setShowTimelineDialog(true);
    }
  };

  return (
    <div>
      <Separator className="my-4" />
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
        <Package size={16} />
        📦 OS de Retirada
      </h4>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : notConfigured ? (
        <div className="py-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Settings size={20} className="text-muted-foreground/60" />
          Configure o ID do assunto de retirada nas integrações para visualizar as OS
        </div>
      ) : osList.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma retirada de equipamento pendente
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagedItems.map((os) => {
              const timeline = timelineMap.get(os.id_cliente);
              const info = timeline
                ? getClientBadgeInfo(timeline, overdueDaysMap)
                : { overdueDays: 0, isBlocked: false, isOverdue: false, isInactive: false, isCompleted: false };
              const evt = timeline ? latestEventsMap.get(timeline.id) : undefined;
              const cardStyle = timeline ? getCardStyle(info) : 'bg-card border border-border';

              return (
                <ClientCard
                  key={os.id}
                  title={os.cliente_nome}
                  subtitle={evt?.description}
                  subtitleIcon={evt?.icon}
                  subtitleSuffix={evt?.event_date}
                  secondarySubtitle={`${formatDate(os.data_abertura)} • OS #${os.id}`}
                  secondarySubtitleIcon="📦"
                  cardStyle={cardStyle}
                  onClick={() => handleItemClick(os)}
                  badges={
                    <>
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getStatusClass(os.status)}`}>
                        {os.status}
                      </Badge>
                      {info.overdueDays > 0 && (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${info.isBlocked ? 'bg-red-500 text-white' : info.isOverdue ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'}`}>
                          {info.overdueDays}d
                        </div>
                      )}
                      {info.isBlocked && (
                        <>
                          <div className="px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1 font-semibold border border-red-500/30">🔒</div>
                          {timeline?.client_id && (
                            onlineClients.has(timeline.client_id) ? (
                              <div className="px-2.5 py-1 text-xs rounded-full flex items-center gap-1 font-semibold border border-green-500/30 text-muted-foreground bg-emerald-500"><Wifi size={11} /> ON</div>
                            ) : !onlineLoading ? (
                              <div className="px-2.5 py-1 text-muted-foreground text-xs rounded-full flex items-center gap-1 font-semibold border border-border bg-red-500"><WifiOff size={11} /> OFF</div>
                            ) : null
                          )}
                        </>
                      )}
                      {info.isInactive && <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">Inativo</div>}
                      {info.isCompleted && <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">Finalizado</div>}
                      <button
                        onClick={(e) => handleCopyId(e, os)}
                        className="p-1 rounded hover:bg-muted transition-opacity"
                        title="Copiar ID"
                      >
                        <Copy size={12} className="text-muted-foreground" />
                      </button>
                      {timeline && (
                        <Button variant="outline" size="icon" onClick={(e) => handleOpenTimeline(e, os)} className="border-green-500/30 hover:bg-green-500/10 text-green-400 hover:text-green-300" title="Ver Timeline">
                          <TrendingUp className="w-4 h-4" />
                        </Button>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="h-7 text-xs"
              >
                <ChevronLeft size={14} className="mr-1" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="h-7 text-xs"
              >
                Próximo
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      {clientForTimeline && (
        <ClientTimelineDialog
          client={clientForTimeline}
          isOpen={showTimelineDialog}
          onClose={() => { setShowTimelineDialog(false); setClientForTimeline(null); }}
        />
      )}
    </div>
  );
};
