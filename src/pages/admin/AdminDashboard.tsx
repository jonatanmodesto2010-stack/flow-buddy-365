import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const AdminDashboard = () => {
  const [stats, setStats] = useState({ orgs: 0, users: 0, clients: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const [orgsRes, usersRes, clientsRes] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('client_timelines').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        orgs: orgsRes.count || 0,
        users: usersRes.count || 0,
        clients: clientsRes.count || 0,
      });
    };
    fetchStats();
  }, []);

  const cards = [
    { title: 'Organizações', value: stats.orgs, icon: Building2, color: 'text-blue-500' },
    { title: 'Usuários', value: stats.users, icon: Users, color: 'text-green-500' },
    { title: 'Clientes (Total)', value: stats.clients, icon: FileText, color: 'text-orange-500' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard Global</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
