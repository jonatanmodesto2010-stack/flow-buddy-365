import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, CheckCircle, AlertTriangle, Clock, DollarSign, TrendingUp, TrendingDown, BarChart3, PieChart, Building2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { fetchAllPaginated, fetchInChunks } from '@/lib/supabase-helpers';
import { groupTimelinesByClient, type ClientTimeline } from '@/lib/client-utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RechartsPie, Pie } from 'recharts';
import { ClientPriorityList } from '@/components/ClientPriorityList';
import { CollectionActionsWidget } from '@/components/CollectionActionsWidget';
import { AgreementsOverdueWidget } from '@/components/AgreementsOverdueWidget';
import { EquipmentRetrievalWidget } from '@/components/EquipmentRetrievalWidget';
import { DelinquentsExport } from '@/components/DelinquentsExport';
import { DashboardDateFilter, type DateRange } from '@/components/DashboardDateFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BoletoData {
  timeline_id: string;
  due_date: string;
  status: string;
  boleto_value: number;
  boleto_value_open: number | null;
}

const Dashboard = () => {
  
  const [allTimelines, setAllTimelines] = useState<ClientTimeline[]>([]);
  const [boletos, setBoletos] = useState<BoletoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null, label: 'Todo período' });
  const [filialFilter, setFilialFilter] = useState<string>('all');
  const { organizationId } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate('/auth');
    });
  }, [navigate]);

  useEffect(() => {
    if (organizationId) loadData();
  }, [organizationId]);

  const loadData = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const data = await fetchAllPaginated('client_timelines', {
        select: '*',
        eq: [['organization_id', organizationId]],
      });
      setAllTimelines(data || []);

      const timelineIds = (data || []).map((t: any) => t.id);
      if (timelineIds.length > 0) {
        const boletosData = await fetchInChunks('client_boletos', 'timeline_id', timelineIds, 'timeline_id, due_date, status, boleto_value, boleto_value_open');
        setBoletos(boletosData || []);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getOpenValue = (b: BoletoData) => Number(b.boleto_value_open ?? b.boleto_value) || 0;

  // Extract unique filiais
  const filiais = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allTimelines) {
      if (t.ixc_filial_id && t.ixc_filial_name) {
        map.set(t.ixc_filial_id, t.ixc_filial_name);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allTimelines]);

  // Filter timelines by filial
  const filteredTimelines = useMemo(() => {
    if (filialFilter === 'all') return allTimelines;
    return allTimelines.filter(t => t.ixc_filial_id === filialFilter);
  }, [allTimelines, filialFilter]);

  // Filter boletos by filial-filtered timelines
  const filialTimelineIds = useMemo(() => {
    return new Set(filteredTimelines.map(t => t.id));
  }, [filteredTimelines]);

  const filteredBoletos = useMemo(() => {
    let filtered = boletos;
    if (filialFilter !== 'all') {
      filtered = filtered.filter(b => filialTimelineIds.has(b.timeline_id));
    }
    if (!dateRange.from || !dateRange.to) return filtered;
    return filtered.filter(b => {
      const d = new Date(b.due_date + 'T00:00:00');
      return d >= dateRange.from! && d <= dateRange.to!;
    });
  }, [boletos, dateRange, filialFilter, filialTimelineIds]);

  const stats = useMemo(() => {
    const grouped = groupTimelinesByClient(filteredTimelines);
    const total = grouped.length;
    const active = grouped.filter(c => c.is_active && c.status === 'active').length;
    const blocked = grouped.filter(c => !c.is_active && c.status !== 'archived' && c.status !== 'completed').length;
    const completed = grouped.filter(c => c.status === 'completed').length;
    const archived = grouped.filter(c => c.status === 'archived').length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Boleto calculations
    const pendingBoletos = filteredBoletos.filter(b => b.status !== 'pago' && b.status !== 'cancelado' && getOpenValue(b) > 0);
    const overdueBoletos = pendingBoletos.filter(b => {
      const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
      return today.getTime() > d.getTime();
    });
    const upcomingBoletos = pendingBoletos.filter(b => {
      const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
      return today.getTime() <= d.getTime();
    });

    const totalOverdueValue = overdueBoletos.reduce((s, b) => s + getOpenValue(b), 0);
    const totalUpcomingValue = upcomingBoletos.reduce((s, b) => s + getOpenValue(b), 0);
    const totalReceivable = totalOverdueValue + totalUpcomingValue;
    const paidBoletos = filteredBoletos.filter(b => b.status === 'pago');
    const totalPaidValue = paidBoletos.reduce((s, b) => s + (Number(b.boleto_value) || 0), 0);

    // Delinquency rate
    const timelinesWithOverdue = new Set(overdueBoletos.map(b => b.timeline_id));
    const delinquencyRate = active > 0 ? Math.round((timelinesWithOverdue.size / active) * 100) : 0;

    // Aging buckets
    const aging = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const agingCount = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const b of overdueBoletos) {
      const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
      const days = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      const val = getOpenValue(b);
      if (days <= 30) { aging['1-30'] += val; agingCount['1-30']++; }
      else if (days <= 60) { aging['31-60'] += val; agingCount['31-60']++; }
      else if (days <= 90) { aging['61-90'] += val; agingCount['61-90']++; }
      else { aging['90+'] += val; agingCount['90+']++; }
    }

    // Average overdue days
    let totalOverdueDays = 0;
    for (const b of overdueBoletos) {
      const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
      totalOverdueDays += Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    }
    const avgOverdueDays = overdueBoletos.length > 0 ? Math.round(totalOverdueDays / overdueBoletos.length) : 0;

    // Block rate
    const blockRate = total > 0 ? Math.round((blocked / total) * 100) : 0;

    return {
      total, active, blocked, completed, archived,
      totalOverdueValue, totalUpcomingValue, totalReceivable, totalPaidValue,
      overdueBoletoCount: overdueBoletos.length,
      upcomingBoletoCount: upcomingBoletos.length,
      delinquencyRate, avgOverdueDays, blockRate,
      aging, agingCount,
    };
  }, [filteredTimelines, filteredBoletos]);

  const agingChartData = [
    { name: '1-30d', value: stats.aging['1-30'], count: stats.agingCount['1-30'], fill: 'hsl(48 96% 53%)' },
    { name: '31-60d', value: stats.aging['31-60'], count: stats.agingCount['31-60'], fill: 'hsl(25 95% 53%)' },
    { name: '61-90d', value: stats.aging['61-90'], count: stats.agingCount['61-90'], fill: 'hsl(0 72% 50%)' },
    { name: '90d+', value: stats.aging['90+'], count: stats.agingCount['90+'], fill: 'hsl(0 72% 35%)' },
  ];

  const statusPieData = [
    { name: 'Ativos', value: stats.active, fill: 'hsl(134 61% 41%)' },
    { name: 'Bloqueados', value: stats.blocked, fill: 'hsl(0 72% 50%)' },
    { name: 'Inativos', value: stats.archived, fill: 'hsl(240 5% 50%)' },
    { name: 'Finalizados', value: stats.completed, fill: 'hsl(200 80% 50%)' },
  ].filter(d => d.value > 0);

  const kpiCards = [
    { label: 'Total a Receber', value: formatCurrency(stats.totalReceivable), sub: `${stats.overdueBoletoCount + stats.upcomingBoletoCount} boletos pendentes`, icon: DollarSign, color: 'text-primary' },
    { label: 'Valor em Atraso', value: formatCurrency(stats.totalOverdueValue), sub: `${stats.overdueBoletoCount} boletos vencidos`, icon: TrendingDown, color: 'text-destructive' },
    { label: 'A Vencer', value: formatCurrency(stats.totalUpcomingValue), sub: `${stats.upcomingBoletoCount} boletos`, icon: Clock, color: 'text-foreground' },
    { label: 'Recebido', value: formatCurrency(stats.totalPaidValue), sub: `boletos pagos`, icon: TrendingUp, color: 'hsl(134,61%,41%)' },
    { label: 'Taxa Inadimplência', value: `${stats.delinquencyRate}%`, sub: 'clientes com boletos vencidos', icon: AlertTriangle, color: stats.delinquencyRate > 30 ? 'text-destructive' : 'text-foreground' },
    { label: 'Média Dias Atraso', value: `${stats.avgOverdueDays}d`, sub: 'tempo médio de atraso', icon: BarChart3, color: 'text-foreground' },
  ];

  const summaryCards = [
    { label: 'Total Clientes', value: stats.total, icon: Users, color: 'text-foreground' },
    { label: 'Ativos', value: stats.active, icon: CheckCircle, color: 'text-green-500' },
    { label: 'Bloqueados', value: stats.blocked, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Taxa Bloqueio', value: `${stats.blockRate}%`, icon: TrendingDown, color: 'text-foreground' },
  ];

  return (
    <AppLayout>
      <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-2xl font-bold text-foreground">Dashboard de Cobrança</h2>
                <p className="text-muted-foreground">Visão geral financeira e métricas de cobrança</p>
              </motion.div>
              {!loading && (
                <div className="flex items-center gap-2">
                  {filiais.length > 0 && (
                    <Select value={filialFilter} onValueChange={setFilialFilter}>
                      <SelectTrigger className="w-48">
                        <Building2 size={14} className="mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Todas filiais" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas filiais</SelectItem>
                        {filiais.map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <DashboardDateFilter value={dateRange} onChange={setDateRange} />
                  <DelinquentsExport timelines={filteredTimelines} boletos={filteredBoletos} />
                </div>
              )}
            </div>

            {loading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="h-80 bg-muted animate-pulse rounded-xl" />
                  <div className="h-80 bg-muted animate-pulse rounded-xl" />
                </div>
              </div>
            ) : (
              <>
                {/* KPI Cards - Financial */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {kpiCards.map((card, i) => (
                    <motion.div
                      key={card.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-card border border-border rounded-xl p-5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{card.label}</span>
                        <card.icon size={18} className="text-muted-foreground" />
                      </div>
                      <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                      <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Aging Chart */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-xl p-5"
                  >
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <BarChart3 size={16} />
                      Aging de Inadimplência
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">Valor em atraso por faixa de dias</p>
                    {agingChartData.some(d => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={agingChartData} barSize={40}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis 
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                          />
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
                              'Valor'
                            ]}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                          />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {agingChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                        Nenhum boleto em atraso 🎉
                      </div>
                    )}
                    {/* Aging legend */}
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {agingChartData.map(d => (
                        <div key={d.name} className="text-center">
                          <div className="text-xs text-muted-foreground">{d.name}</div>
                          <div className="text-xs font-semibold text-foreground">{d.count} boletos</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Status Pie Chart */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="bg-card border border-border rounded-xl p-5"
                  >
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <PieChart size={16} />
                      Distribuição de Clientes
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">Segmentação por status</p>
                    {statusPieData.length > 0 ? (
                      <div className="flex items-center gap-4">
                        <ResponsiveContainer width="60%" height={220}>
                          <RechartsPie>
                            <Pie
                              data={statusPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={85}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {statusPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number) => [value, 'Clientes']}
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                fontSize: '12px'
                              }}
                            />
                          </RechartsPie>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-3">
                          {statusPieData.map(d => (
                            <div key={d.name} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                              <span className="text-xs text-muted-foreground">{d.name}</span>
                              <span className="text-xs font-semibold text-foreground ml-auto">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                        Nenhum cliente cadastrado
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {summaryCards.map((card, i) => (
                    <motion.div
                      key={card.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.05 }}
                      className="bg-card border border-border rounded-xl p-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <card.icon size={14} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{card.label}</span>
                      </div>
                      <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                    </motion.div>
                  ))}
                </div>

                <CollectionActionsWidget />
                <AgreementsOverdueWidget />
                <ClientPriorityList timelines={filteredTimelines} boletos={filteredBoletos} />
              </>
            )}
          </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
