-- Meu perfil (painel): cor do círculo da foto, uma cor ou um degradê de duas.
alter table public.profiles add column if not exists cor_perfil text;
alter table public.profiles drop constraint if exists cor_perfil_valida;
alter table public.profiles add constraint cor_perfil_valida
  check (cor_perfil is null or cor_perfil ~ '^#[0-9a-f]{6}(,#[0-9a-f]{6})?$');

-- Cada pessoa da equipe muda só a própria cor.
create or replace function public.salvar_minha_cor(p_cor text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if p_cor is not null and lower(p_cor) !~ '^#[0-9a-f]{6}(,#[0-9a-f]{6})?$' then raise exception 'cor_invalida'; end if;
  update profiles set cor_perfil = lower(p_cor) where id = auth.uid();
end;
$function$;
revoke all on function public.salvar_minha_cor(text) from public, anon;
grant execute on function public.salvar_minha_cor(text) to authenticated;

drop function if exists public.equipe_do_painel();
create function public.equipe_do_painel()
 returns table(id uuid, nome text, login text, papel papel_usuario, status status_conta, codigo text, criada_em timestamptz, ultimo_acesso_em timestamptz, sou_eu boolean,
               dono_principal boolean, pode_adicionar boolean, pode_remover boolean, pode_codigo boolean, pode_nome boolean, cor_perfil text)
 language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.nome, p.login, p.papel, p.status,
         case when p.id = auth.uid() or pode_gerir(p.id) then c.codigo end,
         p.criada_em, p.ultimo_acesso_em,
         p.id = auth.uid(),
         p.dono_principal, p.pode_adicionar, p.pode_remover, p.pode_codigo, p.pode_nome, p.cor_perfil
  from profiles p
  left join credenciais c on c.aluna_id = p.id
  where eh_admin()
    and p.papel in ('dono', 'admin', 'suporte')
  order by case when p.dono_principal then 0 when p.papel = 'dono' then 1 when p.papel = 'admin' then 2 else 3 end, p.nome;
$function$;
revoke all on function public.equipe_do_painel() from public, anon;
grant execute on function public.equipe_do_painel() to authenticated;
