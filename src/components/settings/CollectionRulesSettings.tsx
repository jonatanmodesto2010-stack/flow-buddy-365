import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Bell, AlertTriangle, ShieldAlert, Ban, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';

interface CollectionRule {
  id?: string;
  name: string;
  trigger_days: number;
  action_type: string;
  message_template: string;
  is_active: boolean;
  sort_order: number;
}

const ACTION_TYPES = [
  { value: 'reminder', label: 'Lembrete', icon: Bell, color: 'text-blue-500' },
  { value: 'warning', label: 'Aviso', icon: AlertTriangle, color: 'text-yellow-500' },
  { value: 'escalation', label: 'Escalonamento', icon: ShieldAlert, color: 'text-orange-500' },
  { value: 'block', label: 'Bloqueio', icon: Ban, color: 'text-destructive' },
];

const DEFAULT_RULES: Omit<CollectionRule, 'id'>[] = [
  { name: 'Lembrete pré-vencimento', trigger_days: -3, action_type: 'reminder', message_template: 'Olá! Seu boleto vence em {dias} dias. Valor: {valor}', is_active: true, sort_order: 0 },
  { name: 'Dia do vencimento', trigger_days: 0, action_type: 'reminder', message_template: 'Olá! Seu boleto vence hoje. Valor: {valor}', is_active: true, sort_order: 1 },
  { name: '1ª cobrança', trigger_days: 3, action_type: 'warning', message_template: 'Identificamos que seu boleto está vencido há {dias} dias. Valor: {valor}', is_active: true, sort_order: 2 },
  { name: '2ª cobrança', trigger_days: 7, action_type: 'warning', message_template: 'Seu boleto continua pendente. Entre em contato para negociação.', is_active: true, sort_order: 3 },
  { name: 'Escalonamento', trigger_days: 15, action_type: 'escalation', message_template: 'Último aviso antes de medidas administrativas.', is_active: true, sort_order: 4 },
  { name: 'Bloqueio', trigger_days: 30, action_type: 'block', message_template: 'Serviço bloqueado por inadimplência.', is_active: true, sort_order: 5 },
];

export const CollectionRulesSettings = () => {
  const [rules, setRules] = useState<CollectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { organizationId } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (organizationId) loadRules();
  }, [organizationId]);

  const loadRules = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('collection_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setRules(data || []);
    } catch (err: any) {
      console.error('Error loading rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDefaultRules = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const toInsert = DEFAULT_RULES.map(r => ({ ...r, organization_id: organizationId }));
      const { error } = await (supabase as any).from('collection_rules').insert(toInsert);
      if (error) throw error;
      toast({ title: 'Régua padrão criada com sucesso!' });
      loadRules();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = () => {
    setRules(prev => [...prev, {
      name: 'Nova regra',
      trigger_days: 0,
      action_type: 'reminder',
      message_template: '',
      is_active: true,
      sort_order: prev.length,
    }]);
  };

  const handleUpdateRule = (index: number, field: keyof CollectionRule, value: any) => {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleDeleteRule = async (index: number) => {
    const rule = rules[index];
    if (rule.id) {
      const { error } = await (supabase as any).from('collection_rules').delete().eq('id', rule.id);
      if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    }
    setRules(prev => prev.filter((_, i) => i !== index));
    toast({ title: 'Regra removida' });
  };

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      for (const [i, rule] of rules.entries()) {
        const payload = {
          name: rule.name,
          trigger_days: rule.trigger_days,
          action_type: rule.action_type,
          message_template: rule.message_template,
          is_active: rule.is_active,
          sort_order: i,
          organization_id: organizationId,
        };
        if (rule.id) {
          const { error } = await (supabase as any).from('collection_rules').update(payload).eq('id', rule.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any).from('collection_rules').insert(payload);
          if (error) throw error;
        }
      }
      toast({ title: 'Régua de cobrança salva com sucesso!' });
      loadRules();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const getTriggerLabel = (days: number) => {
    if (days < 0) return `${Math.abs(days)} dias antes`;
    if (days === 0) return 'No vencimento';
    return `${days} dias depois`;
  };

  const getActionInfo = (type: string) => ACTION_TYPES.find(a => a.value === type) || ACTION_TYPES[0];

  if (loading) {
    return <div className="animate-pulse space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Régua de Cobrança</h3>
          <p className="text-sm text-muted-foreground">Configure ações automáticas antes e depois do vencimento dos boletos</p>
        </div>
        <div className="flex gap-2">
          {rules.length === 0 && (
            <Button variant="outline" onClick={handleAddDefaultRules} disabled={saving}>
              Usar régua padrão
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleAddRule}>
            <Plus size={14} className="mr-1" /> Adicionar regra
          </Button>
        </div>
      </div>

      {/* Timeline visualization */}
      {rules.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Visualização da régua</p>
          <div className="relative flex items-center justify-center">
            <div className="absolute left-0 right-0 h-0.5 bg-border" />
            <div className="relative flex items-end gap-1 w-full justify-between px-4">
              {rules
                .filter(r => r.is_active)
                .sort((a, b) => a.trigger_days - b.trigger_days)
                .map((rule, i) => {
                  const info = getActionInfo(rule.action_type);
                  const Icon = info.icon;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 relative">
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">{getTriggerLabel(rule.trigger_days)}</div>
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center bg-card ${info.color}`}>
                        <Icon size={14} />
                      </div>
                      <div className="text-[10px] font-medium text-foreground text-center max-w-[80px] truncate">{rule.name}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-3">
        {rules.map((rule, index) => {
          const info = getActionInfo(rule.action_type);
          const Icon = info.icon;
          return (
            <div key={rule.id || index} className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-start gap-3">
                <GripVertical size={16} className="text-muted-foreground mt-2 cursor-grab" />
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-1 ${info.color}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      value={rule.name}
                      onChange={e => handleUpdateRule(index, 'name', e.target.value)}
                      placeholder="Nome da regra"
                      className="text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={rule.trigger_days}
                        onChange={e => handleUpdateRule(index, 'trigger_days', parseInt(e.target.value) || 0)}
                        className="w-20 text-sm"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {getTriggerLabel(rule.trigger_days)}
                      </span>
                    </div>
                    <Select
                      value={rule.action_type}
                      onValueChange={v => handleUpdateRule(index, 'action_type', v)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map(a => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={rule.message_template}
                    onChange={e => handleUpdateRule(index, 'message_template', e.target.value)}
                    placeholder="Template da mensagem (use {dias}, {valor}, {cliente})"
                    className="text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={v => handleUpdateRule(index, 'is_active', v)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(index)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {rules.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="mr-2 animate-spin" /> Salvando...</> : <><Save size={14} className="mr-2" /> Salvar régua</>}
          </Button>
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Bell size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma regra configurada</p>
          <p className="text-xs">Clique em "Usar régua padrão" para começar rapidamente</p>
        </div>
      )}
    </div>
  );
};
