CREATE OR REPLACE FUNCTION public.get_user_display_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.full_name, 'Sistema')
  FROM public.profiles p
  WHERE p.id = _user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur1
        JOIN public.user_roles ur2 ON ur1.organization_id = ur2.organization_id
        WHERE ur1.user_id = auth.uid() AND ur2.user_id = _user_id
      )
      OR is_super_admin(auth.uid())
    )
$$;