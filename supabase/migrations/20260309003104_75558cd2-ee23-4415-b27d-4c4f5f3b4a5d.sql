-- Bootstrap inicial do sistema: Criar Super Admin e primeira organização

-- 1. Criar usuário Super Admin
-- Nota: Em produção, isso seria feito via admin.createUser, 
-- mas para bootstrap inicial, vamos inserir diretamente

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role,
  aud,
  confirmation_token,
  email_change_token_new,
  recovery_token
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'jonatanmodesto2010@gmail.com',
  crypt('AdminPass123!', gen_salt('bf', 10)), -- Senha temporária forte
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Super Admin","bootstrap_user":true}',
  false,
  'authenticated',
  'authenticated',
  '',
  '',
  ''
);

-- 2. Criar primeira organização
INSERT INTO public.organizations (
  id,
  name,
  plan,
  max_users,
  max_clients,
  status
) VALUES (
  gen_random_uuid(),
  'Organização Principal',
  'enterprise',
  50,
  1000,
  'active'
);