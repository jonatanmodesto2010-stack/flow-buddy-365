import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Clock, Ban, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  total_records: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

const PAGE_SIZE = 10;

const statusConfig: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  completed: { icon: <CheckCircle2 size={14} />, label: 'Concluído', className: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
  error: { icon: <XCircle size={14} />, label: 'Erro', className: 'text-destructive bg-destructive/10' },
  cancelled: { icon: <Ban size={14} />, label: 'Cancelado', className: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
  running: { icon: <Clock size={14} />, label: 'Em andamento', className: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
  pending: { icon: <Clock size={14} />, label: 'Pendente', className: 'text-muted-foreground bg-muted' },
};

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}min ${secs}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function SyncHistory() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { organizationId } = useUserRole();

  useEffect(() => {
    if (organizationId) loadLogs();
  }, [organizationId, page]);

  const loadLogs = async () => {
    if (!organizationId) return;
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count } = await supabase
      .from('integration_sync_log')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    setLogs((data as SyncLog[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, totalCount);

  if (!loading && totalCount === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-lg font-bold mb-4">Histórico de Sincronizações</h3>

      {loading ? (
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Processados</th>
                  <th className="pb-2 font-medium text-right">Novos</th>
                  <th className="pb-2 font-medium text-right">Atualizados</th>
                  <th className="pb-2 font-medium text-right">Duração</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const st = statusConfig[log.status] || statusConfig.pending;
                  return (
                    <tr key={log.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5">{formatDate(log.created_at)}</td>
                      <td className="py-2.5 capitalize">{log.sync_type === 'full' ? 'Completa' : log.sync_type === 'boletos' ? 'Boletos' : log.sync_type === 'clients' ? 'Clientes' : log.sync_type === 'areceber' ? 'Contas a Receber' : log.sync_type}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.className}`}>
                          {st.icon}
                          {st.label}
                        </span>
                        {log.error_message && (
                          <span className="block text-xs text-destructive mt-0.5 max-w-[200px] truncate" title={log.error_message}>
                            {log.error_message}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{log.records_processed || 0}</td>
                      <td className="py-2.5 text-right tabular-nums text-green-600">{log.records_created || 0}</td>
                      <td className="py-2.5 text-right tabular-nums text-blue-600">{log.records_updated || 0}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatDuration(log.started_at, log.completed_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {rangeStart} - {rangeEnd} / {totalCount}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(0)}>
                  <ChevronsLeft size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {page + 1} / {totalPages}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
                  <ChevronsRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
