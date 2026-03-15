import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  organizationId: string;
}

const getPasswordStrength = (password: string): { label: string; color: string; width: string } => {
  if (!password) return { label: '', color: '', width: '0%' };
  if (password.length < 6) return { label: 'Muito fraca', color: 'bg-destructive', width: '20%' };
  
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  if (score <= 1) return { label: 'Fraca', color: 'bg-orange-500', width: '40%' };
  if (score === 2) return { label: 'Média', color: 'bg-yellow-500', width: '60%' };
  if (score === 3) return { label: 'Forte', color: 'bg-green-500', width: '80%' };
  return { label: 'Muito forte', color: 'bg-green-600', width: '100%' };
};

export const ResetPasswordDialog = ({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  organizationId,
}: ResetPasswordDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('admin-reset-password', {
        body: {
          target_user_id: targetUserId,
          new_password: data.newPassword,
          organization_id: organizationId,
        },
      });

      if (error) throw error;

      if (result?.error) {
        toast({
          title: 'Erro',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Senha resetada',
        description: `A senha de ${targetUserName} foi resetada com sucesso.`,
      });

      reset();
      setNewPasswordValue('');
      onClose();
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível resetar a senha.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    setNewPasswordValue('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    onClose();
  };

  const passwordStrength = getPasswordStrength(newPasswordValue);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Resetar Senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha temporária para <strong>{targetUserName}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-newPassword">Nova Senha</Label>
            <div className="relative">
              <Input
                id="reset-newPassword"
                type={showNewPassword ? 'text' : 'password'}
                {...register('newPassword', {
                  onChange: (e) => setNewPasswordValue(e.target.value),
                })}
                placeholder="Digite a nova senha"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPasswordValue && (
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${passwordStrength.color} transition-all duration-300 rounded-full`}
                    style={{ width: passwordStrength.width }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Força: {passwordStrength.label}
                </p>
              </div>
            )}
            {errors.newPassword && (
              <p className="text-sm text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirmPassword">Confirmar Nova Senha</Label>
            <div className="relative">
              <Input
                id="reset-confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                {...register('confirmPassword')}
                placeholder="Confirme a nova senha"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Informe a nova senha ao usuário. Recomende que ele altere a senha após o primeiro login.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Resetando...' : 'Resetar Senha'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
