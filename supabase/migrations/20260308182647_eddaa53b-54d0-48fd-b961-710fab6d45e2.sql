
-- 1. Tabela de Planos
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  max_users integer NOT NULL DEFAULT 5,
  max_clients integer NOT NULL DEFAULT 100,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  trial_days integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Super admins podem gerenciar planos
CREATE POLICY "Super admins can manage plans" ON public.plans
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Todos autenticados podem ver planos ativos
CREATE POLICY "Authenticated users can view active plans" ON public.plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- 2. Tabela de Assinaturas
CREATE TABLE public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'trial',
  monthly_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  trial_ends_at timestamptz,
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz,
  canceled_at timestamptz,
  suspended_at timestamptz,
  gateway_customer_id text,
  gateway_subscription_id text,
  payment_gateway text DEFAULT 'manual',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admins podem gerenciar todas as assinaturas
CREATE POLICY "Super admins can manage subscriptions" ON public.organization_subscriptions
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Owners/admins da org podem ver sua assinatura
CREATE POLICY "Org members can view their subscription" ON public.organization_subscriptions
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization(auth.uid()));

-- 3. Tabela de Faturas
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.organization_subscriptions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  discount_amount numeric DEFAULT 0,
  final_amount numeric NOT NULL,
  due_date date NOT NULL,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  reference_month text,
  gateway_invoice_id text,
  gateway_payment_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization(auth.uid()));

-- 4. Tabela de Pagamentos
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'manual',
  payment_gateway text,
  gateway_transaction_id text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'confirmed',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their payments" ON public.payments
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization(auth.uid()));

-- 5. Índices de performance
CREATE INDEX idx_org_subscriptions_org_id ON public.organization_subscriptions(organization_id);
CREATE INDEX idx_org_subscriptions_status ON public.organization_subscriptions(status);
CREATE INDEX idx_invoices_org_id ON public.invoices(organization_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX idx_payments_org_id ON public.payments(organization_id);

-- 6. Inserir planos padrão
INSERT INTO public.plans (name, slug, description, monthly_price, max_users, max_clients, features, sort_order, trial_days) VALUES
('Básico', 'basico', 'Ideal para pequenos provedores', 99.90, 3, 50, '["Timeline de cobrança", "Sincronização IXC", "Relatórios básicos"]'::jsonb, 1, 7),
('Profissional', 'profissional', 'Para provedores em crescimento', 199.90, 10, 200, '["Timeline de cobrança", "Sincronização IXC", "Relatórios avançados", "Análise IA", "Acordos", "Regras de cobrança"]'::jsonb, 2, 7),
('Premium', 'premium', 'Para grandes provedores', 349.90, 30, 1000, '["Timeline de cobrança", "Sincronização IXC", "Relatórios avançados", "Análise IA", "Acordos", "Regras de cobrança", "API externa", "Suporte prioritário"]'::jsonb, 3, 14);

-- 7. Trigger para updated_at
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
