-- Execute este SQL no Supabase antes de publicar a versão com login.
-- Ele não altera nem apaga dados atuais de viagens.
-- Crie os usuários em Authentication > Users e depois insira/ajuste o perfil em public.user_profiles.

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text,
  email text not null,
  role text not null default 'visualizador' check (role in ('admin', 'operador', 'visualizador')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists user_profiles_user_id_idx on public.user_profiles(user_id);
create index if not exists user_profiles_email_idx on public.user_profiles(email);

alter table public.user_profiles enable row level security;

drop policy if exists "Usuário visualiza o próprio perfil" on public.user_profiles;
create policy "Usuário visualiza o próprio perfil"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admin visualiza perfis" on public.user_profiles;
create policy "Admin visualiza perfis"
on public.user_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles admin_profile
    where admin_profile.user_id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.ativo = true
  )
);

drop policy if exists "Admin atualiza perfis" on public.user_profiles;
create policy "Admin atualiza perfis"
on public.user_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles admin_profile
    where admin_profile.user_id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.ativo = true
  )
)
with check (
  exists (
    select 1
    from public.user_profiles admin_profile
    where admin_profile.user_id = auth.uid()
      and admin_profile.role = 'admin'
      and admin_profile.ativo = true
  )
);

-- Exemplo de perfil inicial, execute após criar o usuário no Supabase Auth:
-- insert into public.user_profiles (user_id, nome, email, role, ativo)
-- values ('UUID_DO_AUTH_USER', 'Administrador', 'admin@empresa.com', 'admin', true)
-- on conflict (user_id) do update
-- set nome = excluded.nome,
--     email = excluded.email,
--     role = excluded.role,
--     ativo = excluded.ativo;
