import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Search, X, AlertTriangle, CheckCircle, Clock, XCircle, RotateCcw, FileText, Server } from 'lucide-react';
import { APP_VERSION } from '@/config/version';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ChangelogEntry {
  id: string;
  organization_id: string;
  user_id: string | null;
  version: string | null;
  module: string;
  change_type: string;
  summary: string;
  details: string | null;
  files_changed: string[] | null;
  expected_impact: string | null;
  risk_level: string;
  status: string;
  environment: string;
  error_notes: string | null;
  result: string | null;
  is_rollback: boolean;
  rollback_of: string | null;
  created_at: string;
  updated_at: string;
}

const MODULES = ['clients', 'timeline', 'dashboard', 'calendar', 'reports', 'settings', 'integrations', 'auth', 'database', 'ui', 'api', 'other'];
const CHANGE_TYPES = ['feature', 'bugfix', 'refactor', 'ui', 'database', 'integration', 'rollback'];
const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['planned', 'applied', 'validated', 'failed', 'rolled_back'];
const ENVIRONMENTS = ['dev', 'staging', 'production'];

const riskBorderMap: Record<string, string> = {
  critical: 'border-l-4 border-l-destructive',
  high: 'border-l-4 border-l-orange-500',
  medium: 'border-l-4 border-l-yellow-500',
  low: '',
};

