import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from './useUserRole';

interface OrgStatus {
  status: string | null;
  isActive: boolean;
  isSuspended: boolean;
  isLoading: boolean;
}

export const useOrganizationStatus = (): OrgStatus => {
  const { organizationId, isLoading: roleLoading } = useUserRole();
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (roleLoading || !organizationId) {
      setIsLoading(false);
      return;
    }

    const fetchStatus = async () => {
      const { data } = await supabase
        .from('organizations')
        .select('status')
        .eq('id', organizationId)
        .single();

      if (data) setStatus(data.status);
      setIsLoading(false);
    };

    fetchStatus();
  }, [organizationId, roleLoading]);

  return {
    status,
    isActive: status === 'active',
    isSuspended: status === 'suspended',
    isLoading: isLoading || roleLoading,
  };
};
