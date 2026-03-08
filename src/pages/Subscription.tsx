import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Package, Calendar, Receipt, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

interface Sub {
  id: string;
  status: string;
  monthly_price: number;
  discount_percent: number;
  current_period_end: string | null;
  trial_ends_at: string | null;
  payment_gateway: string;
  plans?: { name: string; description: string; features: any; max_users: number; max_clients: number };
}

interface Invoice {
  id: string;
  amount: number;
  final_amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  reference_month: string | null;
}

const statusColors: Record<string, string> = {
  trial: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  active: 'bg-green-500/10 text-green-600 border-green-500/30',
  overdue: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  defaulting: 'bg-red-500/10 text-red-600 border-red-500/30',
  canceled: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
  suspended: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
};

const statusLabels: Record<string, string> = {
  trial: 'Período de Teste', active: 'Ativa', overdue: 'Vencida',
  defaulting: 'Inadimplente', canceled: 'Cancelada', suspended: 'Suspensa',
};

const invoiceStatusLabels: Record<string, string> = {
  pending: 'Pendente', paid: 'Paga', overdue: 'Vencida', canceled: 'Cancelada',
};

const Subscription = () => {
  const [subscription, setSubscription] = useState<Sub | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { organizationId } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (!organizationId) return;
    const fetchData = async () => {
      const [subRes, invRes] = await Promise.all([
        supabase.from('organization_subscriptions')
          .select('*, plans(name, description, features, max_users, max_clients)')
          .eq('organization_id', organizationId)
          .single(),
        supabase.from('invoices')
          .select('*')
          .eq('organization_id', organizationId)
          .order('due_date', { ascending: false })
          .limit(20),
      ]);
      if (subRes.data) setSubscription(subRes.data as unknown as Sub);
      setInvoices((invRes.data || []) as unknown as Invoice[]);
      setLoading(false);
    };
    fetchData();
  }, [organizationId]);

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div></AppLayout>;

  if (!subscription) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold mb-2">Nenhuma assinatura encontrada</h2>
            <p className="text-muted-foreground">Entre em contato com o administrador para ativar seu plano.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const plan = subscription.plans;
  const features = (plan?.features || []) as string[];
  const daysUntilExpiry = subscription.current_period_end
    ? Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Minha Assinatura</h1>

        {/* Subscription Status Banner */}
        {(subscription.status === 'overdue' || subscription.status === 'defaulting') && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="font-semibold text-red-600">
                  {subscription.status === 'defaulting' ? 'Assinatura inadimplente' : 'Assinatura vencida'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Regularize seu pagamento para continuar utilizando todos os recursos.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plan Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle>{plan?.name || 'Plano'}</CardTitle>
                    {plan?.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                  </div>
                </div>
                <Badge variant="outline" className={statusColors[subscription.status]}>
                  {statusLabels[subscription.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Valor Mensal</p>
                  <p className="text-xl font-bold">
                    R$ {Number(subscription.monthly_price).toFixed(2).replace('.', ',')}
                  </p>
                  {subscription.discount_percent > 0 && (
                    <Badge variant="secondary" className="text-xs">-{subscription.discount_percent}% desc.</Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Próximo Vencimento</p>
                  <p className="text-lg font-semibold">
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
                      : '–'}
                  </p>
                  {daysUntilExpiry !== null && daysUntilExpiry <= 5 && daysUntilExpiry > 0 && (
                    <p className="text-xs text-yellow-600">Vence em {daysUntilExpiry} dia(s)</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Usuários</p>
                  <p className="text-lg font-semibold">{plan?.max_users || '–'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Clientes</p>
                  <p className="text-lg font-semibold">{plan?.max_clients || '–'}</p>
                </div>
              </div>

              {features.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-semibold mb-2">Recursos incluídos</p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Payment Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-5 w-5" /> Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Gateway</p>
                <p className="text-sm font-medium capitalize">{subscription.payment_gateway}</p>
              </div>
              {subscription.status === 'trial' && subscription.trial_ends_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Trial termina em</p>
                  <p className="text-sm font-medium">
                    {new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
              <Separator />
              <Button className="w-full" disabled>
                <CreditCard className="w-4 h-4 mr-2" />
                Pagar Mensalidade
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Em breve disponível via Asaas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Invoices History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Histórico de Faturas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.reference_month || '–'}</TableCell>
                    <TableCell>R$ {Number(inv.final_amount).toFixed(2).replace('.', ',')}</TableCell>
                    <TableCell>{new Date(inv.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        inv.status === 'paid' ? 'bg-green-500/10 text-green-600 border-green-500/30' :
                        inv.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' :
                        'bg-red-500/10 text-red-600 border-red-500/30'
                      }>
                        {invoiceStatusLabels[inv.status] || inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('pt-BR') : '–'}
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhuma fatura encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Subscription;
