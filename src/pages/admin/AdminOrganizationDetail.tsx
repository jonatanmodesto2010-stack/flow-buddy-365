import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Save, UserPlus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AdminOrgIntegrations } from '@/components/admin/AdminOrgIntegrations';
import { useToast } from '@/hooks/use-toast';

interface OrgUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  user_role_id: string;
  created_at: string;
}

const AdminOrganizationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [org, setOrg] = useState<any>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'member' });
  const [addingUser, setAddingUser] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);

    const [orgRes, usersRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', id).single(),
      supabase.rpc('get_organization_users', { _org_id: id }),
    ]);

    if (orgRes.data) setOrg(orgRes.data);
    if (usersRes.data) setUsers(usersRes.data as OrgUser[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSave = async () => {
    if (!org) return;
    setSaving(true);
    const { error } = await supabase.functions.invoke('admin-create-organization', {
      body: {
        action: 'update_organization',
        id: org.id,
        name: org.name,
        plan: org.plan,
        max_users: org.max_users,
        max_clients: org.max_clients,
      },
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Organização atualizada!' });
    }
    setSaving(false);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingUser(true);

    const { data, error } = await supabase.functions.invoke('admin-create-organization', {
      body: {
        action: 'add_user_to_org',
        organization_id: id,
        ...newUser,
      },
    });

    if (error || data?.error) {
      toast({ title: 'Erro', description: error?.message || data?.error, variant: 'destructive' });
    } else {
      toast({ title: 'Usuário adicionado!' });
      setAddUserOpen(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'member' });
      fetchData();
    }
    setAddingUser(false);
  };

  const handleDeleteUserRole = async (userRoleId: string) => {
    const { error } = await supabase.from('user_roles').delete().eq('id', userRoleId);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Usuário removido da organização' });
      fetchData();
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!org) {
    return (
      <AdminLayout>
        <p className="text-muted-foreground">Organização não encontrada.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/organizations')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
          <Badge variant="outline">{org.status}</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle>Dados da Organização</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
              </div>
              <div>
                <Label>Plano</Label>
                <Select value={org.plan} onValueChange={(v) => setOrg({ ...org, plan: v })}>
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
                <Input type="number" value={org.max_users} onChange={(e) => setOrg({ ...org, max_users: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Máx. Clientes</Label>
                <Input type="number" value={org.max_clients} onChange={(e) => setOrg({ ...org, max_clients: Number(e.target.value) })} />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Usuários ({users.length})</CardTitle>
            <Button size="sm" onClick={() => setAddUserOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> Adicionar
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell>{u.full_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteUserRole(u.user_role_id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <AdminOrgIntegrations organizationId={id!} />

        <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar Usuário</DialogTitle></DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
              </div>
              <div>
                <Label>Senha</Label>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={6} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={addingUser}>{addingUser ? 'Adicionando...' : 'Adicionar'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminOrganizationDetail;
