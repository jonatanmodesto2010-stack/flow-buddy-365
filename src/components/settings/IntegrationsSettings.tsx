import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, Square, AlertTriangle } from 'lucide-react';
import { SyncHistory } from './SyncHistory';

interface Integration {
  id: string;
  integration_type: string;
  api_url: string | null;
  api_token: string | null;
  api_url_contracts: string | null;
  ixc_os_retirada_assunto_id: string | null;
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

export const IntegrationsSettings = () => {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [apiUrlContracts, setApiUrlContracts] = useState('');
  const [osRetiradaAssuntoId, setOsRetiradaAssuntoId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressTimeRef = useRef<number>(0);
  const { organizationId } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (organizationId) loadIntegration();
    return () => stopPolling();
  }, [organizationId]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const loadIntegration = async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('integration_type', 'ixc')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setIntegration(data);
        setApiUrl(data.api_url || '');
        setApiToken(data.api_token || '');
        setApiUrlContracts(data.api_url_contracts || '');
        setOsRetiradaAssuntoId(data.ixc_os_retirada_assunto_id || '');
        setIsActive(data.is_active);
      }
    } catch (err: any) {
      console.error('Error loading integration:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check for any running sync on mount
  useEffect(() => {
    if (!organizationId) return;
    const checkRunning = async () => {
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
    checkRunning();
  }, [organizationId]);

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

      // Stall detection: if no progress change in 120s, mark as stalled
      if (data.status === 'running') {
        if (!prev || newProcessed !== (prev.records_processed || 0)) {
          lastProgressTimeRef.current = Date.now();
        }
        const stallSeconds = (Date.now() - lastProgressTimeRef.current) / 1000;
        if (stallSeconds > 120) {
          // Auto-reset stalled sync
          await supabase
            .from('integration_sync_log')
            .update({ status: 'error', error_message: 'Travamento detectado (120s sem progresso)', completed_at: new Date().toISOString() })
            .eq('id', syncId);
          setSyncProgress(null);
          stopPolling();
          toast({ title: 'Sincronização travada', description: 'A sincronização foi interrompida após 120s sem progresso.', variant: 'destructive' });
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
        // Clear progress after a delay
        setTimeout(() => setSyncProgress(null), 5000);
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
    if (!organizationId) return;
    setSaving(true);
    try {
      if (integration) {
        const { error } = await supabase
          .from('organization_integrations')
          .update({
            api_url: apiUrl || null,
            api_token: apiToken || null,
            api_url_contracts: apiUrlContracts || null,
            ixc_os_retirada_assunto_id: osRetiradaAssuntoId || null,
            is_active: isActive,
          })
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_integrations')
          .insert({
            organization_id: organizationId,
            integration_type: 'ixc',
            api_url: apiUrl || null,
            api_token: apiToken || null,
            api_url_contracts: apiUrlContracts || null,
            ixc_os_retirada_assunto_id: osRetiradaAssuntoId || null,
            is_active: isActive,
          });
        if (error) throw error;
      }
      await loadIntegration();
      toast({ title: 'Integração salva com sucesso' });
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
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ixc-sync', {
        body: { action: 'test', api_url: apiUrl, api_token: apiToken },
      });
      if (error) throw error;
      toast({ title: 'Conexão OK', description: `Conectado ao IXC com sucesso. ${data?.total_clients || 0} clientes encontrados.` });
    } catch (err: any) {
      toast({ title: 'Falha na conexão', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const startSync = async (syncAction: string) => {
    if (syncProgress?.status === 'running') {
      toast({ title: 'Já existe uma sincronização em andamento', description: 'Aguarde finalizar antes de iniciar outra.' });
      return;
    }
    try {
      const result = await supabase.functions.invoke('ixc-sync', {
        body: { action: syncAction, organization_id: organizationId },
      });

      // Parse response data - try result.data first, then error.context (Response object)
      let responseData = result.data;
      
      // When edge function returns non-2xx, supabase-js may put body in error.context
      if (result.error && (!responseData || (responseData instanceof Blob && responseData.size === 0))) {
        const errAny = result.error as any;
        if (errAny.context && typeof errAny.context.json === 'function') {
          try {
            responseData = await errAny.context.json();
          } catch { /* ignore */ }
        }
      }
      
      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          responseData = JSON.parse(text);
        } catch { /* ignore parse errors */ }
      } else if (typeof responseData === 'string') {
        try { responseData = JSON.parse(responseData); } catch { /* ignore */ }
      }

      // Log for debugging
      console.log('[startSync]', { action: syncAction, error: result.error?.message, responseData });

      if (result.error) {
        const is409 = responseData?.running_sync_id || 
                       (typeof responseData?.error === 'string' && responseData.error.includes('em andamento')) ||
                       result.error.message?.includes('em andamento');
        
        if (is409) {
          toast({ title: 'Sincronização já em andamento', description: 'Aguarde finalizar antes de iniciar outra.' });
          // Pick up the running sync for progress tracking
          const runningSyncId = responseData?.running_sync_id;
          if (runningSyncId) {
            const { data } = await supabase
              .from('integration_sync_log')
              .select('*')
              .eq('id', runningSyncId)
              .single();
            if (data) {
              setSyncProgress(data as SyncProgress);
              startPolling(data.id);
            }
          } else {
            // Fallback: find running sync by org
            const { data } = await supabase
              .from('integration_sync_log')
              .select('*')
              .eq('organization_id', organizationId!)
              .eq('status', 'running')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data) {
              setSyncProgress(data as SyncProgress);
              startPolling(data.id);
            }
          }
          return;
        }
        // Other errors → destructive toast
        toast({ title: 'Erro ao iniciar sincronização', description: responseData?.error || result.error.message, variant: 'destructive' });
        return;
      }

      // Success - poll for the new sync log after a short delay
      setTimeout(async () => {
        const { data } = await supabase
          .from('integration_sync_log')
          .select('*')
          .eq('organization_id', organizationId!)
          .eq('status', 'running')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setSyncProgress(data as SyncProgress);
          startPolling(data.id);
        }
      }, 500);
    } catch (err: any) {
      toast({ title: 'Erro ao iniciar sincronização', description: err.message, variant: 'destructive' });
    }
  };

  const isSyncing = syncProgress?.status === 'running';
  const progressPercent = syncProgress && syncProgress.total_records > 0
    ? Math.round((syncProgress.records_processed / syncProgress.total_records) * 100)
    : 0;

  // ETA calculation
  const getETA = () => {
    if (!syncProgress || !syncProgress.started_at || !syncProgress.records_processed || !syncProgress.total_records) return null;
    const elapsed = (Date.now() - new Date(syncProgress.started_at).getTime()) / 1000;
    const rate = syncProgress.records_processed / elapsed;
    if (rate <= 0) return null;
    const remaining = (syncProgress.total_records - syncProgress.records_processed) / rate;
    if (remaining < 60) return `~${Math.ceil(remaining)}s`;
    return `~${Math.ceil(remaining / 60)}min`;
  };

  if (loading) return <div className="h-32 bg-muted animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-xl font-bold mb-1">Integração IXC Provedor</h3>
        <p className="text-sm text-muted-foreground mb-6">Configure a conexão com o sistema IXC para sincronização automática</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Integração Ativa</label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">URL da API</label>
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://seu-ixc.com.br/webservice/v1" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Token da API</label>
            <Input value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="Seu token de autenticação" type="password" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">URL da API de Contratos (Opcional)</label>
            <Input value={apiUrlContracts} onChange={(e) => setApiUrlContracts(e.target.value)} placeholder="URL alternativa para consultar contratos" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">ID do Assunto de Retirada (IXC)</label>
            <Input value={osRetiradaAssuntoId} onChange={(e) => setOsRetiradaAssuntoId(e.target.value)} placeholder="ID do assunto de retirada de equipamento no IXC" />
            <p className="text-xs text-muted-foreground mt-1">Utilizado para buscar OS de retirada de equipamento no Dashboard</p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={handleTestConnection} variant="outline" disabled={testing}>
              {testing && <Loader2 size={16} className="mr-2 animate-spin" />}
              Testar Conexão
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
              Salvar Configurações
            </Button>
          </div>

          {integration && (
            <div className="border-t border-border pt-4 mt-4 space-y-3">
              <h4 className="text-sm font-semibold">Sincronização Manual</h4>

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
                    {isSyncing && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleCancelSync}
                        disabled={cancelling}
                        className="h-7 text-xs"
                      >
                        {cancelling ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Square size={12} className="mr-1" />}
                        Parar
                      </Button>
                    )}
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
                <Button
                  variant="outline"
                  disabled={isSyncing}
                  onClick={() => startSync('sync')}
                >
                  {isSyncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                  Sincronizar Tudo
                </Button>
                <Button
                  variant="outline"
                  disabled={isSyncing}
                  onClick={() => startSync('sync_boletos')}
                >
                  {isSyncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                  Sincronizar Boletos
                </Button>
                <Button
                  variant="outline"
                  disabled={isSyncing}
                  onClick={() => startSync('sync_areceber')}
                >
                  {isSyncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                  Contas a Receber
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">A sincronização automática ocorre a cada 10 minutos via cron. Inclui descoberta de clientes via contratos.</p>
            </div>
          )}
        </div>
      </div>

      {integration && <SyncHistory />}
    </div>
  );
};
