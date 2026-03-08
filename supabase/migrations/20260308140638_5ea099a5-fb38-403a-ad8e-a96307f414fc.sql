
-- Fase 1.1: Adicionar campos na tabela organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'basic';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 5;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_clients integer NOT NULL DEFAULT 100;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS primary_color text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS custom_domain text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

-- Fase 1.2: RLS para super admins em organizations
CREATE POLICY "Super admins can view all organizations"
ON public.organizations FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all organizations"
ON public.organizations FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete organizations"
ON public.organizations FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- RLS para super admins em user_roles
CREATE POLICY "Super admins can view all user roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage all user roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- RLS para super admins em profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Fase 1.3: Atualizar handle_new_user_complete para não criar org automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE NOTICE '[Trigger] handle_new_user_complete iniciado para user_id: %', NEW.id;
  
  -- Criar profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      (NEW.raw_user_meta_data->>'full_name')::text,
      'Usuário'
    )
  );
  
  RAISE NOTICE '[Trigger] ✅ Profile criado para user_id: %', NEW.id;

  -- Verificar se foi criado por admin (Super Admin ou Admin da org)
  IF (NEW.raw_user_meta_data->>'created_by_admin')::boolean IS TRUE THEN
    RAISE NOTICE '[Trigger] Usuário criado por admin, adicionando à org: %', (NEW.raw_user_meta_data->>'organization_id')::uuid;
    
    UPDATE public.profiles
    SET organization_id = (NEW.raw_user_meta_data->>'organization_id')::uuid
    WHERE id = NEW.id;
    
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (
      NEW.id, 
      (NEW.raw_user_meta_data->>'organization_id')::uuid,
      (NEW.raw_user_meta_data->>'role')::app_role
    );
    
    RAISE NOTICE '[Trigger] ✅ User role criado para role: %', (NEW.raw_user_meta_data->>'role')::app_role;
    RETURN NEW;
  END IF;

  -- Usuários que fazem signup público ficam sem organização
  -- Serão atribuídos a uma org por um Super Admin ou Admin posteriormente
  RAISE NOTICE '[Trigger] Usuário sem org - aguardando atribuição por admin';
  
  RETURN NEW;
END;
$function$;

-- Fase 1.4: Function check_org_limits
CREATE OR REPLACE FUNCTION public.check_org_user_limit(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.user_roles WHERE organization_id = _org_id
  ) < (
    SELECT max_users FROM public.organizations WHERE id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.check_org_client_limit(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.client_timelines WHERE organization_id = _org_id AND is_active = true
  ) < (
    SELECT max_clients FROM public.organizations WHERE id = _org_id
  )
$$;

-- Function para super admin obter stats de uma org
CREATE OR REPLACE FUNCTION public.get_organization_stats(_org_id uuid)
RETURNS TABLE(total_users bigint, total_clients bigint, total_active_clients bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    (SELECT COUNT(*) FROM public.user_roles WHERE organization_id = _org_id),
    (SELECT COUNT(*) FROM public.client_timelines WHERE organization_id = _org_id),
    (SELECT COUNT(*) FROM public.client_timelines WHERE organization_id = _org_id AND is_active = true)
$$;
