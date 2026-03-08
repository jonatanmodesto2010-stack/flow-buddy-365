import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Handshake, Plus, Check, X, DollarSign, Calendar, ChevronDown, ChevronUp, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Agreement {
  id: string;
  timeline_id: string;
  original_debt: number;
  agreed_value: number;
  discount_percent: number;
  installments_count: number;
  notes: string | null;
  status: string;
  created_at: string;
  installments?: Installment[];
}

interface Installment {
  id: string;
  installment_number: number;
  value: number;
  due_date: string;
  status: string;
  paid_at: string | null;
}

interface ClientAgreementsProps {
  timelineId: string;
  organizationId: string;
  clientName: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'text-primary' },
  completed: { label: 'Concluído', color: 'text-green-500' },
  broken: { label: 'Quebrado', color: 'text-destructive' },
  cancelled: { label: 'Cancelado', color: 'text-muted-foreground' },
};

const INSTALLMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'text-yellow-500' },
  paid: { label: 'Pago', color: 'text-green-500' },
  overdue: { label: 'Atrasado', color: 'text-destructive' },
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export const ClientAgreements = ({ timelineId, organizationId, clientName }: ClientAgreementsProps) => {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadAgreements();
  }, [timelineId]);

  const loadAgreements = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('client_agreements')
        .select('*')
        .eq('timeline_id', timelineId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Load installments for each agreement
      const withInstallments = await Promise.all(
        (data || []).map(async (ag: Agreement) => {
          const { data: inst } = await (supabase as any)
            .from('agreement_installments')
            .select('*')
            .eq('agreement_id', ag.id)
            .order('installment_number', { ascending: true });
          return { ...ag, installments: inst || [] };
        })
      );
      setAgreements(withInstallments);
    } catch (err) {
      console.error('Error loading agreements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (installmentId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('agreement_installments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', installmentId);
      if (error) throw error;
      toast({ title: 'Parcela marcada como paga' });
      loadAgreements();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdateStatus = async (agreementId: string, status: string) => {
    try {
      const { error } = await (supabase as any)
        .from('client_agreements')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', agreementId);
      if (error) throw error;
      toast({ title: `Acordo ${STATUS_LABELS[status]?.label || status}` });
      loadAgreements();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (agreementId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('client_agreements')
        .delete()
        .eq('id', agreementId);
      if (error) throw error;
      toast({ title: 'Acordo excluído' });
      loadAgreements();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="h-20 bg-muted animate-pulse rounded-lg" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Handshake size={16} />
          Acordos ({agreements.length})
        </h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs">
              <Plus size={12} className="mr-1" /> Novo Acordo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Acordo - {clientName}</DialogTitle>
            </DialogHeader>
            <CreateAgreementForm
              timelineId={timelineId}
              organizationId={organizationId}
              onCreated={() => { setShowCreate(false); loadAgreements(); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {agreements.length === 0 ? (
        <div className="text-center py-6 bg-muted/30 rounded-lg">
          <Handshake size={24} className="mx-auto text-muted-foreground mb-1 opacity-50" />
          <p className="text-xs text-muted-foreground">Nenhum acordo registrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agreements.map(ag => {
            const statusInfo = STATUS_LABELS[ag.status] || STATUS_LABELS.active;
            const paidCount = (ag.installments || []).filter(i => i.status === 'paid').length;
            const overdueCount = (ag.installments || []).filter(i => {
              if (i.status === 'paid') return false;
              const d = new Date(i.due_date);
              return d < new Date();
            }).length;
            const isExpanded = expandedId === ag.id;

            return (
              <div key={ag.id} className="border border-border rounded-lg bg-card">
                <div
                  className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : ag.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Handshake size={16} className={statusInfo.color} />
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {formatCurrency(ag.agreed_value)} em {ag.installments_count}x
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={statusInfo.color}>{statusInfo.label}</span>
                          <span>•</span>
                          <span>{paidCount}/{ag.installments_count} pagas</span>
                          {overdueCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-destructive flex items-center gap-0.5">
                                <AlertTriangle size={10} /> {overdueCount} atrasadas
                              </span>
                            </>
                          )}
                          {ag.discount_percent > 0 && (
                            <>
                              <span>•</span>
                              <span>{ag.discount_percent}% desconto</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ag.status === 'active' && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={e => { e.stopPropagation(); handleUpdateStatus(ag.id, 'completed'); }}>
                            <Check size={14} className="text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={e => { e.stopPropagation(); handleUpdateStatus(ag.id, 'broken'); }}>
                            <X size={14} className="text-destructive" />
                          </Button>
                        </div>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); handleDelete(ag.id); }}>
                        <Trash2 size={14} className="text-muted-foreground" />
                      </Button>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                          <div>
                            <span className="text-muted-foreground">Dívida original</span>
                            <div className="font-semibold">{formatCurrency(ag.original_debt)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Valor acordado</span>
                            <div className="font-semibold">{formatCurrency(ag.agreed_value)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Desconto</span>
                            <div className="font-semibold">{ag.discount_percent}%</div>
                          </div>
                        </div>
                        {ag.notes && (
                          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{ag.notes}</p>
                        )}
                        <div className="space-y-1">
                          {(ag.installments || []).map(inst => {
                            const instStatus = INSTALLMENT_STATUS[inst.status] || INSTALLMENT_STATUS.pending;
                            const isOverdue = inst.status !== 'paid' && new Date(inst.due_date) < new Date();
                            const displayStatus = isOverdue ? INSTALLMENT_STATUS.overdue : instStatus;

                            return (
                              <div key={inst.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground font-mono">#{inst.installment_number}</span>
                                  <span className="font-medium">{formatCurrency(inst.value)}</span>
                                  <span className="text-muted-foreground">
                                    {new Date(inst.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={displayStatus.color}>{displayStatus.label}</span>
                                  {inst.status !== 'paid' && ag.status === 'active' && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6"
                                      onClick={() => handleMarkPaid(inst.id)}>
                                      <Check size={12} className="text-green-500" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Create Agreement Form
const CreateAgreementForm = ({ timelineId, organizationId, onCreated }: {
  timelineId: string;
  organizationId: string;
  onCreated: () => void;
}) => {
  const [originalDebt, setOriginalDebt] = useState('');
  const [agreedValue, setAgreedValue] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('1');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const discount = originalDebt && agreedValue
    ? Math.round((1 - parseFloat(agreedValue) / parseFloat(originalDebt)) * 100)
    : 0;

  const installmentValue = agreedValue && installmentsCount
    ? parseFloat(agreedValue) / parseInt(installmentsCount)
    : 0;

  const handleSubmit = async () => {
    if (!originalDebt || !agreedValue || !firstDueDate || !installmentsCount) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const count = parseInt(installmentsCount);
      const value = parseFloat(agreedValue) / count;

      // Create agreement
      const { data: agreement, error } = await (supabase as any)
        .from('client_agreements')
        .insert({
          organization_id: organizationId,
          timeline_id: timelineId,
          original_debt: parseFloat(originalDebt),
          agreed_value: parseFloat(agreedValue),
          discount_percent: Math.max(0, discount),
          installments_count: count,
          notes: notes || null,
          created_by: user?.id,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Create installments
      const installments = Array.from({ length: count }, (_, i) => {
        const dueDate = new Date(firstDueDate + 'T00:00:00');
        dueDate.setMonth(dueDate.getMonth() + i);
        return {
          agreement_id: agreement.id,
          installment_number: i + 1,
          value: Math.round(value * 100) / 100,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending',
        };
      });

      const { error: instError } = await (supabase as any)
        .from('agreement_installments')
        .insert(installments);

      if (instError) throw instError;

      toast({ title: 'Acordo criado com sucesso!' });
      onCreated();
    } catch (err: any) {
      toast({ title: 'Erro ao criar acordo', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Dívida Original *</Label>
          <Input type="number" value={originalDebt} onChange={e => setOriginalDebt(e.target.value)} placeholder="0.00" className="mt-1" />
        </div>
        <div>
          <Label>Valor Acordado *</Label>
          <Input type="number" value={agreedValue} onChange={e => setAgreedValue(e.target.value)} placeholder="0.00" className="mt-1" />
        </div>
      </div>

      {discount > 0 && (
        <div className="text-xs text-green-500 bg-green-500/10 rounded p-2">
          Desconto de {discount}% sobre a dívida original
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Nº de Parcelas *</Label>
          <Input type="number" min="1" value={installmentsCount} onChange={e => setInstallmentsCount(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>1º Vencimento *</Label>
          <Input type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} className="mt-1" />
        </div>
      </div>

      {installmentValue > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          {parseInt(installmentsCount)}x de {formatCurrency(installmentValue)}
        </div>
      )}

      <div>
        <Label>Observações</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes da negociação..." className="mt-1" />
      </div>

      <Button onClick={handleSubmit} disabled={saving} className="w-full">
        {saving ? <><Loader2 size={14} className="mr-2 animate-spin" /> Salvando...</> : <><Handshake size={14} className="mr-2" /> Criar Acordo</>}
      </Button>
    </div>
  );
};
