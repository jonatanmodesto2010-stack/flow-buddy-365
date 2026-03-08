import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateOrganizationDialog = ({ open, onOpenChange, onSuccess }: CreateOrganizationDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    plan: 'basic',
    max_users: 5,
    max_clients: 100,
    admin_email: '',
    admin_password: '',
    admin_name: '',
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-create-organization', {
        body: { action: 'create_organization', ...form },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Organização criada com sucesso!' });
      onSuccess();
      onOpenChange(false);
      setForm({ name: '', plan: 'basic', max_users: 5, max_clients: 100, admin_email: '', admin_password: '', admin_name: '' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Organização</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome da Organização</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Máx. Usuários</Label>
              <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: Number(e.target.value) })} min={1} />
            </div>
            <div>
              <Label>Máx. Clientes</Label>
              <Input type="number" value={form.max_clients} onChange={(e) => setForm({ ...form, max_clients: Number(e.target.value) })} min={1} />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground mb-3">Primeiro Administrador (Owner)</p>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} required />
              </div>
              <div>
                <Label>Senha</Label>
                <Input type="password" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} required minLength={6} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar Organização'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
