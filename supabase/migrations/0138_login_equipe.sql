-- 0138 — Login da equipe com e-mail e senha, recuperação por e-mail e
-- verificação em duas etapas (2FA).
--
-- Quem tem 2FA ativo só é "equipe" para o banco quando a sessão passou
-- pelo segundo passo (aal2). Sem isso, a senha sozinha não abre nada:
-- a tela pede o código, mas quem decide é o banco.
-- Alunos nunca ativam 2FA, então nada muda para eles.

create or replace function public.equipe_aal_ok()
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;

create or replace function public.eh_equipe()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and papel in ('dono', 'admin', 'suporte')
      and status = 'ativa'
  ) and equipe_aal_ok();
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and papel in ('dono', 'admin') and status = 'ativa'
  ) and equipe_aal_ok();
$$;

create or replace function public.eh_dono()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and papel = 'dono' and status = 'ativa'
  ) and equipe_aal_ok();
$$;

create or replace function public.eh_dono_principal()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (select 1 from profiles where id = auth.uid() and papel = 'dono' and dono_principal and status = 'ativa')
     and equipe_aal_ok();
$$;

create or replace function public.dono_pode(p_o text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select equipe_aal_ok() and coalesce((
    select case when p.dono_principal then true
                when p_o = 'adicionar' then p.pode_adicionar
                when p_o = 'remover' then p.pode_remover
                when p_o = 'codigo' then p.pode_codigo
                when p_o = 'nome' then p.pode_nome
                else false end
      from profiles p where p.id = auth.uid() and p.papel = 'dono' and p.status = 'ativa'), false);
$$;

create or replace function public.pode(p_acao text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select eh_admin() or (equipe_aal_ok() and exists (
    select 1 from profiles
     where id = auth.uid() and papel = 'suporte' and status = 'ativa' and p_acao = any(permissoes)
       and aba_liberada(case split_part(p_acao, '_', 1) when 'al' then 'alunas' when 'eng' then 'engajamento'
             when 'com' then 'comentarios' when 'cur' then 'cursos' when 'cat' then 'layout' else '-' end)));
$$;

revoke execute on function public.equipe_aal_ok() from anon;
