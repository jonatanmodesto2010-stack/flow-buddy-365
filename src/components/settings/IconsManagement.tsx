import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface OrgIcon {
  id: string;
  icon: string;
  label: string | null;
}

export const IconsManagement = () => {
  const [icons, setIcons] = useState<OrgIcon[]>([]);
  const [newIcon, setNewIcon] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const { organizationId } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (organizationId) loadIcons();
  }, [organizationId]);

  const loadIcons = async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase
        .from('organization_icons')
        .select('id, icon, label')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setIcons(data || []);
    } catch (err: any) {
      console.error('Error loading icons:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIcon = async () => {
    if (!organizationId || !newIcon.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('organization_icons')
        .insert({
          organization_id: organizationId,
          icon: newIcon.trim(),
          label: newLabel.trim() || null,
          created_by: user?.id,
        });
      if (error) throw error;
      setNewIcon('');
      setNewLabel('');
      loadIcons();
      toast({ title: 'Ícone adicionado' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteIcon = async (id: string) => {
    try {
      const { error } = await supabase
        .from('organization_icons')
        .delete()
        .eq('id', id);
      if (error) throw error;
      loadIcons();
      toast({ title: 'Ícone removido' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="h-32 bg-muted animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-xl font-bold mb-1">Ícones da Organização</h3>
        <p className="text-sm text-muted-foreground mb-6">Gerencie os ícones disponíveis para eventos da timeline</p>

        {/* Add new icon */}
        <div className="flex gap-3 mb-6">
          <Input
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="Emoji (ex: 📞)"
            className="w-20"
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Rótulo (ex: Ligação)"
            className="flex-1"
          />
          <Button onClick={handleAddIcon} disabled={!newIcon.trim()}>
            <Plus size={16} className="mr-1" /> Adicionar
          </Button>
        </div>

        {/* Icons list */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {icons.map((icon) => (
            <div key={icon.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg group">
              <span className="text-2xl">{icon.icon}</span>
              <span className="text-sm flex-1 truncate">{icon.label || 'Sem rótulo'}</span>
              <button
                onClick={() => handleDeleteIcon(icon.id)}
                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {icons.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum ícone cadastrado</p>
        )}
      </div>
    </div>
  );
};
