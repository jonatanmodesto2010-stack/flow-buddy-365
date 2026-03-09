import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { organizationId } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchOS = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase.functions.invoke('ixc-os-retirada', {
        body: { organization_id: organizationId },
      });
      if (error) {
        console.error('OS retirada fetch error:', error);
        return;
      }
      setOsList(data?.os_list || []);
    } catch (err) {
      console.error('OS retirada error:', err);
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
    // Try to navigate to clients filtered by the client name
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="bg-card border border-border rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package size={16} />
          📦 OS de Retirada de Equipamento
        </h3>
        {osList.length > 0 && (
          <span className="text-xs text-muted-foreground">{osList.length} registro(s)</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : osList.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma retirada de equipamento pendente
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagedItems.map((os) => (
              <div
                key={os.id}
                onClick={() => handleItemClick(os)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors group"
              >
                <span className="text-xl flex-shrink-0">📦</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {os.cliente_nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(os.data_abertura)} • OS #{os.id}
                  </p>
                </div>
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
              </div>
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
    </motion.div>
  );
};
