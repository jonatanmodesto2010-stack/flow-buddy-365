import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  max_users: number;
  max_clients: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  trial_days: number;
}

const AdminPlans = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: '', slug: '', description: '', monthly_price: '0',
    max_users: '5', max_clients: '100', features: '', is_active: true,
    sort_order: '0', trial_days: '7',
  });
  const { toast } = useToast();

  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('sort_order');
    if (!error && data) setPlans(data as unknown as Plan[]);
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const openCreate = () => {
    setEditingPlan(null);
    setFormData({ name: '', slug: '', description: '', monthly_price: '0', max_users: '5', max_clients: '100', features: '', is_active: true, sort_order: '0', trial_days: '7' });
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name, slug: plan.slug, description: plan.description || '',
      monthly_price: String(plan.monthly_price), max_users: String(plan.max_users),
      max_clients: String(plan.max_clients), features: (plan.features || []).join('\n'),
      is_active: plan.is_active, sort_order: String(plan.sort_order), trial_days: String(plan.trial_days),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name,
      slug: formData.slug,
      description: formData.description || null,
      monthly_price: Number(formData.monthly_price),
      max_users: Number(formData.max_users),
      max_clients: Number(formData.max_clients),
      features: formData.features.split('\n').filter(Boolean),
      is_active: formData.is_active,
      sort_order: Number(formData.sort_order),
      trial_days: Number(formData.trial_days),
    };

    if (editingPlan) {
      const { error } = await supabase.from('plans').update(payload as any).eq('id', editingPlan.id);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Plano atualizado' });
    } else {
      const { error } = await supabase.from('plans').insert(payload as any);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Plano criado' });
    }
    setDialogOpen(false);
    fetchPlans();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Planos</h1>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Novo Plano</Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Card key={plan.id} className={!plan.is_active ? 'opacity-50' : ''}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-bold text-foreground">
                    R$ {Number(plan.monthly_price).toFixed(2).replace('.', ',')}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                  {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">{plan.max_users} usuários</Badge>
                    <Badge variant="outline">{plan.max_clients} clientes</Badge>
                    <Badge variant="outline">{plan.trial_days}d trial</Badge>
                  </div>
                  {!plan.is_active && <Badge variant="secondary">Inativo</Badge>}
                  <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                    {(plan.features || []).map((f, i) => (
                      <li key={i} className="flex items-center gap-1">• {f}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Valor Mensal (R$)</Label>
                <Input type="number" step="0.01" value={formData.monthly_price} onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })} />
              </div>
              <div>
                <Label>Max Usuários</Label>
                <Input type="number" value={formData.max_users} onChange={(e) => setFormData({ ...formData, max_users: e.target.value })} />
              </div>
              <div>
                <Label>Max Clientes</Label>
                <Input type="number" value={formData.max_clients} onChange={(e) => setFormData({ ...formData, max_clients: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dias de Trial</Label>
                <Input type="number" value={formData.trial_days} onChange={(e) => setFormData({ ...formData, trial_days: e.target.value })} />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={formData.sort_order} onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Recursos (um por linha)</Label>
              <Textarea value={formData.features} onChange={(e) => setFormData({ ...formData, features: e.target.value })} rows={4} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingPlan ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminPlans;
