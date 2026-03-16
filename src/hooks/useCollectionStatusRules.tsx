import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from './useUserRole';
import type { StatusRule } from '@/components/OverdueBadge';

export const useCollectionStatusRules = () => {
  const [rules, setRules] = useState<StatusRule[]>([]);
  const [loading, setLoading] = useState(true);
  const { organizationId } = useUserRole();

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    const loadRules = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('collection_status_rules')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        setRules(data || []);
      } catch (err) {
        console.error('Error loading status rules:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRules();
  }, [organizationId]);

  return { rules, loading };
};
