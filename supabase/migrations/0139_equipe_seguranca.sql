-- 0139 — Segurança de cada pessoa da equipe na tela Equipe (como no Atria Track):
-- se já entra com e-mail e senha e se tem verificação em duas etapas.
-- Só para quem é administrador ou dono (mesma regra da lista da equipe).

create or replace function public.equipe_seguranca()
returns table(id uuid, email text, senha_propria boolean, tem_2fa boolean)
language sql
stable security definer
set search_path to ''
as $$
  select p.id,
         case when u.email like '%.invalid' then null else u.email end,
         coalesce((u.raw_app_meta_data ->> 'senha_propria')::boolean, false),
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.eh_admin()
     and p.papel in ('dono', 'admin', 'suporte');
$$;

revoke execute on function public.equipe_seguranca() from anon, public;
grant execute on function public.equipe_seguranca() to authenticated;
