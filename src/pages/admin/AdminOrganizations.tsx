import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { CreateOrganizationDialog } from '@/components/admin/CreateOrganizationDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Pause, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Organization {
  id: string;
  name: string;
  status: string;
  plan: string;
  max_users: number;
  max_clients: number;
  created_at: string;
}

const AdminOrganizations = () => {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchOrgs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrgs(data as Organization[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchOrgs(); }, []);

  const handleSuspendToggle = async (org: Organization) => {
    const suspend = org.status === 'active';
    const { error } = await supabase.functions.invoke('admin-create-organization', {
      body: { action: 'suspend_organization', id: org.id, suspend },
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: suspend ? 'Organização suspensa' : 'Organização reativada' });
      fetchOrgs();
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-green-500/10 text-green-600 border-green-500/20',
      suspended: 'bg-red-500/10 text-red-600 border-red-500/20',
      inactive: 'bg-muted text-muted-foreground',
    };
    return <Badge variant="outline" className={variants[status] || ''}>{status}</Badge>;
  };

  const planBadge = (plan: string) => {
    const variants: Record<string, string> = {
      basic: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      pro: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
      enterprise: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    };
    return <Badge variant="outline" className={variants[plan] || ''}>{plan}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Organizações</h1>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova Organização
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Máx. Usuários</TableHead>
                  <TableHead>Máx. Clientes</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : orgs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma organização</TableCell></TableRow>
                ) : (
                  orgs.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{statusBadge(org.status)}</TableCell>
                      <TableCell>{planBadge(org.plan)}</TableCell>
                      <TableCell>{org.max_users}</TableCell>
                      <TableCell>{org.max_clients}</TableCell>
                      <TableCell>{format(new Date(org.created_at), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/organizations/${org.id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleSuspendToggle(org)}>
                            {org.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={fetchOrgs} />
      </div>
    </AdminLayout>
  );
};

export default AdminOrganizations;
