import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ChevronLeft, ChevronRight, Copy, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ClientCard } from '@/components/ClientCard';

interface OSRetirada {
  id: string;
  id_cliente: string;
  cliente_nome: string;
  data_abertura: string;
  status: string;
  descricao: string;
}

const STATUS_COLORS: Record<string, string> = {
  'Aberta': 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  'Nova': 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  'Em andamento': 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  'Executando': 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  'Aguardando': 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
};

function getStatusClass(status: string): string {
  return STATUS_COLORS[status] || 'bg-muted text-muted-foreground border-border';
}

function formatDate(raw: string): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return raw;
  }
}

const PAGE_SIZE = 10;

export const EquipmentRetrievalWidget = () => {
  const [osList, setOsList] = useState<OSRetirada[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [notConfigured, setNotConfigured] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { organizationId } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  console.log('[EquipmentRetrievalWidget] Componente montado');

  const fetchOS = useCallback(async () => {
    console.log('[EquipmentRetrievalWidget] fetchOS chamado, organizationId:', organizationId);
    if (!organizationId) {
      console.log('[EquipmentRetrievalWidget] organizationId não encontrado');
      setLoading(false);
      return;
    }

    // Check if assunto_id is configured
    try {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('ixc_os_retirada_assunto_id')
        .eq('organization_id', organizationId)
        .eq('integration_type', 'ixc')
        .eq('is_active', true)
        .maybeSingle();

      console.log('[EquipmentRetrievalWidget] integration data:', integration);

      if (!integration?.ixc_os_retirada_assunto_id) {
        console.log('[EquipmentRetrievalWidget] ixc_os_retirada_assunto_id NÃO configurado');
        setNotConfigured(true);
        setLoading(false);
        return;
      }

      setNotConfigured(false);
    } catch (err) {
      console.error('[EquipmentRetrievalWidget] Erro ao verificar configuração:', err);
    }

    try {
      console.log('[EquipmentRetrievalWidget] Chamando edge function ixc-os-retirada');
      const { data, error } = await supabase.functions.invoke('ixc-os-retirada', {
        body: { organization_id: organizationId },
      });
      console.log('[EquipmentRetrievalWidget] Resposta da edge function:', { data, error });
      if (error) {
        console.error('[EquipmentRetrievalWidget] Erro na edge function:', error);
        setLoading(false);
        return;
      }
      const list = data?.os_list || [];
      console.log('[EquipmentRetrievalWidget] OS recebidas:', list.length);
      setOsList(list);
    } catch (err) {
      console.error('[EquipmentRetrievalWidget] Erro geral:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    fetchOS();
    intervalRef.current = setInterval(fetchOS, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [organizationId, fetchOS]);

  const totalPages = Math.max(1, Math.ceil(osList.length / PAGE_SIZE));
  const pagedItems = osList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleItemClick = (os: OSRetirada) => {
    if (os.id_cliente) {
      navigate(`/clients?search=${encodeURIComponent(os.cliente_nome)}`);
    } else {
      navigator.clipboard.writeText(os.id);
      toast({ title: 'ID copiado', description: `OS #${os.id} copiado para a área de transferência` });
    }
  };

  const handleCopyId = (e: React.MouseEvent, os: OSRetirada) => {
    e.stopPropagation();
    navigator.clipboard.writeText(os.id);
    toast({ title: 'ID copiado', description: `OS #${os.id}` });
  };

  // Render inline content (no card wrapper)
  return (
    <div>
      <Separator className="my-4" />
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
        <Package size={16} />
        📦 OS de Retirada
      </h4>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : notConfigured ? (
        <div className="py-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Settings size={20} className="text-muted-foreground/60" />
          Configure o ID do assunto de retirada nas integrações para visualizar as OS
        </div>
      ) : osList.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma retirada de equipamento pendente
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagedItems.map((os) => (
              <ClientCard
                key={os.id}
                title={os.cliente_nome}
                subtitle={`${formatDate(os.data_abertura)} • OS #${os.id}`}
                subtitleIcon="📦"
                onClick={() => handleItemClick(os)}
                badges={
                  <>
                    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getStatusClass(os.status)}`}>
                      {os.status}
                    </Badge>
                    <button
                      onClick={(e) => handleCopyId(e, os)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                      title="Copiar ID"
                    >
                      <Copy size={12} className="text-muted-foreground" />
                    </button>
                  </>
                }
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="h-7 text-xs"
              >
                <ChevronLeft size={14} className="mr-1" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="h-7 text-xs"
              >
                Próximo
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
