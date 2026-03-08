import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, Users, Trophy, Target, Clock, CheckCircle, XCircle, TrendingUp, Calendar } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface OperatorStats {
  userId: string;
  name: string;
  totalEvents: number;
  resolvedEvents: number;
  noResponseEvents: number;
  createdEvents: number;
  resolutionRate: number;
  clientsHandled: number;
  avgEventsPerDay: number;
}

const Reports = () => {
  
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState<OperatorStats[]>([]);
  const [period, setPeriod] = useState('30');
  const { organizationId } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate('/auth');
    });
  }, [navigate]);

  useEffect(() => {
    if (organizationId) loadData();
  }, [organizationId, period]);

  const loadData = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // Get org users
      const { data: users, error: usersError } = await supabase.rpc('get_organization_users', { _org_id: organizationId });
      if (usersError) throw usersError;

      // Get timelines for this org
      const { data: timelines, error: tlError } = await (supabase as any)
        .from('client_timelines')
        .select('id, user_id, updated_at')
        .eq('organization_id', organizationId);
      if (tlError) throw tlError;

      const timelineIds = (timelines || []).map((t: any) => t.id);
      if (timelineIds.length === 0) { setOperators([]); setLoading(false); return; }

      // Get timeline lines
      const { data: lines, error: linesError } = await (supabase as any)
        .from('timeline_lines')
        .select('id, timeline_id')
        .in('timeline_id', timelineIds.slice(0, 200));
      if (linesError) throw linesError;

      const lineIds = (lines || []).map((l: any) => l.id);
      if (lineIds.length === 0) { setOperators([]); setLoading(false); return; }

      // Calculate date filter
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - parseInt(period));
      const sinceDateStr = sinceDate.toISOString();

      // Get events within period
      const { data: events, error: evError } = await (supabase as any)
        .from('timeline_events')
        .select('id, line_id, status, created_at')
        .in('line_id', lineIds.slice(0, 200))
        .gte('created_at', sinceDateStr);
      if (evError) throw evError;

      // Map line_id -> timeline_id
      const lineToTimeline = new Map<string, string>((lines || []).map((l: any) => [l.id as string, l.timeline_id as string]));
      // Map timeline_id -> user_id (last updater)
      const timelineToUser = new Map<string, string>((timelines || []).map((t: any) => [t.id as string, t.user_id as string]));

      // Build per-user stats
      const userMap = new Map<string, OperatorStats>();
      for (const u of (users || [])) {
        userMap.set(u.user_id, {
          userId: u.user_id,
          name: u.full_name || u.email || 'Sem nome',
          totalEvents: 0,
          resolvedEvents: 0,
          noResponseEvents: 0,
          createdEvents: 0,
          resolutionRate: 0,
          clientsHandled: 0,
          avgEventsPerDay: 0,
        });
      }

      // Count events per operator (based on timeline owner)
      const clientsByUser = new Map<string, Set<string>>();
      for (const ev of (events || [])) {
        const timelineId = lineToTimeline.get(ev.line_id);
        if (!timelineId) continue;
        const userId = timelineToUser.get(timelineId);
        if (!userId || !userMap.has(userId)) continue;

        const stats = userMap.get(userId)!;
        stats.totalEvents++;
        if (ev.status === 'resolved') stats.resolvedEvents++;
        else if (ev.status === 'no-response') stats.noResponseEvents++;
        else stats.createdEvents++;

        if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
        clientsByUser.get(userId)!.add(timelineId);
      }

      const days = parseInt(period);
      for (const [userId, stats] of userMap) {
        stats.clientsHandled = clientsByUser.get(userId)?.size || 0;
        stats.resolutionRate = stats.totalEvents > 0
          ? Math.round((stats.resolvedEvents / stats.totalEvents) * 100)
          : 0;
        stats.avgEventsPerDay = days > 0
          ? Math.round((stats.totalEvents / days) * 10) / 10
          : 0;
      }

      const sorted = Array.from(userMap.values())
        .sort((a, b) => b.totalEvents - a.totalEvents);
      setOperators(sorted);
    } catch (err) {
      console.error('Reports load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    return operators.reduce((acc, op) => ({
      events: acc.events + op.totalEvents,
      resolved: acc.resolved + op.resolvedEvents,
      noResponse: acc.noResponse + op.noResponseEvents,
      clients: acc.clients + op.clientsHandled,
    }), { events: 0, resolved: 0, noResponse: 0, clients: 0 });
  }, [operators]);

  const globalResolutionRate = totals.events > 0
    ? Math.round((totals.resolved / totals.events) * 100) : 0;

  const chartData = operators
    .filter(op => op.totalEvents > 0)
    .map(op => ({
      name: op.name.split(' ')[0],
      total: op.totalEvents,
      resolved: op.resolvedEvents,
      noResponse: op.noResponseEvents,
    }));

  const rankingData = [...operators]
    .filter(op => op.totalEvents > 0)
    .sort((a, b) => b.resolutionRate - a.resolutionRate || b.totalEvents - a.totalEvents);

  const kpiCards = [
    { label: 'Total Contatos', value: totals.events, icon: Target, color: 'text-primary' },
    { label: 'Resolvidos', value: totals.resolved, icon: CheckCircle, color: 'text-green-500' },
    { label: 'Sem Resposta', value: totals.noResponse, icon: XCircle, color: 'text-destructive' },
    { label: 'Taxa Resolução', value: `${globalResolutionRate}%`, icon: TrendingUp, color: globalResolutionRate >= 50 ? 'text-green-500' : 'text-destructive' },
    { label: 'Operadores Ativos', value: operators.filter(o => o.totalEvents > 0).length, icon: Users, color: 'text-foreground' },
    { label: 'Clientes Atendidos', value: totals.clients, icon: Users, color: 'text-foreground' },
  ];

  return (
    <AppLayout>
      <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  <BarChart3 size={24} /> Relatórios de Produtividade
                </h2>
                <p className="text-muted-foreground">Métricas de desempenho dos operadores</p>
              </motion.div>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="15">Últimos 15 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="60">Últimos 60 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
                </div>
                <div className="h-80 bg-muted animate-pulse rounded-xl" />
              </div>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {kpiCards.map((card, i) => (
                    <motion.div
                      key={card.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-card border border-border rounded-xl p-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <card.icon size={14} className="text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{card.label}</span>
                      </div>
                      <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                    </motion.div>
                  ))}
                </div>

                {/* Chart */}
                {chartData.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-xl p-5"
                  >
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <BarChart3 size={16} /> Contatos por Operador
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData} barSize={30}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="resolved" name="Resolvidos" fill="hsl(134 61% 41%)" radius={[4, 4, 0, 0]} stackId="a" />
                        <Bar dataKey="noResponse" name="Sem Resposta" fill="hsl(0 72% 50%)" radius={[4, 4, 0, 0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>
                )}

                {/* Ranking */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-card border border-border rounded-xl p-5"
                >
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Trophy size={16} /> Ranking de Operadores
                  </h3>
                  {rankingData.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhum dado de produtividade no período selecionado
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rankingData.map((op, i) => (
                        <div key={op.userId} className="flex items-center gap-4 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            i === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                            i === 1 ? 'bg-gray-400/20 text-gray-400' :
                            i === 2 ? 'bg-orange-600/20 text-orange-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{op.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {op.clientsHandled} clientes • {op.avgEventsPerDay} contatos/dia
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-center">
                            <div>
                              <div className="text-xs text-muted-foreground">Total</div>
                              <div className="text-sm font-bold text-foreground">{op.totalEvents}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Resolvidos</div>
                              <div className="text-sm font-bold text-green-500">{op.resolvedEvents}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Sem Resp.</div>
                              <div className="text-sm font-bold text-destructive">{op.noResponseEvents}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Taxa</div>
                              <div className={`text-sm font-bold ${op.resolutionRate >= 50 ? 'text-green-500' : 'text-destructive'}`}>
                                {op.resolutionRate}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </div>
      </div>
    </AppLayout>
  );
};

export default Reports;
