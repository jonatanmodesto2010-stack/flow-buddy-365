import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Lock, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';

export const SubscriptionBanner = () => {
  const { status, isOverdue, isBlocked, daysUntilExpiry, loading, isTrial } = useSubscriptionStatus();
  const navigate = useNavigate();

  if (loading || !status) return null;

  // Trial warning when < 3 days
  if (isTrial && daysUntilExpiry !== null && daysUntilExpiry <= 3) {
    return (
      <Card className="border-blue-500/30 bg-blue-500/5 mb-4">
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-blue-500" />
            <p className="text-sm">
              <span className="font-semibold text-blue-600">Período de teste encerra em {daysUntilExpiry} dia(s).</span>
              {' '}Ative sua assinatura para continuar.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/subscription')}>
            Ver Planos
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Overdue warning
  if (isOverdue) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5 mb-4">
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <p className="text-sm">
              <span className="font-semibold text-yellow-600">Sua assinatura está vencida.</span>
              {' '}Regularize para evitar restrições.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/subscription')}>
            Pagar
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Blocked
  if (isBlocked) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mb-4">
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-red-500" />
            <p className="text-sm">
              <span className="font-semibold text-red-600">
                {status === 'canceled' ? 'Assinatura cancelada.' : 'Acesso suspenso por inadimplência.'}
              </span>
              {' '}Entre em contato com o suporte.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/subscription')}>
            Detalhes
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
};
