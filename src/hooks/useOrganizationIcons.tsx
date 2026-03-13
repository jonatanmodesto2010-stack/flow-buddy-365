import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrgIcon {
  id: string;
  icon: string;
  label: string | null;
}

const DEFAULT_ICONS: { icon: string; label: string }[] = [
  { icon: '💬', label: 'WhatsApp' },
  { icon: '📞', label: 'Ligação' },
  { icon: '📅', label: 'Agendamento' },
  { icon: '📄', label: 'Documento' },
  { icon: '✅', label: 'Concluído' },
  { icon: '🤝', label: 'Acordo' },
  { icon: '⚠️', label: 'Atenção' },
  { icon: '🧰', label: 'Suporte' },
  { icon: '💰', label: 'Pagamento' },
  { icon: '🚫', label: 'Bloqueio' },
  { icon: '🔓', label: 'Desbloqueio' },
  { icon: '👨‍🔧', label: 'Técnico' },
];

export { DEFAULT_ICONS };

export const useOrganizationIcons = (organizationId: string | null) => {
  const [icons, setIcons] = useState<OrgIcon[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIcons = async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('organization_icons')
        .select('id, icon, label')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setIcons(data || []);
    } catch (err) {
      console.error('Error loading org icons:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) loadIcons();
  }, [organizationId]);

  return { icons, loading, reload: loadIcons };
};
