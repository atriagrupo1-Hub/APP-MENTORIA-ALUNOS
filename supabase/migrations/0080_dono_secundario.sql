-- Dono principal e donos secundários.
-- O principal (o dono original) controla tudo e é o único que adiciona,
-- edita, bloqueia ou remove outro dono. O dono secundário controla tudo,
-- menos o que o principal desmarcar: adicionar membro, remover membro,
-- mudar código e mudar nome.

alter table public.profiles
  add column if not exists dono_principal boolean not null default false,
  add column if not exists pode_adicionar boolean not null default true,
  add column if not exists pode_remover boolean not null default true,
  add column if not exists pode_codigo boolean not null default true,
  add column if not exists pode_nome boolean not null default true;

update public.profiles set dono_principal = true where id = '51ed8977-1512-4249-b305-096ed56a94e2' and papel = 'dono';
create unique index if not exists um_dono_principal on public.profiles (dono_principal) where dono_principal;

-- Quem chama é o dono principal?
create or replace function public.eh_dono_principal()
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from profiles where id = auth.uid() and papel = 'dono' and dono_principal and status = 'ativa');
$$;

-- Quem chama pode fazer isto na equipe? ('adicionar' | 'remover' | 'codigo' | 'nome')
-- Dono principal: sempre. Dono secundário: se estiver marcado. Os outros: não.
create or replace function public.dono_pode(p_o text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce((
    select case when p.dono_principal then true
                when p_o = 'adicionar' then p.pode_adicionar
                when p_o = 'remover' then p.pode_remover
                when p_o = 'codigo' then p.pode_codigo
                when p_o = 'nome' then p.pode_nome
                else false end
      from profiles p where p.id = auth.uid() and p.papel = 'dono' and p.status = 'ativa'), false);
$$;

-- Quem cada um gere: o principal gere os outros donos, administradores e
-- suporte; o dono secundário, administradores e suporte; o administrador, suporte.
create or replace function public.pode_gerir(p_id uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select p_id is distinct from auth.uid() and case
    when eh_dono_principal() then exists (select 1 from profiles where id = p_id and papel in ('dono', 'admin', 'suporte') and not dono_principal)
    when eh_dono() then exists (select 1 from profiles where id = p_id and papel in ('admin', 'suporte'))
    when eh_admin() then exists (select 1 from profiles where id = p_id and papel = 'suporte')
    else false
  end;
$$;

-- Código: dono secundário sem "mudar código" não troca código de ninguém da equipe (nem o seu).
create or replace function public.mudar_codigo(p_id uuid, p_codigo text)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not (p_id = auth.uid() or pode_gerir(p_id) or (eh_equipe() and eh_aluna(p_id))) then
    return false;
  end if;
  if eh_dono() and not dono_pode('codigo') and not eh_aluna(p_id) then return false; end if;
  if p_codigo !~ '^[0-9]{4,6}$' then return false; end if;
  update credenciais
     set codigo = p_codigo, codigo_definido_em = now(), tentativas_erradas = 0, travada_ate = null
   where aluna_id = p_id;
  return found;
end;
$function$;

create or replace function public.editar_colaborador(p_id uuid, p_nome text, p_login text, p_papel papel_usuario, p_codigo text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_login text := regexp_replace(lower(btrim(coalesce(p_login, ''))), '\s+', ' ', 'g');
  v_atual profiles%rowtype;
  v_gere  boolean := pode_gerir(p_id);
begin
  select * into v_atual from profiles where id = p_id and papel in ('dono', 'admin', 'suporte');
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
  if not (p_id = auth.uid() or v_gere) then raise exception 'sem_permissao'; end if;

  if length(v_nome) not between 2 and 80 then raise exception 'nome_invalido'; end if;
  if length(v_login) not between 2 and 40
     or v_login !~ '^[a-z0-9._-]+( [a-z0-9._-]+)*$' then
    raise exception 'login_invalido';
  end if;
  if exists (select 1 from profiles where login = v_login and id <> p_id) then
    raise exception 'login_em_uso';
  end if;
  if (v_nome <> v_atual.nome or v_login <> v_atual.login) and eh_dono() and not dono_pode('nome') then
    raise exception 'sem_permissao';
  end if;

  if p_papel is distinct from v_atual.papel then
    if not v_gere then raise exception 'sem_permissao'; end if;
    if p_papel not in ('dono', 'admin', 'suporte') then raise exception 'papel_invalido'; end if;
    if (p_papel = 'dono' or v_atual.papel = 'dono') and not eh_dono_principal() then raise exception 'sem_permissao'; end if;
    if p_papel = 'admin' and not eh_dono() then raise exception 'sem_permissao'; end if;
  end if;

  if coalesce(p_codigo, '') <> '' then
    if p_codigo !~ '^[0-9]{4,6}$' then raise exception 'codigo_invalido'; end if;
    if eh_dono() and not dono_pode('codigo') and exists (select 1 from credenciais where aluna_id = p_id and codigo <> p_codigo) then
      raise exception 'sem_permissao';
    end if;
    update credenciais
       set codigo = p_codigo, codigo_definido_em = now(),
           tentativas_erradas = 0, travada_ate = null
     where aluna_id = p_id and codigo <> p_codigo;
  end if;

  update profiles
     set nome = v_nome, login = v_login, papel = coalesce(p_papel, v_atual.papel)
   where id = p_id;
end;
$function$;

-- O que o dono secundário pode fazer: só o principal marca.
create or replace function public.definir_permissoes_dono(p_id uuid, p_adicionar boolean, p_remover boolean, p_codigo boolean, p_nome boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not eh_dono_principal() then raise exception 'sem_permissao'; end if;
  update profiles
     set pode_adicionar = p_adicionar, pode_remover = p_remover, pode_codigo = p_codigo, pode_nome = p_nome
   where id = p_id and papel = 'dono' and not dono_principal;
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
end;
$function$;
revoke all on function public.definir_permissoes_dono(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.definir_permissoes_dono(uuid, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.bloquear_colaborador(p_id uuid, p_status status_conta)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_id = auth.uid() then raise exception 'nao_bloqueia_a_si_mesmo'; end if;
  if not pode_gerir(p_id) then raise exception 'sem_permissao'; end if;
  update profiles set status = p_status
   where id = p_id and papel in ('dono', 'admin', 'suporte') and not dono_principal;
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
end;
$function$;

create or replace function public.remover_colaborador(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not eh_dono() or not dono_pode('remover') then raise exception 'sem_permissao'; end if;
  if p_id = auth.uid() then raise exception 'nao_remove_a_si_mesmo'; end if;
  if not pode_gerir(p_id) then raise exception 'sem_permissao'; end if;
  delete from profiles where id = p_id and papel in ('dono', 'admin', 'suporte') and not dono_principal;
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
end;
$function$;

drop function if exists public.equipe_do_painel();
create function public.equipe_do_painel()
 returns table(id uuid, nome text, login text, papel papel_usuario, status status_conta, codigo text, criada_em timestamptz, ultimo_acesso_em timestamptz, sou_eu boolean,
               dono_principal boolean, pode_adicionar boolean, pode_remover boolean, pode_codigo boolean, pode_nome boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.nome, p.login, p.papel, p.status,
         case when p.id = auth.uid() or pode_gerir(p.id) then c.codigo end,
         p.criada_em, p.ultimo_acesso_em,
         p.id = auth.uid(),
         p.dono_principal, p.pode_adicionar, p.pode_remover, p.pode_codigo, p.pode_nome
  from profiles p
  left join credenciais c on c.aluna_id = p.id
  where eh_admin()
    and p.papel in ('dono', 'admin', 'suporte')
  order by case when p.dono_principal then 0 when p.papel = 'dono' then 1 when p.papel = 'admin' then 2 else 3 end, p.nome;
$function$;
revoke all on function public.equipe_do_painel() from public, anon;
grant execute on function public.equipe_do_painel() to authenticated;

revoke all on function public.eh_dono_principal() from public, anon;
grant execute on function public.eh_dono_principal() to authenticated;
revoke all on function public.dono_pode(text) from public, anon;
grant execute on function public.dono_pode(text) to authenticated;

-- Escrita direta na equipe e nos códigos dela: só o dono principal (o
-- secundário passa pelas funções acima, que conferem as permissões).
drop policy if exists perfil_equipe_escrita on public.profiles;
create policy perfil_equipe_escrita on public.profiles for all using (eh_dono_principal()) with check (eh_dono_principal());
drop policy if exists credenciais_equipe_escrita on public.credenciais;
create policy credenciais_equipe_escrita on public.credenciais for all using (eh_dono_principal()) with check (eh_dono_principal());
-- Leitura de código: o próprio, o das alunas (equipe) e o de quem a pessoa gere.
drop policy if exists credenciais_leitura on public.credenciais;
create policy credenciais_leitura on public.credenciais for select
  using (aluna_id = auth.uid() or (eh_equipe() and eh_aluna(aluna_id)) or pode_gerir(aluna_id));
