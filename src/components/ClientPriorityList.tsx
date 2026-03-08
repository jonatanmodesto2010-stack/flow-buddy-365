import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, TrendingUp, AlertTriangle, Clock, DollarSign, ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ClientTimeline } from '@/lib/client-utils';

interface BoletoData {
  timeline_id: string;
  due_date: string;
  status: string;
  boleto_value: number;
}

interface EventData {
  line_id: string;
  status: string;
}

interface ScoredClient {
  timeline: ClientTimeline;
  score: number;
  factors: {
    overdueValue: number;
    overdueDays: number;
    overdueCount: number;
    totalPending: number;
    responseRate: number;
    isBlocked: boolean;
    totalEvents: number;
  };
  strategy?: string;
  aiLoading?: boolean;
}

interface ClientPriorityListProps {
  timelines: ClientTimeline[];
  boletos: BoletoData[];
}

export const ClientPriorityList = ({ timelines, boletos }: ClientPriorityListProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const scoredClients = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const boletosByTimeline = new Map<string, BoletoData[]>();
    for (const b of boletos) {
      if (!boletosByTimeline.has(b.timeline_id)) boletosByTimeline.set(b.timeline_id, []);
      boletosByTimeline.get(b.timeline_id)!.push(b);
    }

    const results: ScoredClient[] = [];

    for (const t of timelines) {
      if (t.status === 'completed' || t.status === 'archived') continue;

      const clientBoletos = boletosByTimeline.get(t.id) || [];
      const pending = clientBoletos.filter(b => b.status !== 'pago' && b.status !== 'cancelado');
      const overdue = pending.filter(b => {
        const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
        return today.getTime() > d.getTime();
      });

      const overdueValue = overdue.reduce((s, b) => s + (Number(b.boleto_value) || 0), 0);
      const totalPending = pending.reduce((s, b) => s + (Number(b.boleto_value) || 0), 0);

      let maxOverdueDays = 0;
      for (const b of overdue) {
        const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
        const days = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (days > maxOverdueDays) maxOverdueDays = days;
      }

      // Score calculation (0-100)
      let score = 0;

      // Overdue value weight (max 30 pts)
      score += Math.min(30, (overdueValue / 1000) * 5);

      // Overdue days weight (max 25 pts)
      score += Math.min(25, maxOverdueDays * 0.3);

      // Overdue count weight (max 15 pts)
      score += Math.min(15, overdue.length * 3);

      // Blocked status (15 pts)
      if (!t.is_active) score += 15;

      // Total pending value (max 15 pts)
      score += Math.min(15, (totalPending / 2000) * 5);

      score = Math.min(100, Math.round(score));

      if (score > 0) {
        results.push({
          timeline: t,
          score,
          factors: {
            overdueValue,
            overdueDays: maxOverdueDays,
            overdueCount: overdue.length,
            totalPending,
            responseRate: 0,
            isBlocked: !t.is_active,
            totalEvents: 0,
          },
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }, [timelines, boletos]);

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-500';
    if (score >= 40) return 'text-orange-500';
    if (score >= 20) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-red-500/10 border-red-500/30';
    if (score >= 40) return 'bg-orange-500/10 border-orange-500/30';
    if (score >= 20) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-green-500/10 border-green-500/30';
  };

  const getStrategyLabel = (score: number) => {
    if (score >= 70) return 'Ação Urgente';
    if (score >= 40) return 'Negociação';
    if (score >= 20) return 'Acompanhamento';
    return 'Monitorar';
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleAiAnalysis = async (timelineId: string) => {
    setLoadingAi(prev => ({ ...prev, [timelineId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('analyze-collection-strategy', {
        body: { timeline_id: timelineId },
      });
      if (error) throw error;
      if (data?.analysis?.recommended_actions) {
        const strategy = data.analysis.recommended_actions.join('\n• ');
        setStrategies(prev => ({ ...prev, [timelineId]: `• ${strategy}` }));
      } else if (data?.error) {
        toast({ title: 'Aviso', description: data.message || data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro na análise IA', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingAi(prev => ({ ...prev, [timelineId]: false }));
    }
  };

  if (scoredClients.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <Brain size={32} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-sm">Nenhum cliente com prioridade de cobrança no momento</p>
      </div>
    );
  }

  const top10 = scoredClients.slice(0, 10);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <Brain size={16} />
        Priorização Inteligente
      </h3>
      <p className="text-xs text-muted-foreground mb-4">Top {top10.length} clientes para cobrar agora (de {scoredClients.length} com pendências)</p>

      <div className="space-y-2">
        {top10.map((client, i) => (
          <motion.div
            key={client.timeline.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div
              className={`border rounded-lg p-3 cursor-pointer transition-colors hover:bg-muted/50 ${getScoreBg(client.score)}`}
              onClick={() => setExpandedId(expandedId === client.timeline.id ? null : client.timeline.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`text-lg font-bold w-8 text-center ${getScoreColor(client.score)}`}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{client.timeline.client_name}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {client.factors.overdueValue > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign size={10} /> {formatCurrency(client.factors.overdueValue)}
                        </span>
                      )}
                      {client.factors.overdueDays > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {client.factors.overdueDays}d atraso
                        </span>
                      )}
                      {client.factors.isBlocked && (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertTriangle size={10} /> Bloqueado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-xs font-semibold ${getScoreColor(client.score)}`}>
                      {getStrategyLabel(client.score)}
                    </div>
                    <div className={`text-lg font-bold ${getScoreColor(client.score)}`}>{client.score}</div>
                  </div>
                  {expandedId === client.timeline.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
            </div>

            <AnimatePresence>
              {expandedId === client.timeline.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border border-t-0 border-border rounded-b-lg p-4 bg-card space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Valor em Atraso</div>
                        <div className="text-sm font-semibold text-destructive">{formatCurrency(client.factors.overdueValue)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Boletos Vencidos</div>
                        <div className="text-sm font-semibold">{client.factors.overdueCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Dias de Atraso</div>
                        <div className="text-sm font-semibold">{client.factors.overdueDays}d</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Total Pendente</div>
                        <div className="text-sm font-semibold">{formatCurrency(client.factors.totalPending)}</div>
                      </div>
                    </div>

                    {strategies[client.timeline.id] ? (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                          <Sparkles size={12} /> Estratégia IA
                        </div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">
                          {strategies[client.timeline.id]}
                        </pre>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleAiAnalysis(client.timeline.id); }}
                        disabled={loadingAi[client.timeline.id]}
                        className="text-xs"
                      >
                        {loadingAi[client.timeline.id] ? (
                          <><Loader2 size={12} className="mr-1 animate-spin" /> Analisando...</>
                        ) : (
                          <><Sparkles size={12} className="mr-1" /> Sugerir Estratégia com IA</>
                        )}
                      </Button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
