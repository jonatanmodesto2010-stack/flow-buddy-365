import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CreditCard, Eye, Plus, DollarSign, AlertTriangle, CheckCircle, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  monthly_price: number;
  discount_percent: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  payment_gateway: string;
  notes: string | null;
  created_at: string;
  organizations?: { name: string };
  plans?: { name: string };
}

interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  max_users: number;
  max_clients: number;
}

interface Org {
  id: string;
  name: string;
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
  trial: 'Trial', active: 'Ativa', overdue: 'Vencida',
  defaulting: 'Inadimplente', canceled: 'Cancelada', suspended: 'Suspensa',
};

const AdminSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgsWithSub, setOrgsWithSub] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [formData, setFormData] = useState({
    organization_id: '', plan_id: '', status: 'trial', monthly_price: '0',
    discount_percent: '0', payment_gateway: 'manual', notes: '',
    trial_days: '7',
  });
  const [paymentData, setPaymentData] = useState({
    amount: '', payment_method: 'pix', notes: '',
  });
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchData = async () => {
    const [subsRes, plansRes, orgsRes] = await Promise.all([
      supabase.from('organization_subscriptions').select('*, organizations(name), plans(name)').order('created_at', { ascending: false }),
      supabase.from('plans').select('id, name, monthly_price, max_users, max_clients').eq('is_active', true).order('sort_order'),
      supabase.from('organizations').select('id, name').order('name'),
    ]);
    
    const subs = (subsRes.data || []) as unknown as Subscription[];
    setSubscriptions(subs);
    setPlans((plansRes.data || []) as unknown as Plan[]);
    setOrgs((orgsRes.data || []) as unknown as Org[]);
    setOrgsWithSub(new Set(subs.map(s => s.organization_id)));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setSelectedSub(null);
    const defaultPlan = plans[0];
    setFormData({
      organization_id: '', plan_id: defaultPlan?.id || '', status: 'trial',
      monthly_price: String(defaultPlan?.monthly_price || 0), discount_percent: '0',
      payment_gateway: 'manual', notes: '', trial_days: '7',
    });
    setDialogOpen(true);
  };

  const openEdit = (sub: Subscription) => {
    setSelectedSub(sub);
    setFormData({
      organization_id: sub.organization_id, plan_id: sub.plan_id, status: sub.status,
      monthly_price: String(sub.monthly_price), discount_percent: String(sub.discount_percent || 0),
      payment_gateway: sub.payment_gateway, notes: sub.notes || '', trial_days: '0',
    });
    setDialogOpen(true);
  };

  const openPayment = (sub: Subscription) => {
    setSelectedSub(sub);
    setPaymentData({ amount: String(sub.monthly_price), payment_method: 'pix', notes: '' });
    setPaymentDialogOpen(true);
  };

  const handleSave = async () => {
    const plan = plans.find(p => p.id === formData.plan_id);
    const trialDays = Number(formData.trial_days);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const payload: any = {
      organization_id: formData.organization_id,
      plan_id: formData.plan_id,
      status: formData.status,
      monthly_price: Number(formData.monthly_price),
      discount_percent: Number(formData.discount_percent),
      payment_gateway: formData.payment_gateway,
      notes: formData.notes || null,
      current_period_end: periodEnd.toISOString(),
    };

    if (formData.status === 'trial' && trialDays > 0) {
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + trialDays);
      payload.trial_ends_at = trialEnd.toISOString();
    }

    if (selectedSub) {
      const { error } = await supabase.from('organization_subscriptions').update(payload).eq('id', selectedSub.id);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      
      // Sync limits to organization
      if (plan) {
        await supabase.from('organizations').update({
          max_users: plan.max_users || Number(formData.monthly_price),
          max_clients: plan.max_clients || 100,
          plan: plan.name.toLowerCase(),
        } as any).eq('id', formData.organization_id);
      }
      toast({ title: 'Assinatura atualizada' });
    } else {
      const { error } = await supabase.from('organization_subscriptions').insert(payload);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Assinatura criada' });
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleRegisterPayment = async () => {
    if (!selectedSub) return;
    
    // Find the latest pending invoice
    const { data: invoices } = await supabase.from('invoices')
      .select('*')
      .eq('subscription_id', selectedSub.id)
      .eq('status', 'pending')
      .order('due_date')
      .limit(1);

    let invoiceId: string;

    if (invoices && invoices.length > 0) {
      invoiceId = invoices[0].id;
      // Mark invoice as paid
      await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() } as any).eq('id', invoiceId);
    } else {
      // Create an invoice for this payment
      const now = new Date();
      const { data: newInvoice, error } = await supabase.from('invoices').insert({
        organization_id: selectedSub.organization_id,
        subscription_id: selectedSub.id,
        amount: Number(paymentData.amount),
        final_amount: Number(paymentData.amount),
        due_date: now.toISOString().split('T')[0],
        status: 'paid',
        paid_at: now.toISOString(),
        reference_month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      } as any).select().single();

      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      invoiceId = newInvoice.id;
    }

    // Register payment
    const { error: payError } = await supabase.from('payments').insert({
      invoice_id: invoiceId,
      organization_id: selectedSub.organization_id,
      amount: Number(paymentData.amount),
      payment_method: paymentData.payment_method,
      notes: paymentData.notes || null,
    } as any);

    if (payError) { toast({ title: 'Erro', description: payError.message, variant: 'destructive' }); return; }

    // Update subscription status to active and extend period
    const newPeriodEnd = new Date();
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
    await supabase.from('organization_subscriptions').update({
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: newPeriodEnd.toISOString(),
    } as any).eq('id', selectedSub.id);

    toast({ title: 'Pagamento registrado com sucesso' });
    setPaymentDialogOpen(false);
    fetchData();
  };

  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.status === 'active').length,
    overdue: subscriptions.filter(s => s.status === 'overdue' || s.status === 'defaulting').length,
    trial: subscriptions.filter(s => s.status === 'trial').length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nova Assinatura</Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />Ativas</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Inadimplentes</p>
              <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><CreditCard className="w-3 h-3 text-blue-500" />Trial</p>
              <p className="text-2xl font-bold text-blue-600">{stats.trial}</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.organizations?.name || '–'}</TableCell>
                    <TableCell>{sub.plans?.name || '–'}</TableCell>
                    <TableCell>
                      R$ {Number(sub.monthly_price).toFixed(2).replace('.', ',')}
                      {sub.discount_percent > 0 && (
                        <Badge variant="outline" className="ml-1 text-xs">-{sub.discount_percent}%</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[sub.status] || ''}>
                        {statusLabels[sub.status] || sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sub.current_period_end 
                        ? new Date(sub.current_period_end).toLocaleDateString('pt-BR')
                        : '–'}
                    </TableCell>
                    <TableCell className="capitalize">{sub.payment_gateway}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(sub)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openPayment(sub)} className="text-green-600">
                          <DollarSign className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {subscriptions.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma assinatura encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSub ? 'Editar Assinatura' : 'Nova Assinatura'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!selectedSub && (
              <div>
                <Label>Organização</Label>
                <Select value={formData.organization_id} onValueChange={(v) => setFormData({ ...formData, organization_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {orgs.filter(o => !orgsWithSub.has(o.id)).map((org) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Plano</Label>
              <Select value={formData.plan_id} onValueChange={(v) => {
                const plan = plans.find(p => p.id === v);
                setFormData({ ...formData, plan_id: v, monthly_price: String(plan?.monthly_price || 0) });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} - R$ {Number(p.monthly_price).toFixed(2)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor Mensal (R$)</Label>
                <Input type="number" step="0.01" value={formData.monthly_price} onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })} />
              </div>
              <div>
                <Label>Desconto (%)</Label>
                <Input type="number" value={formData.discount_percent} onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="overdue">Vencida</SelectItem>
                    <SelectItem value="defaulting">Inadimplente</SelectItem>
                    <SelectItem value="suspended">Suspensa</SelectItem>
                    <SelectItem value="canceled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gateway</Label>
                <Select value={formData.payment_gateway} onValueChange={(v) => setFormData({ ...formData, payment_gateway: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="asaas">Asaas</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.status === 'trial' && !selectedSub && (
              <div>
                <Label>Dias de Trial</Label>
                <Input type="number" value={formData.trial_days} onChange={(e) => setFormData({ ...formData, trial_days: e.target.value })} />
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{selectedSub ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} />
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={paymentData.payment_method} onValueChange={(v) => setPaymentData({ ...paymentData, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                  <SelectItem value="transfer">Transferência</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={paymentData.notes} onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegisterPayment} className="bg-green-600 hover:bg-green-700">Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSubscriptions;
