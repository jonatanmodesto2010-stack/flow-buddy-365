import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { ClientTimeline } from '@/lib/client-utils';

interface BoletoData {
  timeline_id: string;
  due_date: string;
  status: string;
  boleto_value: number;
}

interface DelinquentClient {
  clientName: string;
  clientId: string;
  overdueValue: number;
  overdueCount: number;
  maxOverdueDays: number;
  totalPending: number;
  isBlocked: boolean;
}

interface DelinquentsExportProps {
  timelines: ClientTimeline[];
  boletos: BoletoData[];
}

export const DelinquentsExport = ({ timelines, boletos }: DelinquentsExportProps) => {
  const [open, setOpen] = useState(false);
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [minDays, setMinDays] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { toast } = useToast();

  const delinquents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const boletosByTimeline = new Map<string, BoletoData[]>();
    for (const b of boletos) {
      if (!boletosByTimeline.has(b.timeline_id)) boletosByTimeline.set(b.timeline_id, []);
      boletosByTimeline.get(b.timeline_id)!.push(b);
    }

    const results: DelinquentClient[] = [];

    for (const t of timelines) {
      if (t.status === 'completed' || t.status === 'archived') continue;

      const clientBoletos = boletosByTimeline.get(t.id) || [];
      const pending = clientBoletos.filter(b => b.status !== 'pago' && b.status !== 'cancelado');
      const overdue = pending.filter(b => {
        const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
        return today.getTime() > d.getTime();
      });

      if (overdue.length === 0) continue;

      const overdueValue = overdue.reduce((s, b) => s + (Number(b.boleto_value) || 0), 0);
      const totalPending = pending.reduce((s, b) => s + (Number(b.boleto_value) || 0), 0);

      let maxOverdueDays = 0;
      for (const b of overdue) {
        const d = new Date(b.due_date); d.setHours(0, 0, 0, 0);
        const days = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (days > maxOverdueDays) maxOverdueDays = days;
      }

      results.push({
        clientName: t.client_name,
        clientId: t.client_id || '',
        overdueValue,
        overdueCount: overdue.length,
        maxOverdueDays,
        totalPending,
        isBlocked: !t.is_active,
      });
    }

    return results.sort((a, b) => b.overdueValue - a.overdueValue);
  }, [timelines, boletos]);

  const filtered = useMemo(() => {
    return delinquents.filter(d => {
      if (minValue && d.overdueValue < parseFloat(minValue)) return false;
      if (maxValue && d.overdueValue > parseFloat(maxValue)) return false;
      if (minDays && d.maxOverdueDays < parseInt(minDays)) return false;
      if (maxDays && d.maxOverdueDays > parseInt(maxDays)) return false;
      if (statusFilter === 'blocked' && !d.isBlocked) return false;
      if (statusFilter === 'active' && d.isBlocked) return false;
      return true;
    });
  }, [delinquents, minValue, maxValue, minDays, maxDays, statusFilter]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const clearFilters = () => {
    setMinValue('');
    setMaxValue('');
    setMinDays('');
    setMaxDays('');
    setStatusFilter('all');
  };

  const exportCSV = () => {
    const headers = ['Cliente', 'ID', 'Valor em Atraso', 'Boletos Vencidos', 'Dias de Atraso', 'Total Pendente', 'Bloqueado'];
    const rows = filtered.map(d => [
      d.clientName,
      d.clientId,
      d.overdueValue.toFixed(2),
      d.overdueCount.toString(),
      d.maxOverdueDays.toString(),
      d.totalPending.toFixed(2),
      d.isBlocked ? 'Sim' : 'Não',
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inadimplentes_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `CSV exportado com ${filtered.length} registros` });
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape' });

    // Title
    doc.setFontSize(16);
    doc.text('Relatório de Inadimplentes', 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} - ${filtered.length} clientes`, 14, 22);

    // Filters applied
    const filtersApplied: string[] = [];
    if (minValue) filtersApplied.push(`Valor mín: R$ ${minValue}`);
    if (maxValue) filtersApplied.push(`Valor máx: R$ ${maxValue}`);
    if (minDays) filtersApplied.push(`Dias mín: ${minDays}`);
    if (maxDays) filtersApplied.push(`Dias máx: ${maxDays}`);
    if (statusFilter !== 'all') filtersApplied.push(`Status: ${statusFilter === 'blocked' ? 'Bloqueados' : 'Ativos'}`);
    if (filtersApplied.length > 0) {
      doc.text(`Filtros: ${filtersApplied.join(' | ')}`, 14, 28);
    }

    // Summary
    const totalOverdue = filtered.reduce((s, d) => s + d.overdueValue, 0);
    const totalPending = filtered.reduce((s, d) => s + d.totalPending, 0);
    const blockedCount = filtered.filter(d => d.isBlocked).length;
    doc.text(
      `Total em atraso: R$ ${totalOverdue.toFixed(2)} | Total pendente: R$ ${totalPending.toFixed(2)} | Bloqueados: ${blockedCount}`,
      14, filtersApplied.length > 0 ? 34 : 28
    );

    // Table
    const startY = filtersApplied.length > 0 ? 40 : 34;
    (doc as any).autoTable({
      startY,
      head: [['#', 'Cliente', 'ID', 'Valor em Atraso', 'Boletos', 'Dias Atraso', 'Total Pendente', 'Status']],
      body: filtered.map((d, i) => [
        i + 1,
        d.clientName,
        d.clientId,
        `R$ ${d.overdueValue.toFixed(2)}`,
        d.overdueCount,
        d.maxOverdueDays,
        `R$ ${d.totalPending.toFixed(2)}`,
        d.isBlocked ? 'Bloqueado' : 'Ativo',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 10 },
        3: { halign: 'right' as const },
        6: { halign: 'right' as const },
      },
    });

    doc.save(`inadimplentes_${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: `PDF exportado com ${filtered.length} registros` });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <Download size={14} className="mr-1" /> Exportar Inadimplentes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} /> Exportar Lista de Inadimplentes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Filter size={12} /> Filtros
              </p>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7">
                <X size={12} className="mr-1" /> Limpar
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Valor mínimo (R$)</Label>
                <Input type="number" value={minValue} onChange={e => setMinValue(e.target.value)} placeholder="0" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Valor máximo (R$)</Label>
                <Input type="number" value={maxValue} onChange={e => setMaxValue(e.target.value)} placeholder="∞" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Dias atraso mín.</Label>
                <Input type="number" value={minDays} onChange={e => setMinDays(e.target.value)} placeholder="0" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Dias atraso máx.</Label>
                <Input type="number" value={maxDays} onChange={e => setMaxDays(e.target.value)} placeholder="∞" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="blocked">Bloqueados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="border border-border rounded-lg">
            <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {filtered.length} inadimplentes encontrados
              </span>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(filtered.reduce((s, d) => s + d.overdueValue, 0))}
              </span>
            </div>
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Cliente</th>
                    <th className="text-right p-2">Valor Atraso</th>
                    <th className="text-right p-2">Dias</th>
                    <th className="text-right p-2">Boletos</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map((d, i) => (
                    <tr key={i} className="border-t border-border hover:bg-muted/20">
                      <td className="p-2 font-medium text-foreground">{d.clientName}</td>
                      <td className="p-2 text-right text-destructive">{formatCurrency(d.overdueValue)}</td>
                      <td className="p-2 text-right">{d.maxOverdueDays}d</td>
                      <td className="p-2 text-right">{d.overdueCount}</td>
                      <td className="p-2 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${d.isBlocked ? 'text-destructive bg-destructive/10' : 'text-green-500 bg-green-500/10'}`}>
                          {d.isBlocked ? 'Bloqueado' : 'Ativo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ...e mais {filtered.length - 50} registros (todos serão exportados)
                </p>
              )}
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-3">
            <Button onClick={exportCSV} variant="outline" className="flex-1" disabled={filtered.length === 0}>
              <Download size={14} className="mr-2" /> Exportar CSV
            </Button>
            <Button onClick={exportPDF} className="flex-1" disabled={filtered.length === 0}>
              <FileText size={14} className="mr-2" /> Exportar PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
