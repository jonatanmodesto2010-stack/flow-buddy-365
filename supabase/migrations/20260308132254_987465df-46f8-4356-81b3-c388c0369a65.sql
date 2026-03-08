
-- Agreements table
CREATE TABLE public.client_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL REFERENCES public.client_timelines(id) ON DELETE CASCADE,
  original_debt NUMERIC NOT NULL,
  agreed_value NUMERIC NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  installments_count INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, broken, cancelled
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.client_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view agreements from their organization"
  ON public.client_agreements FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can insert agreements in their organization"
  ON public.client_agreements FOR INSERT
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can update agreements in their organization"
  ON public.client_agreements FOR UPDATE
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can delete agreements in their organization"
  ON public.client_agreements FOR DELETE
  USING (organization_id = get_user_organization(auth.uid()));

-- Installments table
CREATE TABLE public.agreement_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.client_agreements(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  value NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, overdue
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.agreement_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view installments via agreement"
  ON public.agreement_installments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_agreements ca
    WHERE ca.id = agreement_installments.agreement_id
    AND ca.organization_id = get_user_organization(auth.uid())
  ));

CREATE POLICY "Users can insert installments via agreement"
  ON public.agreement_installments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_agreements ca
    WHERE ca.id = agreement_installments.agreement_id
    AND ca.organization_id = get_user_organization(auth.uid())
  ));

CREATE POLICY "Users can update installments via agreement"
  ON public.agreement_installments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.client_agreements ca
    WHERE ca.id = agreement_installments.agreement_id
    AND ca.organization_id = get_user_organization(auth.uid())
  ));

CREATE POLICY "Users can delete installments via agreement"
  ON public.agreement_installments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.client_agreements ca
    WHERE ca.id = agreement_installments.agreement_id
    AND ca.organization_id = get_user_organization(auth.uid())
  ));

CREATE INDEX idx_agreement_installments_agreement ON public.agreement_installments(agreement_id);
CREATE INDEX idx_agreement_installments_due_date ON public.agreement_installments(due_date);
CREATE INDEX idx_client_agreements_timeline ON public.client_agreements(timeline_id);