const statusBadgeMap: Record<string, { className: string; icon: React.ReactNode; label: string }> = {
  applied: { className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: <CheckCircle className="h-3 w-3" />, label: 'Aplicado' },
  validated: { className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: <CheckCircle className="h-3 w-3" />, label: 'Validado' },
  failed: { className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: <XCircle className="h-3 w-3" />, label: 'Falhou' },
  rolled_back: { className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', icon: <RotateCcw className="h-3 w-3" />, label: 'Rollback' },
  planned: { className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: <Clock className="h-3 w-3" />, label: 'Planejado' },
};

const riskBadgeMap: Record<string, { className: string; label: string }> = {
  critical: { className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Crítico' },
  high: { className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', label: 'Alto' },
  medium: { className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', label: 'Médio' },
  low: { className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Baixo' },
};

const typeLabels: Record<string, string> = {
  feature: 'Feature',
  bugfix: 'Bugfix',
  refactor: 'Refactor',
  ui: 'UI',
  database: 'Database',
  integration: 'Integration',
  rollback: 'Rollback',
};

const envLabels: Record<string, string> = {
  dev: 'Dev',
  staging: 'Staging',
  production: 'Production',
};

export function SystemChangelogSettings() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRisk, setFilterRisk] = useState('all');
  const { canManageSettings } = useUserRole();

  // Form state
  const [form, setForm] = useState({
    version: APP_VERSION,
    module: '',
    change_type: '',
    summary: '',
    details: '',
    files_changed_input: '',
    expected_impact: '',
    risk_level: 'low',
    status: 'applied',
    environment: 'production',
    error_notes: '',
    result: '',
  });
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (!profile?.organization_id) return;

      let query = (supabase as any).from('system_changelog')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

      if (filterModule !== 'all') query = query.eq('module', filterModule);
      if (filterType !== 'all') query = query.eq('change_type', filterType);
      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (filterRisk !== 'all') query = query.eq('risk_level', filterRisk);

      const { data, error } = await query;
      if (error) throw error;

      let filtered = (data || []) as ChangelogEntry[];
      if (search.trim()) {
        const term = search.toLowerCase();
        filtered = filtered.filter(e =>
          e.summary.toLowerCase().includes(term) ||
          (e.details || '').toLowerCase().includes(term) ||
          (e.version || '').toLowerCase().includes(term)
        );
      }
      setEntries(filtered);
    } catch (err) {
      console.error('Error loading changelog:', err);
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterType, filterStatus, filterRisk, search]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleSave = async () => {
    if (!form.module || !form.change_type || !form.summary.trim()) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (!profile?.organization_id) return;

      const filesArr = form.files_changed_input.trim()
        ? form.files_changed_input.split(',').map(f => f.trim()).filter(Boolean)
        : null;

      const { error } = await (supabase as any).from('system_changelog').insert({
        organization_id: profile.organization_id,
        user_id: user.id,
        version: form.version || null,
        module: form.module,
        change_type: form.change_type,
        summary: form.summary,
        details: form.details || null,
        files_changed: filesArr,
        expected_impact: form.expected_impact || null,
        risk_level: form.risk_level,
        status: form.status,
        environment: form.environment,
        error_notes: form.error_notes || null,
        result: form.result || null,
      });

      if (error) throw error;
      toast({ title: 'Atualização registrada com sucesso' });
      setDialogOpen(false);
      setForm({
        version: APP_VERSION, module: '', change_type: '', summary: '', details: '',
        files_changed_input: '', expected_impact: '', risk_level: 'low', status: 'applied',
        environment: 'production', error_notes: '', result: '',
      });
      loadEntries();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkRollback = async (entry: ChangelogEntry) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (!profile?.organization_id) return;

      await (supabase as any).from('system_changelog').insert({
        organization_id: profile.organization_id,
        user_id: user.id,
        version: entry.version,
        module: entry.module,
        change_type: 'rollback',
        summary: `Rollback: ${entry.summary}`,
        details: `Rollback da alteração original registrada em ${format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')}.`,
        risk_level: entry.risk_level,
        status: 'applied',
        environment: entry.environment,
        is_rollback: true,
        rollback_of: entry.id,
      });

      await (supabase as any).from('system_changelog')
        .update({ status: 'rolled_back' })
        .eq('id', entry.id);

      toast({ title: 'Rollback registrado' });
      loadEntries();
    } catch (err: any) {
      toast({ title: 'Erro ao registrar rollback', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Log de Atualizações</h3>
        {canManageSettings && (
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Registrar Atualização
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por resumo, detalhes ou versão..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos módulos</SelectItem>
            {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            {CHANGE_TYPES.map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{statusBadgeMap[s]?.label || s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Risco" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos riscos</SelectItem>
            {RISK_LEVELS.map(r => <SelectItem key={r} value={r}>{riskBadgeMap[r]?.label || r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : entries.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma atualização registrada.</CardContent></Card>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {entries.map(entry => {
            const risk = riskBadgeMap[entry.risk_level] || riskBadgeMap.low;
            const status = statusBadgeMap[entry.status] || statusBadgeMap.applied;
            const borderClass = riskBorderMap[entry.risk_level] || '';

            return (
              <AccordionItem key={entry.id} value={entry.id} className="border-none">
                <Card className={`${borderClass}`}>
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex flex-col items-start gap-1.5 text-left w-full mr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.version && (
                          <span className="text-xs font-mono text-muted-foreground">v{entry.version}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                        <Badge variant="outline" className="text-xs">{typeLabels[entry.change_type] || entry.change_type}</Badge>
                        <Badge variant="outline" className="text-xs">{entry.module}</Badge>
                        <Badge className={`text-xs gap-1 ${risk.className}`}>{risk.label}</Badge>
                        <Badge className={`text-xs gap-1 ${status.className}`}>
                          {status.icon} {status.label}
                        </Badge>
                        {entry.environment !== 'production' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Server className="h-3 w-3" /> {envLabels[entry.environment] || entry.environment}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{entry.summary}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CardContent className="pt-0 space-y-4">
                      {entry.details && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Detalhes técnicos</Label>
                          <p className="text-sm whitespace-pre-wrap mt-1">{entry.details}</p>
                        </div>
                      )}

                      {entry.files_changed && entry.files_changed.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Arquivos alterados</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entry.files_changed.map((f, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-mono gap-1">
                                <FileText className="h-3 w-3" /> {f}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.expected_impact && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Impacto esperado</Label>
                          <p className="text-sm mt-1">{entry.expected_impact}</p>
                        </div>
                      )}

                      {entry.result && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Resultado</Label>
                          <p className="text-sm mt-1">{entry.result}</p>
                        </div>
                      )}

                      {entry.error_notes && (
                        <div className="bg-destructive/10 p-3 rounded-md">
                          <Label className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Notas de erro
                          </Label>
                          <p className="text-sm mt-1">{entry.error_notes}</p>
                        </div>
                      )}

                      {canManageSettings && entry.status !== 'rolled_back' && !entry.is_rollback && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkRollback(entry)}
                          className="text-destructive"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" /> Marcar Rollback
                        </Button>
                      )}
                    </CardContent>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Register Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Atualização</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Versão</Label>
              <Input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Módulo *</Label>
              <Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={form.change_type} onValueChange={v => setForm(f => ({ ...f, change_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CHANGE_TYPES.map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nível de risco</Label>
              <Select value={form.risk_level} onValueChange={v => setForm(f => ({ ...f, risk_level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map(r => <SelectItem key={r} value={r}>{riskBadgeMap[r]?.label || r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{statusBadgeMap[s]?.label || s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select value={form.environment} onValueChange={v => setForm(f => ({ ...f, environment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map(e => <SelectItem key={e} value={e}>{envLabels[e]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Resumo *</Label>
              <Input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="Breve descrição da mudança" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Detalhes técnicos</Label>
              <Textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} rows={3} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Arquivos alterados <span className="text-muted-foreground text-xs">(separados por vírgula)</span></Label>
              <Input value={form.files_changed_input} onChange={e => setForm(f => ({ ...f, files_changed_input: e.target.value }))} placeholder="src/pages/Clients.tsx, src/components/ClientCard.tsx" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Impacto esperado</Label>
              <Textarea value={form.expected_impact} onChange={e => setForm(f => ({ ...f, expected_impact: e.target.value }))} rows={2} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Notas de erro</Label>
              <Textarea value={form.error_notes} onChange={e => setForm(f => ({ ...f, error_notes: e.target.value }))} rows={2} placeholder="Descreva erros encontrados após a atualização" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Resultado</Label>
              <Textarea value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} rows={2} placeholder="Pode ser preenchido depois" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
