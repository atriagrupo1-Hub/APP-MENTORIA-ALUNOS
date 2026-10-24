-- Abas do painel que um dono secundário não acessa (ele vê no menu, com cadeado).
alter table public.profiles add column if not exists abas_bloqueadas text[] not null default '{}';

-- A aba está liberada para quem chama? Hoje só o dono secundário tem abas bloqueadas.
create or replace function public.aba_liberada(p_aba text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select not exists (
    select 1 from profiles
     where id = auth.uid() and papel = 'dono' and not dono_principal and p_aba = any(abas_bloqueadas));
$$;
revoke all on function public.aba_liberada(text) from public, anon;
grant execute on function public.aba_liberada(text) to authenticated;

drop function if exists public.definir_permissoes_dono(uuid, boolean, boolean, boolean, boolean);
create or replace function public.definir_permissoes_dono(p_id uuid, p_adicionar boolean, p_remover boolean, p_codigo boolean, p_nome boolean, p_abas_bloqueadas text[] default '{}')
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not eh_dono_principal() then raise exception 'sem_permissao'; end if;
  update profiles
     set pode_adicionar = p_adicionar, pode_remover = p_remover, pode_codigo = p_codigo, pode_nome = p_nome,
         abas_bloqueadas = coalesce(p_abas_bloqueadas, '{}')
   where id = p_id and papel = 'dono' and not dono_principal;
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
end;
$function$;
revoke all on function public.definir_permissoes_dono(uuid, boolean, boolean, boolean, boolean, text[]) from public, anon;
grant execute on function public.definir_permissoes_dono(uuid, boolean, boolean, boolean, boolean, text[]) to authenticated;

-- Equipe bloqueada: não gere ninguém.
create or replace function public.pode_gerir(p_id uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select p_id is distinct from auth.uid() and aba_liberada('equipe') and case
    when eh_dono_principal() then exists (select 1 from profiles where id = p_id and papel in ('dono', 'admin', 'suporte') and not dono_principal)
    when eh_dono() then exists (select 1 from profiles where id = p_id and papel in ('admin', 'suporte'))
    when eh_admin() then exists (select 1 from profiles where id = p_id and papel = 'suporte')
    else false
  end;
$$;

-- Registro bloqueado: não lê nem apaga.
drop policy if exists historico_le on public.historico_acoes;
create policy historico_le on public.historico_acoes for select
  using ((eh_dono() and aba_liberada('registro')) or (eh_equipe() and aluna_id is not null));
drop policy if exists historico_apaga on public.historico_acoes;
create policy historico_apaga on public.historico_acoes for delete using (eh_dono() and aba_liberada('registro'));
drop policy if exists sessoes_le on public.sessoes_painel;
create policy sessoes_le on public.sessoes_painel for select using (eh_dono() and aba_liberada('registro'));
drop policy if exists sessoes_apaga on public.sessoes_painel;
create policy sessoes_apaga on public.sessoes_painel for delete using (eh_dono() and aba_liberada('registro'));

drop function if exists public.equipe_do_painel();
create function public.equipe_do_painel()
 returns table(id uuid, nome text, login text, papel papel_usuario, status status_conta, codigo text, criada_em timestamptz, ultimo_acesso_em timestamptz, sou_eu boolean,
               dono_principal boolean, pode_adicionar boolean, pode_remover boolean, pode_codigo boolean, pode_nome boolean, cor_perfil text, abas_bloqueadas text[])
 language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.nome, p.login, p.papel, p.status,
         case when p.id = auth.uid() or pode_gerir(p.id) then c.codigo end,
         p.criada_em, p.ultimo_acesso_em,
         p.id = auth.uid(),
         p.dono_principal, p.pode_adicionar, p.pode_remover, p.pode_codigo, p.pode_nome, p.cor_perfil, p.abas_bloqueadas
  from profiles p
  left join credenciais c on c.aluna_id = p.id
  where eh_admin()
    and p.papel in ('dono', 'admin', 'suporte')
  order by case when p.dono_principal then 0 when p.papel = 'dono' then 1 when p.papel = 'admin' then 2 else 3 end, p.nome;
$function$;
revoke all on function public.equipe_do_painel() from public, anon;
grant execute on function public.equipe_do_painel() to authenticated;
