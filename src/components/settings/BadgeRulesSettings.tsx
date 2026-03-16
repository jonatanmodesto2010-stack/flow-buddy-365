import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Loader2, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { OverdueBadge, getDefaultRules, type StatusRule } from '@/components/OverdueBadge';

interface BadgeRule extends StatusRule {
  id?: string;
  organization_id?: string;
}

export const BadgeRulesSettings = () => {
  const [rules, setRules] = useState<BadgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { organizationId, canManageSettings } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (organizationId) loadRules();
  }, [organizationId]);

  const loadRules = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('collection_status_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setRules(data || []);
    } catch (err: any) {
      console.error('Error loading badge rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDefaultRules = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const defaults = getDefaultRules().map((r, i) => ({
        ...r,
        organization_id: organizationId,
        sort_order: i,
      }));
      const { error } = await (supabase as any).from('collection_status_rules').insert(defaults);
      if (error) throw error;
      toast({ title: 'Regras padrão criadas com sucesso!' });
      loadRules();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = () => {
    setRules(prev => [...prev, {
      min_days: 0,
      max_days: null,
      bg_color: '#ef4444',
      text_color: '#ffffff',
      label: 'ATRASO',
      sort_order: prev.length,
      is_active: true,
    }]);
  };

  const handleUpdateRule = (index: number, field: keyof BadgeRule, value: any) => {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleDeleteRule = async (index: number) => {
    const rule = rules[index];
    if (rule.id) {
      const { error } = await (supabase as any).from('collection_status_rules').delete().eq('id', rule.id);
      if (error) {
        toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
        return;
      }
    }
    setRules(prev => prev.filter((_, i) => i !== index));
    toast({ title: 'Regra removida' });
  };

  const validateRules = (): boolean => {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (r.max_days !== null && r.max_days < r.min_days) {
        toast({ title: 'Erro de validação', description: `Regra ${i + 1}: max_days deve ser >= min_days`, variant: 'destructive' });
        return false;
      }
      // Check overlaps
      for (let j = i + 1; j < rules.length; j++) {
        const other = rules[j];
        const rMax = r.max_days ?? Infinity;
        const oMax = other.max_days ?? Infinity;
        if (r.min_days <= oMax && other.min_days <= rMax) {
          toast({ title: 'Erro de validação', description: `Faixas ${i + 1} e ${j + 1} estão sobrepostas`, variant: 'destructive' });
          return false;
        }
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!organizationId || !validateRules()) return;
    setSaving(true);
    try {
      for (const [i, rule] of rules.entries()) {
        const payload = {
          min_days: rule.min_days,
          max_days: rule.max_days,
          bg_color: rule.bg_color,
          text_color: rule.text_color,
          label: rule.label,
          sort_order: i,
          is_active: rule.is_active,
          organization_id: organizationId,
        };
        if (rule.id) {
          const { error } = await (supabase as any).from('collection_status_rules').update(payload).eq('id', rule.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any).from('collection_status_rules').insert(payload);
          if (error) throw error;
        }
      }
      toast({ title: 'Regras visuais salvas com sucesso!' });
      loadRules();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">{[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Regra Visual do Badge de Atraso</h3>
          <p className="text-sm text-muted-foreground">Configure as faixas visuais do badge de atraso nos cards de clientes</p>
        </div>
        {canManageSettings && (
          <div className="flex gap-2">
            {rules.length === 0 && (
              <Button variant="outline" onClick={handleAddDefaultRules} disabled={saving}>
                Usar faixas padrão
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleAddRule}>
              <Plus size={14} className="mr-1" /> Adicionar faixa
            </Button>
          </div>
        )}
      </div>

      {/* Preview */}
      {rules.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Pré-visualização</p>
          <div className="flex items-center gap-3 flex-wrap">
            {rules
              .filter(r => r.is_active)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((rule, i) => {
                const sampleDays = rule.min_days + Math.floor(((rule.max_days ?? rule.min_days + 10) - rule.min_days) / 2);
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <OverdueBadge overdueDays={sampleDays} rules={[{ ...rule, min_days: -9999, max_days: null }]} />
                    <span className="text-[10px] text-muted-foreground">
                      {rule.min_days} a {rule.max_days ?? '∞'} dias
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div key={rule.id || index} className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded border shrink-0"
                style={{ backgroundColor: rule.bg_color }}
              />
              <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={rule.min_days}
                    onChange={e => handleUpdateRule(index, 'min_days', parseInt(e.target.value) || 0)}
                    className="w-20 text-sm"
                    placeholder="Min"
                    disabled={!canManageSettings}
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="number"
                    value={rule.max_days ?? ''}
                    onChange={e => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      handleUpdateRule(index, 'max_days', val);
                    }}
                    className="w-20 text-sm"
                    placeholder="∞"
                    disabled={!canManageSettings}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">dias</span>
                </div>
                <Input
                  value={rule.label}
                  onChange={e => handleUpdateRule(index, 'label', e.target.value)}
                  placeholder="Label"
                  className="text-sm"
                  disabled={!canManageSettings}
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Fundo:</label>
                  <input
                    type="color"
                    value={rule.bg_color}
                    onChange={e => handleUpdateRule(index, 'bg_color', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border"
                    disabled={!canManageSettings}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Texto:</label>
                  <input
                    type="color"
                    value={rule.text_color}
                    onChange={e => handleUpdateRule(index, 'text_color', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border"
                    disabled={!canManageSettings}
                  />
                </div>
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={v => handleUpdateRule(index, 'is_active', v)}
                  disabled={!canManageSettings}
                />
                {canManageSettings && (
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(index)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {canManageSettings && rules.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="mr-2 animate-spin" /> Salvando...</> : <><Save size={14} className="mr-2" /> Salvar regras</>}
          </Button>
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Palette size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma regra visual configurada</p>
          <p className="text-xs">As faixas padrão serão utilizadas automaticamente</p>
        </div>
      )}
    </div>
  );
};
