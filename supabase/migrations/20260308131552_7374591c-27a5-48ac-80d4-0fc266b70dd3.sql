
DROP POLICY "Service role can manage actions" ON public.collection_actions;

CREATE POLICY "Users can insert actions from their organization"
  ON public.collection_actions FOR INSERT
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Users can delete actions from their organization"
  ON public.collection_actions FOR DELETE
  USING (organization_id = get_user_organization(auth.uid()));
