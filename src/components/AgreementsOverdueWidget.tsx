import { useState, useEffect } from 'react';
import { Handshake, AlertTriangle, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';

interface OverdueInstallment {
  id: string;
  value: number;
  due_date: string;
  installment_number: number;
  agreement_id: string;
  client_name?: string;
  agreed_value?: number;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export const AgreementsOverdueWidget = () => {
  const [overdueItems, setOverdueItems] = useState<OverdueInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const { organizationId } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (organizationId) loadOverdue();
  }, [organizationId]);

  const loadOverdue = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get active agreements for this org
      const { data: agreements, error: agError } = await (supabase as any)
        .from('client_agreements')
        .select('id, timeline_id, agreed_value')
        .eq('organization_id', organizationId)
        .eq('status', 'active');
      if (agError) throw agError;
      if (!agreements || agreements.length === 0) { setOverdueItems([]); setLoading(false); return; }

      const agIds = agreements.map((a: any) => a.id);
      const timelineIds = [...new Set(agreements.map((a: any) => a.timeline_id))];

      // Get overdue installments
      const { data: installments, error: instError } = await (supabase as any)
        .from('agreement_installments')
        .select('id, value, due_date, installment_number, agreement_id')
        .in('agreement_id', agIds)
        .eq('status', 'pending')
        .lt('due_date', today)
        .order('due_date', { ascending: true })
        .limit(20);
      if (instError) throw instError;

      if (!installments || installments.length === 0) { setOverdueItems([]); setLoading(false); return; }

      // Get client names
      const { data: timelines } = await (supabase as any)
        .from('client_timelines')
        .select('id, client_name')
        .in('id', timelineIds);

      const agMap = new Map(agreements.map((a: any) => [a.id, a as { id: string; timeline_id: string; agreed_value: number }]));
      const nameMap = new Map((timelines || []).map((t: any) => [t.id, t.client_name as string]));

      setOverdueItems(installments.map((inst: any) => {
        const ag = agMap.get(inst.agreement_id) as { id: string; timeline_id: string; agreed_value: number } | undefined;
        return {
          ...inst,
          client_name: ag ? nameMap.get(ag.timeline_id) || 'Cliente' : 'Cliente',
          agreed_value: ag?.agreed_value,
        };
      }));
    } catch (err) {
      console.error('Error loading overdue installments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('agreement_installments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setOverdueItems(prev => prev.filter(i => i.id !== id));
      toast({ title: 'Parcela marcada como paga' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="h-24 bg-muted animate-pulse rounded-xl" />;

  if (overdueItems.length === 0) return null;

  return (
    <div className="bg-card border border-destructive/30 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Handshake size={16} className="text-destructive" />
        <h3 className="text-sm font-semibold text-foreground">Parcelas de Acordos Atrasadas</h3>
        <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full font-semibold">
          {overdueItems.length}
        </span>
      </div>

      <div className="space-y-2">
        {overdueItems.map(item => (
          <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <AlertTriangle size={14} className="text-destructive shrink-0" />
              <div>
                <div className="text-sm font-medium text-foreground">{item.client_name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>Parcela #{item.installment_number}</span>
                  <span>•</span>
                  <span className="font-semibold">{formatCurrency(item.value)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={10} />
                    {new Date(item.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarkPaid(item.id)}>
              <Check size={14} className="text-green-500" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
