
-- Collection rules table
CREATE TABLE public.collection_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_days INTEGER NOT NULL, -- negative = before due, positive = after due
  action_type TEXT NOT NULL DEFAULT 'reminder', -- reminder, warning, escalation, block
  message_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.collection_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rules from their organization"
  ON public.collection_rules FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Owners and admins can insert rules"
  ON public.collection_rules FOR INSERT
  WITH CHECK (organization_id = get_user_organization(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

CREATE POLICY "Owners and admins can update rules"
  ON public.collection_rules FOR UPDATE
  USING (organization_id = get_user_organization(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

CREATE POLICY "Owners and admins can delete rules"
  ON public.collection_rules FOR DELETE
  USING (organization_id = get_user_organization(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- Collection actions (generated from rules)
CREATE TABLE public.collection_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL REFERENCES public.client_timelines(id) ON DELETE CASCADE,
  boleto_id UUID REFERENCES public.client_boletos(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES public.collection_rules(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_date DATE NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, done, skipped
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.collection_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view actions from their organization"
  ON public.collection_actions FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can update actions from their organization"
  ON public.collection_actions FOR UPDATE
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Service role can manage actions"
  ON public.collection_actions FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_collection_actions_timeline ON public.collection_actions(timeline_id);
CREATE INDEX idx_collection_actions_date ON public.collection_actions(action_date);
CREATE INDEX idx_collection_actions_status ON public.collection_actions(status);
