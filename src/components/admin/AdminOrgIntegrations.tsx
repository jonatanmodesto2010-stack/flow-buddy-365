import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, RefreshCw, AlertTriangle, Save, Wifi, CheckCircle2, XCircle, Clock, Ban,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, EyeOff, Users, FileText, StopCircle, ShieldAlert
} from 'lucide-react';

const INTEGRATION_TYPES = [
  { value: 'ixc', label: 'IXC Provedor' },
  { value: 'sgp', label: 'SGP' },
  { value: 'mk', label: 'MK Solutions' },
  { value: 'radius', label: 'Radius' },
  { value: 'outro', label: 'Outro' },
];

interface Integration {
  id: string;
  integration_type: string;
  api_url: string | null;
  api_token: string | null;
  api_url_contracts: string | null;
  is_active: boolean;
}

interface SyncProgress {
  id: string;
  status: string;
  records_processed: number;
  total_records: number;
  started_at: string;
  error_message: string | null;
}

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

const PAGE_SIZE = 5;

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

interface AdminOrgIntegrationsProps {
  organizationId: string;
}

export const AdminOrgIntegrations = ({ organizationId }: AdminOrgIntegrationsProps) => {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [integrationType, setIntegrationType] = useState('ixc');
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [apiUrlContracts, setApiUrlContracts] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeSyncAction, setActiveSyncAction] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressTimeRef = useRef<number>(0);
  const { toast } = useToast();

  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncLogsLoading, setSyncLogsLoading] = useState(false);
  const [syncPage, setSyncPage] = useState(0);
  const [syncTotalCount, setSyncTotalCount] = useState(0);

  useEffect(() => {
    loadIntegration();
    checkRunningSync();
    return () => stopPolling();
  }, [organizationId]);

  useEffect(() => {
    loadSyncLogs();
  }, [organizationId, syncPage]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const loadIntegration = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setIntegration(data);
        setIntegrationType(data.integration_type || 'ixc');
        setApiUrl(data.api_url || '');
        setApiToken(data.api_token || '');
        setApiUrlContracts(data.api_url_contracts || '');
        setIsActive(data.is_active);
      } else {
        setIntegration(null);
        setIntegrationType('ixc');
        setApiUrl('');
        setApiToken('');
        setApiUrlContracts('');
        setIsActive(true);
      }
    } catch (err: any) {
      console.error('Error loading integration:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkRunningSync = async () => {
    const { data } = await supabase
      .from('integration_sync_log')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setSyncProgress(data as SyncProgress);
      lastProgressTimeRef.current = Date.now();
      startPolling(data.id);
    }
  };

  const loadSyncLogs = async () => {
    setSyncLogsLoading(true);
    const from = syncPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from('integration_sync_log')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);
    setSyncLogs((data as SyncLog[]) || []);
    setSyncTotalCount(count || 0);
    setSyncLogsLoading(false);
  };

  const startPolling = useCallback((syncId: string) => {
    stopPolling();
    lastProgressTimeRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('integration_sync_log')
        .select('*')
        .eq('id', syncId)
        .single();

      if (!data) return;

      const prev = syncProgress;
      const newProcessed = data.records_processed || 0;

      if (data.status === 'running') {
        if (!prev || newProcessed !== (prev.records_processed || 0)) {
          lastProgressTimeRef.current = Date.now();
        }
        const stallSeconds = (Date.now() - lastProgressTimeRef.current) / 1000;
        if (stallSeconds > 120) {
          await supabase
            .from('integration_sync_log')
            .update({ status: 'error', error_message: 'Travamento detectado (120s sem progresso)', completed_at: new Date().toISOString() })
            .eq('id', syncId);
           setSyncProgress(null);
          setActiveSyncAction(null);
          stopPolling();
          toast({ title: 'Sincronização travada', description: 'Interrompida após 120s sem progresso.', variant: 'destructive' });
          return;
        }
      }

      setSyncProgress(data as SyncProgress);

      if (data.status !== 'running') {
        stopPolling();
        if (data.status === 'completed') {
          toast({ title: 'Sincronização concluída', description: `${data.records_created || 0} novos, ${data.records_updated || 0} atualizados.` });
        } else if (data.status === 'cancelled') {
          toast({ title: 'Sincronização cancelada' });
        } else if (data.status === 'error') {
          toast({ title: 'Erro na sincronização', description: data.error_message || 'Erro desconhecido', variant: 'destructive' });
        }
        setTimeout(() => {
           setSyncProgress(null);
          setActiveSyncAction(null);
          loadSyncLogs();
        }, 3000);
      }
    }, 2000);
  }, [syncProgress, toast]);

  const handleCancelSync = async () => {
    if (!syncProgress) return;
    setCancelling(true);
    try {
      await supabase
        .from('integration_sync_log')
        .update({ status: 'cancelled' })
        .eq('id', syncProgress.id);
    } catch (err: any) {
      toast({ title: 'Erro ao cancelar', description: err.message, variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (integration) {
        const { error } = await supabase
          .from('organization_integrations')
          .update({
            integration_type: integrationType,
            api_url: apiUrl || null,
            api_token: apiToken || null,
            api_url_contracts: apiUrlContracts || null,
            is_active: isActive,
          })
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_integrations')
          .insert({
            organization_id: organizationId,
            integration_type: integrationType,
            api_url: apiUrl || null,
            api_token: apiToken || null,
            api_url_contracts: apiUrlContracts || null,
            is_active: isActive,
          });
        if (error) throw error;
      }
      await loadIntegration();
      toast({ title: 'Integração salva com sucesso!' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiUrl || !apiToken) {
      toast({ title: 'Preencha a URL e o Token', variant: 'destructive' });
      return;
    }
    if (integrationType !== 'ixc') {
      toast({ title: 'Teste de conexão disponível apenas para IXC no momento.' });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ixc-sync', {
        body: { action: 'test', api_url: apiUrl, api_token: apiToken },
      });
      if (error) throw error;
      toast({ title: 'Conexão OK', description: `Conectado com sucesso. ${data?.active_clients || 0} clientes ativos de ${data?.total_clients || 0} total.` });
    } catch (err: any) {
      toast({ title: 'Falha na conexão', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const startSync = async (syncAction: string) => {
    if (syncProgress?.status === 'running') return;
    setActiveSyncAction(syncAction);
    try {
      supabase.functions.invoke('ixc-sync', {
        body: { action: syncAction, organization_id: organizationId },
      });
      setTimeout(async () => {
        const { data } = await supabase
          .from('integration_sync_log')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('status', 'running')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setSyncProgress(data as SyncProgress);
          startPolling(data.id);
        }
      }, 1500);
    } catch (err: any) {
      setActiveSyncAction(null);
      toast({ title: 'Erro ao iniciar sincronização', description: err.message, variant: 'destructive' });
    }
  };

  const isSyncing = syncProgress?.status === 'running';
  const progressPercent = syncProgress && syncProgress.total_records > 0
    ? Math.round((syncProgress.records_processed / syncProgress.total_records) * 100)
    : 0;

  const getETA = () => {
    if (!syncProgress?.started_at || !syncProgress.records_processed || !syncProgress.total_records) return null;
    const elapsed = (Date.now() - new Date(syncProgress.started_at).getTime()) / 1000;
    const rate = syncProgress.records_processed / elapsed;
    if (rate <= 0) return null;
    const remaining = (syncProgress.total_records - syncProgress.records_processed) / rate;
    if (remaining < 60) return `~${Math.ceil(remaining)}s`;
    return `~${Math.ceil(remaining / 60)}min`;
  };

  const syncTotalPages = Math.max(1, Math.ceil(syncTotalCount / PAGE_SIZE));
  const typeLabel = INTEGRATION_TYPES.find(t => t.value === integrationType)?.label || integrationType;

  if (loading) return <Card><CardContent className="p-6"><div className="h-32 bg-muted animate-pulse rounded-lg" /></CardContent></Card>;

  return (
    <div className="space-y-6">
      {/* Card 1: Configuração */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração — {typeLabel}</CardTitle>
          <CardDescription>Configure as credenciais de acesso ao sistema do provedor</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Sistema</Label>
            <Select value={integrationType} onValueChange={setIntegrationType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTEGRATION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label>Integração Ativa</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div>
            <Label>URL da API</Label>
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://seu-provedor.com.br/webservice/v1" />
            <p className="text-xs text-muted-foreground mt-1">Apenas o domínio base da API do provedor, sem barras extras no final</p>
          </div>

          <div>
            <Label>Token da API</Label>
            <div className="relative">
              <Input
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Seu token de autenticação"
                type={showToken ? 'text' : 'password'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Encontre o token no painel do provedor em Configurações &gt; API</p>
          </div>

          {integrationType === 'ixc' && (
            <div>
              <Label>URL da API de Contratos (Opcional)</Label>
              <Input value={apiUrlContracts} onChange={(e) => setApiUrlContracts(e.target.value)} placeholder="URL alternativa para consultar contratos" />
              <p className="text-xs text-muted-foreground mt-1">Use apenas se a API de contratos estiver em um endereço diferente</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
              Salvar Configurações
            </Button>
            <Button onClick={handleTestConnection} variant="outline" disabled={testing || integrationType !== 'ixc'}>
              {testing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Wifi size={16} className="mr-2" />}
              Testar Conexão
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Sincronização */}
      {integration && integrationType === 'ixc' && (
        <Card>
          <CardHeader>
            <CardTitle>Sincronização</CardTitle>
            <CardDescription>Sincronize manualmente clientes e boletos do provedor. A sincronização automática ocorre a cada 10 minutos via cron.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            {syncProgress && (
              <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {syncProgress.status === 'running' && 'Sincronizando...'}
                    {syncProgress.status === 'completed' && '✅ Concluído'}
                    {syncProgress.status === 'cancelled' && '⏹ Cancelado'}
                    {syncProgress.status === 'error' && '❌ Erro'}
                  </span>
                  <span className="text-muted-foreground">
                    {syncProgress.records_processed}/{syncProgress.total_records} registros
                    {isSyncing && getETA() && ` • ETA: ${getETA()}`}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{progressPercent}%</span>
                </div>
                {syncProgress.status === 'error' && syncProgress.error_message && (
                  <div className="flex items-center gap-2 text-xs text-destructive mt-1">
                    <AlertTriangle size={12} />
                    {syncProgress.error_message}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={isSyncing} onClick={() => startSync('sync_clients')}>
                {activeSyncAction === 'sync_clients' && isSyncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Users size={16} className="mr-2" />}
                Sincronizar Clientes
              </Button>
              <Button variant="outline" disabled={isSyncing} onClick={() => startSync('sync_boletos')}>
                {activeSyncAction === 'sync_boletos' && isSyncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <FileText size={16} className="mr-2" />}
                Sincronizar Boletos
              </Button>
              <Button variant="outline" disabled={isSyncing} onClick={() => startSync('sync')}>
                {activeSyncAction === 'sync' && isSyncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                Sincronizar Tudo
              </Button>
              <Button variant="outline" disabled={isSyncing} onClick={() => startSync('check_blocked')}>
                {activeSyncAction === 'check_blocked' && isSyncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <ShieldAlert size={16} className="mr-2" />}
                Diagnóstico Bloqueados
              </Button>
              {isSyncing && (
                <Button variant="destructive" onClick={handleCancelSync} disabled={cancelling}>
                  {cancelling ? <Loader2 size={16} className="mr-2 animate-spin" /> : <StopCircle size={16} className="mr-2" />}
                  Parar Sincronização
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card 3: Histórico */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Histórico de Sincronizações</CardTitle>
            <CardDescription>Registro das últimas sincronizações realizadas</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => loadSyncLogs()} className="h-8 w-8">
            <RefreshCw size={16} />
          </Button>
        </CardHeader>
        <CardContent>
          {syncLogsLoading ? (
            <div className="h-24 bg-muted animate-pulse rounded-lg" />
          ) : syncTotalCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma sincronização realizada ainda.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Data</th>
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Proc.</th>
                      <th className="pb-2 font-medium text-right">Novos</th>
                      <th className="pb-2 font-medium text-right">Atual.</th>
                      <th className="pb-2 font-medium text-right">Duração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map((log) => {
                      const st = statusConfig[log.status] || statusConfig.pending;
                      return (
                        <tr key={log.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2">{formatDate(log.created_at)}</td>
                          <td className="py-2">{log.sync_type === 'full' ? 'Completa' : log.sync_type === 'boletos' ? 'Boletos' : log.sync_type === 'clients' ? 'Clientes' : log.sync_type === 'areceber' ? 'Contas a Receber' : log.sync_type}</td>
                          <td className="py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.className}`}>
                              {st.icon}{st.label}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{log.records_processed || 0}</td>
                          <td className="py-2 text-right tabular-nums text-green-600">{log.records_created || 0}</td>
                          <td className="py-2 text-right tabular-nums text-blue-600">{log.records_updated || 0}</td>
                          <td className="py-2 text-right tabular-nums">{formatDuration(log.started_at, log.completed_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {syncTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {syncPage * PAGE_SIZE + 1}-{Math.min((syncPage + 1) * PAGE_SIZE, syncTotalCount)} / {syncTotalCount}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={syncPage === 0} onClick={() => setSyncPage(0)}><ChevronsLeft size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={syncPage === 0} onClick={() => setSyncPage(p => p - 1)}><ChevronLeft size={14} /></Button>
                    <span className="text-xs text-muted-foreground px-2">{syncPage + 1}/{syncTotalPages}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={syncPage >= syncTotalPages - 1} onClick={() => setSyncPage(p => p + 1)}><ChevronRight size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={syncPage >= syncTotalPages - 1} onClick={() => setSyncPage(syncTotalPages - 1)}><ChevronsRight size={14} /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
