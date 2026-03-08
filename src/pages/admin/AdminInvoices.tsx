import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Invoice {
  id: string;
  organization_id: string;
  amount: number;
  final_amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  reference_month: string | null;
  created_at: string;
  organizations?: { name: string };
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  paid: 'bg-green-500/10 text-green-600 border-green-500/30',
  overdue: 'bg-red-500/10 text-red-600 border-red-500/30',
  canceled: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendente', paid: 'Paga', overdue: 'Vencida', canceled: 'Cancelada',
};

const AdminInvoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('invoices')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      setInvoices((data || []) as unknown as Invoice[]);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Faturas</h1>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
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
                    <TableCell className="font-medium">{inv.organizations?.name || '–'}</TableCell>
                    <TableCell>{inv.reference_month || '–'}</TableCell>
                    <TableCell>R$ {Number(inv.final_amount).toFixed(2).replace('.', ',')}</TableCell>
                    <TableCell>{new Date(inv.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[inv.status] || ''}>
                        {statusLabels[inv.status] || inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('pt-BR') : '–'}
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma fatura encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminInvoices;
