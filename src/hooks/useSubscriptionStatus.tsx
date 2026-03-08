import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

interface SubscriptionStatus {
  status: string | null;
  isActive: boolean;
  isTrial: boolean;
  isOverdue: boolean;
  isBlocked: boolean;
  daysUntilExpiry: number | null;
  loading: boolean;
  planName: string | null;
}

export const useSubscriptionStatus = (): SubscriptionStatus => {
  const [data, setData] = useState<SubscriptionStatus>({
    status: null, isActive: true, isTrial: false, isOverdue: false,
    isBlocked: false, daysUntilExpiry: null, loading: true, planName: null,
  });
  const { organizationId } = useUserRole();

  useEffect(() => {
    if (!organizationId) return;

    const fetch = async () => {
      const { data: sub } = await supabase
        .from('organization_subscriptions')
        .select('status, current_period_end, trial_ends_at, plans(name)')
        .eq('organization_id', organizationId)
        .single();

      if (!sub) {
        // No subscription = allow access (legacy or not configured)
        setData(prev => ({ ...prev, loading: false }));
        return;
      }

      const status = sub.status as string;
      const daysUntilExpiry = sub.current_period_end
        ? Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      setData({
        status,
        isActive: status === 'active' || status === 'trial',
        isTrial: status === 'trial',
        isOverdue: status === 'overdue',
        isBlocked: status === 'canceled' || status === 'suspended',
        daysUntilExpiry,
        loading: false,
        planName: (sub.plans as any)?.name || null,
      });
    };

    fetch();
  }, [organizationId]);

  return data;
};
