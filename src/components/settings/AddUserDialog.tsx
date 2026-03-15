import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const addUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().optional().refine(
    (val) => !val || (val.length >= 8 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(val)),
    'Senha deve ter no mínimo 8 caracteres com letras maiúsculas, minúsculas e números'
  ),
  fullName: z.string().trim().min(1, 'Nome é obrigatório').max(100),
  role: z.enum(['admin', 'member', 'viewer']),
});

type AddUserFormData = z.infer<typeof addUserSchema>;

interface AddUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  organizationId: string | null;
}

export const AddUserDialog = ({ isOpen, onClose, onSuccess, organizationId }: AddUserDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AddUserFormData>({
    resolver: zodResolver(addUserSchema),
    defaultValues: {
      role: 'member',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: AddUserFormData) => {
    if (!organizationId) {
      toast({
        title: 'Erro',
        description: 'Organização não encontrada.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        'create-or-add-user-to-organization',
        {
          body: {
            email: data.email,
            password: data.password || undefined,
            full_name: data.fullName,
            organization_id: organizationId,
            role: data.role,
          },
        }
      );

      if (error) {
        throw new Error(error.message || 'Erro ao processar requisição');
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      const isNewUser = result?.created;
      toast({
        title: isNewUser ? 'Usuário criado' : 'Usuário vinculado',
        description: result?.message || (isNewUser
          ? 'O novo usuário foi adicionado à organização.'
          : 'O usuário existente foi vinculado à organização.'),
      });

      reset();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating/linking user:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível criar/vincular o usuário.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Novo Usuário</DialogTitle>
          <DialogDescription>
            Crie uma nova conta ou vincule um usuário existente à organização
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="usuario@exemplo.com"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha Inicial</Label>
            <Input
              id="password"
              type="password"
              {...register('password')}
              placeholder="Obrigatório apenas para novos usuários"
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco se o usuário já possui conta no sistema
            </p>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Nome Completo</Label>
            <Input
              id="fullName"
              {...register('fullName')}
              placeholder="Nome completo do usuário"
            />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função</Label>
            <Select value={selectedRole} onValueChange={(value) => setValue('role', value as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="member">Membro</SelectItem>
                <SelectItem value="viewer">Visualizador</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Processando...' : 'Adicionar Usuário'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
