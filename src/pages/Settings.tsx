import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserManagement } from '@/components/settings/UserManagement';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { UserProfile } from '@/components/settings/UserProfile';
import { TagsManagement } from '@/components/settings/TagsManagement';
import { IconsManagement } from '@/components/settings/IconsManagement';

import { HistorySettings } from '@/components/settings/HistorySettings';
import { SystemChangelogSettings } from '@/components/settings/SystemChangelogSettings';
import { ColorThemeSettings } from '@/components/settings/ColorThemeSettings';
import { CollectionRulesSettings } from '@/components/settings/CollectionRulesSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

const Settings = () => {
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { canManageUsers, canManageSettings, isLoading } = useUserRole();
  const navigate = useNavigate();


  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setIsAuthenticated(true);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/auth');
      } else {
        setIsAuthenticated(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!isAuthenticated || isLoading) {
    return null;
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-8">Configurações</h1>
        
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-8">
            <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
            {canManageUsers && (
              <TabsTrigger value="users">Usuários</TabsTrigger>
            )}
              {canManageSettings && (
                <>
                  <TabsTrigger value="general">Geral</TabsTrigger>
                  <TabsTrigger value="colors">Paleta de Cores</TabsTrigger>
                  <TabsTrigger value="tags">Tags</TabsTrigger>
                  <TabsTrigger value="icons">Ícones</TabsTrigger>
                   
                   <TabsTrigger value="collection">Régua de Cobrança</TabsTrigger>
                   <TabsTrigger value="integrations">Integrações</TabsTrigger>
                </>
              )}
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <UserProfile />
          </TabsContent>

          {canManageUsers && (
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
          )}

            {canManageSettings && (
              <>
                <TabsContent value="general">
                  <GeneralSettings />
                </TabsContent>
                <TabsContent value="colors">
                  <ColorThemeSettings />
                </TabsContent>
                <TabsContent value="tags">
                  <TagsManagement />
                </TabsContent>
                <TabsContent value="icons">
                  <IconsManagement />
                </TabsContent>
                <TabsContent value="collection">
                  <CollectionRulesSettings />
                </TabsContent>
                <TabsContent value="integrations">
                  <IntegrationsSettings />
                </TabsContent>
              </>
            )}

          <TabsContent value="history">
            <Tabs defaultValue="changelog" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="changelog">Log de Atualizações</TabsTrigger>
                <TabsTrigger value="completed">Cobranças Finalizadas</TabsTrigger>
              </TabsList>
              <TabsContent value="changelog">
                <SystemChangelogSettings />
              </TabsContent>
              <TabsContent value="completed">
                <HistorySettings />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Settings;
