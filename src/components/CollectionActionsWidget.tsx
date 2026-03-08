import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, AlertTriangle, ShieldAlert, Ban, Check, X, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';

interface CollectionAction {
  id: string;
  timeline_id: string;
  action_type: string;
  action_date: string;
  message: string;
  status: string;
  client_name?: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  reminder: { icon: Bell, color: 'text-blue-500', label: 'Lembrete' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', label: 'Aviso' },
  escalation: { icon: ShieldAlert, color: 'text-orange-500', label: 'Escalonamento' },
  block: { icon: Ban, color: 'text-destructive', label: 'Bloqueio' },
};

export const CollectionActionsWidget = () => {
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const { organizationId } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (organizationId) loadActions();
  }, [organizationId]);

  const loadActions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await (supabase as any)
        .from('collection_actions')
        .select('id, timeline_id, action_type, action_date, message, status')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .lte('action_date', today)
        .order('action_date', { ascending: true })
        .limit(50);
      if (error) throw error;

      if (data && data.length > 0) {
        const timelineIds = [...new Set(data.map((a: any) => a.timeline_id))];
        const { data: timelines } = await (supabase as any)
          .from('client_timelines')
          .select('id, client_name')
          .in('id', timelineIds);
        
        const nameMap = new Map((timelines || []).map((t: any) => [t.id, t.client_name]));
        setActions(data.map((a: any) => ({ ...a, client_name: nameMap.get(a.timeline_id) || 'Cliente' })));
      } else {
        setActions([]);
      }
    } catch (err) {
      console.error('Error loading actions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDone = async (actionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('collection_actions')
        .update({ status: 'done', completed_at: new Date().toISOString(), completed_by: user?.id })
        .eq('id', actionId);
      if (error) throw error;
      setActions(prev => prev.filter(a => a.id !== actionId));
      toast({ title: 'Ação concluída' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleSkip = async (actionId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('collection_actions')
        .update({ status: 'skipped' })
        .eq('id', actionId);
      if (error) throw error;
      setActions(prev => prev.filter(a => a.id !== actionId));
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const grouped = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const overdue = actions.filter(a => a.action_date < today);
    const todayActions = actions.filter(a => a.action_date === today);
    return { overdue, today: todayActions };
  }, [actions]);

  if (loading) {
    return <div className="h-32 bg-muted animate-pulse rounded-xl" />;
  }

  if (actions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 text-center">
        <Check size={24} className="mx-auto text-green-500 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma ação de cobrança pendente para hoje</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Ações de Cobrança</h3>
          <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full font-semibold">
            {actions.length}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-4">
              {grouped.overdue.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1">
                    <Clock size={12} /> Atrasadas ({grouped.overdue.length})
                  </p>
                  <div className="space-y-2">
                    {grouped.overdue.slice(0, 10).map(action => (
                      <ActionItem key={action.id} action={action} onDone={handleMarkDone} onSkip={handleSkip} />
                    ))}
                  </div>
                </div>
              )}
              {grouped.today.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">Hoje ({grouped.today.length})</p>
                  <div className="space-y-2">
                    {grouped.today.slice(0, 10).map(action => (
                      <ActionItem key={action.id} action={action} onDone={handleMarkDone} onSkip={handleSkip} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ActionItem = ({ action, onDone, onSkip }: { action: CollectionAction; onDone: (id: string) => void; onSkip: (id: string) => void }) => {
  const config = ACTION_CONFIG[action.action_type] || ACTION_CONFIG.reminder;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-muted/30">
      <div className={`shrink-0 ${config.color}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{action.client_name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.color} bg-muted`}>{config.label}</span>
        </div>
        {action.message && (
          <p className="text-xs text-muted-foreground truncate">{action.message}</p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDone(action.id)}>
          <Check size={14} className="text-green-500" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSkip(action.id)}>
          <X size={14} className="text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
};
