-- =============================================
-- DATABASE SCHEMA EXPORT - Lovable Cloud
-- Generated: 2026-03-05
-- Project: ghheubvkddwggoodbytf
-- =============================================

-- =====================
-- ENUMS
-- =====================
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- =====================
-- TABLES
-- =====================

-- Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  events_per_line_limit integer NOT NULL DEFAULT 28,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  phone text,
  organization_id uuid REFERENCES public.organizations(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Super Admins
CREATE TABLE public.super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- User Roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, organization_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#ef4444',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, name)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Client Timelines
CREATE TABLE public.client_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  client_name text NOT NULL,
  client_id text,
  start_date date NOT NULL,
  boleto_value numeric,
  due_date date,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  completed_at timestamptz,
  completion_notes text,
  organization_id uuid REFERENCES public.organizations(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.client_timelines ENABLE ROW LEVEL SECURITY;

-- Timeline Lines
CREATE TABLE public.timeline_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES public.client_timelines(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.timeline_lines ENABLE ROW LEVEL SECURITY;

-- Timeline Events
CREATE TABLE public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.timeline_lines(id) ON DELETE CASCADE,
  event_date text NOT NULL,
  event_time text,
  description text,
  position text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  icon text NOT NULL DEFAULT '💬',
  icon_size text NOT NULL DEFAULT 'text-2xl',
  event_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

-- Client Boletos
CREATE TABLE public.client_boletos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES public.client_timelines(id) ON DELETE CASCADE,
  boleto_value numeric NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  description text,
  ixc_boleto_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.client_boletos ENABLE ROW LEVEL SECURITY;

-- Unique partial index for IXC boleto deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_boletos_ixc_ref 
  ON public.client_boletos (timeline_id, ixc_boleto_id) 
  WHERE ixc_boleto_id IS NOT NULL;

-- Client Timeline Tags
CREATE TABLE public.client_timeline_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES public.client_timelines(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.client_timeline_tags ENABLE ROW LEVEL SECURITY;

-- Client Analysis History
CREATE TABLE public.client_analysis_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES public.client_timelines(id) ON DELETE CASCADE,
  analysis_data jsonb NOT NULL,
  risk_score integer NOT NULL,
  risk_level text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.client_analysis_history ENABLE ROW LEVEL SECURITY;

-- App Versions
CREATE TABLE public.app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  build_version text NOT NULL,
  build_time timestamptz NOT NULL,
  deployed_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Audit Logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  organization_id uuid REFERENCES public.organizations(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Organization Icons
CREATE TABLE public.organization_icons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  icon text NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.organization_icons ENABLE ROW LEVEL SECURITY;

-- Organization Integrations
CREATE TABLE public.organization_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  integration_type text NOT NULL DEFAULT 'ixc',
  api_url text,
  api_token text,
  api_url_contracts text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

-- Integration Sync Log
CREATE TABLE public.integration_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sync_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_records integer DEFAULT 0,
  records_processed integer DEFAULT 0,
  records_created integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.integration_sync_log ENABLE ROW LEVEL SECURITY;

-- Organization Filters
CREATE TABLE public.organization_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  page_name text NOT NULL,
  filter_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid,
  updated_by uuid,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.organization_filters ENABLE ROW LEVEL SECURITY;

-- User Preferences
CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  preference_key text NOT NULL,
  preference_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- =====================
-- FUNCTIONS
-- =====================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT organization_id FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_in_organization(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND organization_id = _org_id)
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.generate_client_sequential_id(org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  next_number INTEGER;
  new_id TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(client_id, '[^0-9]', '', 'g') AS INTEGER)), 0) + 1
  INTO next_number
  FROM client_timelines
  WHERE organization_id = org_id AND client_id IS NOT NULL AND client_id ~ '^[0-9]+$';
  new_id := LPAD(next_number::TEXT, 5, '0');
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_client_id_if_null()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.client_id IS NULL OR NEW.client_id = '' THEN
    NEW.client_id := generate_client_sequential_id(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_timeline_line_for_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.timeline_lines (timeline_id, position) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_start_date_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.start_date IS NOT NULL AND NEW.start_date != OLD.start_date THEN
    RAISE EXCEPTION 'Não é permitido alterar a data de início após a criação do cliente';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_timeline_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.client_timelines
  SET user_id = auth.uid(), updated_at = now()
  WHERE id = (SELECT timeline_id FROM public.timeline_lines WHERE id = COALESCE(NEW.line_id, OLD.line_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_tag_for_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.tags (organization_id, name, color)
  VALUES (NEW.id, 'COBRANÇA', '#ef4444')
  ON CONFLICT (organization_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_super_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.email = 'jonatanmodesto2010@gmail.com' THEN
    INSERT INTO public.super_admins (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_users(_org_id uuid)
RETURNS TABLE(user_id uuid, email text, full_name text, phone text, role app_role, user_role_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT ur.user_id, au.email, p.full_name, p.phone, ur.role, ur.id as user_role_id, ur.created_at
  FROM public.user_roles ur
  INNER JOIN auth.users au ON au.id = ur.user_id
  INNER JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.organization_id = _org_id
  ORDER BY ur.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.add_user_to_organization(_user_id uuid, _organization_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Sem permissão para adicionar usuários';
  END IF;
  IF NOT user_in_organization(auth.uid(), _organization_id) THEN
    RAISE EXCEPTION 'Você não pertence a esta organização';
  END IF;
  UPDATE public.profiles SET organization_id = _organization_id WHERE id = _user_id;
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (_user_id, _organization_id, _role)
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  new_org_id UUID;
  user_name TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'full_name')::text, 'Usuário'));

  IF public.is_super_admin(NEW.id) THEN RETURN NEW; END IF;

  IF (NEW.raw_user_meta_data->>'created_by_admin')::boolean IS TRUE THEN
    UPDATE public.profiles SET organization_id = (NEW.raw_user_meta_data->>'organization_id')::uuid WHERE id = NEW.id;
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'organization_id')::uuid, (NEW.raw_user_meta_data->>'role')::app_role);
    RETURN NEW;
  END IF;

  user_name := COALESCE((NEW.raw_user_meta_data->>'full_name')::text, 'Usuário');
  INSERT INTO public.organizations (name) VALUES (user_name || '''s Organization') RETURNING id INTO new_org_id;
  UPDATE public.profiles SET organization_id = new_org_id WHERE id = NEW.id;
  INSERT INTO public.user_roles (user_id, organization_id, role) VALUES (NEW.id, new_org_id, 'owner');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.user_id = auth.uid() AND OLD.role != NEW.role THEN
    RAISE EXCEPTION 'Users cannot modify their own role';
  END IF;
  IF NEW.role = 'owner' AND NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owners can assign owner role';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.batch_upsert_boletos(p_ids uuid[], p_values numeric[], p_dates date[], p_statuses text[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE client_boletos SET
    boleto_value = d.val, due_date = d.dd, status = d.st, updated_at = now()
  FROM unnest(p_ids, p_values, p_dates, p_statuses) AS d(id, val, dd, st)
  WHERE client_boletos.id = d.id;
$$;

CREATE OR REPLACE FUNCTION public.batch_upsert_clients(p_ids uuid[], p_names text[], p_active boolean[], p_statuses text[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE client_timelines SET
    client_name = d.nm, is_active = d.act, status = d.st, updated_at = now()
  FROM unnest(p_ids, p_names, p_active, p_statuses) AS d(id, nm, act, st)
  WHERE client_timelines.id = d.id;
$$;

-- =====================
-- TRIGGERS (apply after creating tables)
-- =====================

-- Note: These triggers reference auth.users which is managed by Supabase Auth.
-- The trigger on auth.users (handle_new_user_complete, ensure_super_admin) 
-- must be created AFTER Supabase Auth is configured.

-- Trigger: auto-set client_id
CREATE TRIGGER set_client_id_trigger
  BEFORE INSERT ON public.client_timelines
  FOR EACH ROW EXECUTE FUNCTION public.set_client_id_if_null();

-- Trigger: auto-create timeline line
CREATE TRIGGER create_timeline_line_trigger
  AFTER INSERT ON public.client_timelines
  FOR EACH ROW EXECUTE FUNCTION public.create_timeline_line_for_client();

-- Trigger: prevent start_date change
CREATE TRIGGER prevent_start_date_change_trigger
  BEFORE UPDATE ON public.client_timelines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_start_date_change();

-- Trigger: update_updated_at on client_timelines
CREATE TRIGGER update_client_timelines_updated_at
  BEFORE UPDATE ON public.client_timelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update_updated_at on tags
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: update_updated_at on organization_integrations
CREATE TRIGGER update_organization_integrations_updated_at
  BEFORE UPDATE ON public.organization_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: audit on timeline_events
CREATE TRIGGER update_timeline_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.update_timeline_audit();

-- Trigger: default tag on new org
CREATE TRIGGER create_default_tag_trigger
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_default_tag_for_organization();

-- Trigger: prevent self role escalation
CREATE TRIGGER prevent_self_role_escalation_trigger
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

-- Auth triggers (run in Supabase SQL editor):
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_complete();
-- CREATE TRIGGER ensure_super_admin_trigger AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.ensure_super_admin();

-- =====================
-- RLS POLICIES
-- =====================

-- Organizations
CREATE POLICY "Users can view their organization" ON public.organizations FOR SELECT USING (user_in_organization(auth.uid(), id));
CREATE POLICY "Owners and admins can update organization" ON public.organizations FOR UPDATE USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only owners can delete organizations" ON public.organizations FOR DELETE USING (has_role(auth.uid(), 'owner'::app_role) AND user_in_organization(auth.uid(), id));
CREATE POLICY "Super admins can create organizations" ON public.organizations FOR INSERT WITH CHECK (is_super_admin(auth.uid()));

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Deny viewing other profiles" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profiles are created via trigger only" ON public.profiles FOR INSERT WITH CHECK (false);
CREATE POLICY "Profiles cannot be deleted" ON public.profiles FOR DELETE USING (false);

-- Super Admins
CREATE POLICY "Super admins can view themselves" ON public.super_admins FOR SELECT USING (user_id = auth.uid());

-- User Roles
CREATE POLICY "Users can view roles with restrictions" ON public.user_roles FOR SELECT USING ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR (user_id = auth.uid())));
CREATE POLICY "Owners and admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Owners and admins can update roles" ON public.user_roles FOR UPDATE USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users cannot modify their own role" ON public.user_roles FOR UPDATE USING (user_id <> auth.uid());
CREATE POLICY "Owners and admins can delete roles" ON public.user_roles FOR DELETE USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));

-- Tags
CREATE POLICY "Users can view tags in their organization" ON public.tags FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Owners and admins can insert tags" ON public.tags FOR INSERT WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Owners and admins can update tags" ON public.tags FOR UPDATE USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Owners and admins can delete tags" ON public.tags FOR DELETE USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));

-- Client Timelines
CREATE POLICY "Users can view timelines in their organization" ON public.client_timelines FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Users can insert timelines in their organization" ON public.client_timelines FOR INSERT WITH CHECK (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Members can update all timelines in organization" ON public.client_timelines FOR UPDATE USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Members can delete all timelines in organization" ON public.client_timelines FOR DELETE USING (organization_id = get_user_organization(auth.uid()));

-- Timeline Lines
CREATE POLICY "Members can view lines from organization timelines" ON public.timeline_lines FOR SELECT USING (EXISTS (SELECT 1 FROM client_timelines WHERE client_timelines.id = timeline_lines.timeline_id AND client_timelines.organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Members can manage lines from organization timelines" ON public.timeline_lines FOR ALL USING (EXISTS (SELECT 1 FROM client_timelines WHERE client_timelines.id = timeline_lines.timeline_id AND client_timelines.organization_id = get_user_organization(auth.uid())));

-- Timeline Events
CREATE POLICY "Members can view events from organization timelines" ON public.timeline_events FOR SELECT USING (EXISTS (SELECT 1 FROM timeline_lines JOIN client_timelines ON client_timelines.id = timeline_lines.timeline_id WHERE timeline_lines.id = timeline_events.line_id AND client_timelines.organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Members can manage events from organization timelines" ON public.timeline_events FOR ALL USING (EXISTS (SELECT 1 FROM timeline_lines JOIN client_timelines ON client_timelines.id = timeline_lines.timeline_id WHERE timeline_lines.id = timeline_events.line_id AND client_timelines.organization_id = get_user_organization(auth.uid())));

-- Client Boletos
CREATE POLICY "Users can view boletos from their organization" ON public.client_boletos FOR SELECT USING (EXISTS (SELECT 1 FROM client_timelines ct WHERE ct.id = client_boletos.timeline_id AND ct.organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can manage boletos from their organization" ON public.client_boletos FOR ALL USING (EXISTS (SELECT 1 FROM client_timelines ct WHERE ct.id = client_boletos.timeline_id AND ct.organization_id = get_user_organization(auth.uid())));

-- Client Timeline Tags
CREATE POLICY "Users can view timeline tags in their organization" ON public.client_timeline_tags FOR SELECT USING (EXISTS (SELECT 1 FROM client_timelines ct WHERE ct.id = client_timeline_tags.timeline_id AND ct.organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Members can manage timeline tags in their organization" ON public.client_timeline_tags FOR ALL USING (EXISTS (SELECT 1 FROM client_timelines ct WHERE ct.id = client_timeline_tags.timeline_id AND ct.organization_id = get_user_organization(auth.uid())));

-- Client Analysis History
CREATE POLICY "Users can view analysis from their organization" ON public.client_analysis_history FOR SELECT USING (EXISTS (SELECT 1 FROM client_timelines ct WHERE ct.id = client_analysis_history.timeline_id AND ct.organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can create analysis for their organization" ON public.client_analysis_history FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM client_timelines ct WHERE ct.id = client_analysis_history.timeline_id AND ct.organization_id = get_user_organization(auth.uid())));

-- Audit Logs
CREATE POLICY "Users can view audit logs from their organization" ON public.audit_logs FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Users can insert audit logs for their organization" ON public.audit_logs FOR INSERT WITH CHECK (organization_id = get_user_organization(auth.uid()));

-- App Versions
CREATE POLICY "Only super admins can read versions" ON public.app_versions FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "Service role can manage versions" ON public.app_versions FOR ALL USING (true) WITH CHECK (true);

-- Organization Icons
CREATE POLICY "Users can view icons from their organization" ON public.organization_icons FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Admins can insert icons" ON public.organization_icons FOR INSERT WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Admins can delete icons" ON public.organization_icons FOR DELETE USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) AND (organization_id = get_user_organization(auth.uid())));

-- Organization Integrations
CREATE POLICY "Owners and admins can view integrations" ON public.organization_integrations FOR SELECT USING ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Owners and admins can insert integrations" ON public.organization_integrations FOR INSERT WITH CHECK ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Owners and admins can update integrations" ON public.organization_integrations FOR UPDATE USING ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Owners can delete integrations" ON public.organization_integrations FOR DELETE USING ((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'owner'::app_role));

-- Integration Sync Log
CREATE POLICY "Users can view sync logs from their organization" ON public.integration_sync_log FOR SELECT USING (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Members can cancel sync logs" ON public.integration_sync_log FOR UPDATE USING (organization_id = get_user_organization(auth.uid())) WITH CHECK (organization_id = get_user_organization(auth.uid()));
CREATE POLICY "Service role can manage sync logs" ON public.integration_sync_log FOR ALL USING (true) WITH CHECK (true);

-- Organization Filters
CREATE POLICY "Users can view their own filters" ON public.organization_filters FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage their own filters" ON public.organization_filters FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- User Preferences
CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own preferences" ON public.user_preferences FOR DELETE USING (user_id = auth.uid());

-- =====================
-- REALTIME (if needed)
-- =====================
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.app_versions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_sync_log;
