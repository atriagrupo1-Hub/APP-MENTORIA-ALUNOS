-- =====================================================================
-- 0145 — CENTRAL (Painel Geral): de onde se entra em todos os painéis
--
-- Reaproveita o que já existe (nada é apagado nem duplicado):
--   login e-mail/senha e convites por link (0144, `convites_equipe`,
--   tratados na `entrar`), `usuarios_bloqueados` + regra RESTRITIVA,
--   `eh_dono()`, a Edge Function `colaboradores`, as funções (cargos)
--   de `profiles.funcao` e as mensagens em `configuracoes.mensagens_convite`.
--
-- Novo:
--   paineis           — cadastro dos painéis (para adicionar sem mexer no código)
--   acessos_painel    — o que cada pessoa acessa: ver | editar | admin, e bloqueio por painel
--                       (painel_slug 'central' com nivel 'admin' = Admin da Central)
--   historico_central — quem entrou em qual painel e as mudanças importantes
--   tem_acesso_painel(slug, nivel), usuario_bloqueado(), registrar_entrada_painel(slug)
-- O AION ADM passa a exigir acesso ao painel 'aion-adm' (o dono entra sempre).
-- =====================================================================

create table if not exists paineis (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text not null,
  descricao text not null default '',
  icone text not null default 'painel',
  rota text not null default '',
  ativo boolean not null default true,
  ordem integer not null default 0
);
alter table paineis enable row level security;
drop policy if exists paineis_leitura on paineis;
create policy paineis_leitura on paineis for select to authenticated using (true);
drop policy if exists paineis_dono on paineis;
create policy paineis_dono on paineis for all using (eh_dono()) with check (eh_dono());

insert into paineis (slug, nome, descricao, icone, rota, ativo, ordem) values
  ('aion-adm', 'AION ADM', 'Administração do app AION: alunos, conteúdos, comentários e engajamento.', 'aion', '/admin', true, 1),
  ('atria-produtos', 'Atria Produtos', 'Gestão dos produtos Atria.', 'produtos', '', false, 2)
on conflict (slug) do nothing;

create table if not exists acessos_painel (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  painel_slug text not null,
  nivel text not null check (nivel in ('ver', 'editar', 'admin')),
  bloqueado boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, painel_slug)
);
alter table acessos_painel enable row level security;

create table if not exists historico_central (
  id uuid primary key default gen_random_uuid(),
  quando timestamptz not null default now(),
  ator_id uuid,
  ator_nome text,
  tipo text not null,
  painel_slug text,
  alvo_id uuid,
  alvo_nome text,
  detalhe text
);
create index if not exists historico_central_quando_idx on historico_central (quando desc);
alter table historico_central enable row level security;

create or replace function usuario_bloqueado()
returns boolean language sql stable security definer set search_path = public as $$
  select esta_bloqueado();
$$;

create or replace function nivel_num(p text)
returns integer language sql immutable as $$
  select case p when 'ver' then 1 when 'editar' then 2 when 'admin' then 3 else 0 end;
$$;

-- Tem acesso a este painel, pelo menos neste nível? O dono entra em tudo.
create or replace function tem_acesso_painel(p_slug text, p_nivel text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select not esta_bloqueado() and (
    exists (select 1 from profiles where id = auth.uid() and papel = 'dono' and dono_principal and status = 'ativa')
    or exists (select 1 from acessos_painel a join profiles p on p.id = a.usuario_id
                where a.usuario_id = auth.uid() and a.painel_slug = p_slug and not a.bloqueado
                  and p.status = 'ativa' and nivel_num(a.nivel) >= nivel_num(p_nivel)));
$$;

create or replace function eh_admin_central()
returns boolean language sql stable security definer set search_path = public as $$
  select tem_acesso_painel('central', 'admin');
$$;

drop policy if exists acessos_painel_leitura on acessos_painel;
create policy acessos_painel_leitura on acessos_painel for select using (usuario_id = auth.uid() or eh_admin_central());
drop policy if exists historico_central_leitura on historico_central;
create policy historico_central_leitura on historico_central for select using (eh_admin_central());
drop policy if exists bloqueio_restritivo on paineis;
create policy bloqueio_restritivo on paineis as restrictive for all to authenticated using (not esta_bloqueado()) with check (not esta_bloqueado());
drop policy if exists bloqueio_restritivo on acessos_painel;
create policy bloqueio_restritivo on acessos_painel as restrictive for all to authenticated using (not esta_bloqueado()) with check (not esta_bloqueado());
drop policy if exists bloqueio_restritivo on historico_central;
create policy bloqueio_restritivo on historico_central as restrictive for all to authenticated using (not esta_bloqueado()) with check (not esta_bloqueado());

-- Quem entrou em qual painel (uma linha a cada 30 min por pessoa e painel, no máximo).
create or replace function registrar_entrada_painel(p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or esta_bloqueado() or not tem_acesso_painel(p_slug, 'ver') and p_slug <> 'central' then return; end if;
  if exists (select 1 from historico_central where ator_id = auth.uid() and tipo = 'entrada' and painel_slug = p_slug and quando > now() - interval '30 minutes') then return; end if;
  insert into historico_central (ator_id, ator_nome, tipo, painel_slug)
  select auth.uid(), nome, 'entrada', p_slug from profiles where id = auth.uid();
end $$;
grant execute on function registrar_entrada_painel(text) to authenticated;

-- O que a pessoa acessa (para a Central e o JWT).
create or replace function meus_paineis()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'dono', exists (select 1 from profiles where id = auth.uid() and papel = 'dono' and dono_principal and status = 'ativa'),
    'admin_central', eh_admin_central(),
    'bloqueado', esta_bloqueado(),
    'paineis', coalesce((select jsonb_object_agg(painel_slug, jsonb_build_object('nivel', nivel, 'bloqueado', bloqueado)) from acessos_painel where usuario_id = auth.uid()), '{}'::jsonb));
$$;
grant execute on function meus_paineis() to authenticated;

-- Lista da Central (dono e Admin da Central).
create or replace function central_colaboradores()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'email', coalesce(u.email, p.email, ''), 'funcao', p.funcao,
    'dono', p.dono_principal, 'eu', p.id = auth.uid(),
    'bloqueado', p.status = 'bloqueada' or exists (select 1 from usuarios_bloqueados b where b.user_id = p.id),
    'pendente', coalesce((u.raw_app_meta_data ->> 'senha_propria')::boolean, false) is not true,
    'ultimo', coalesce(u.last_sign_in_at, p.ultimo_acesso_em),
    'paineis', coalesce((select jsonb_object_agg(a.painel_slug, jsonb_build_object('nivel', a.nivel, 'bloqueado', a.bloqueado)) from acessos_painel a where a.usuario_id = p.id), '{}'::jsonb)
  ) order by p.dono_principal desc, p.nome), '[]'::jsonb)
  from profiles p join auth.users u on u.id = p.id
  where eh_admin_central() and p.papel in ('dono', 'admin', 'suporte');
$$;
revoke all on function central_colaboradores() from public, anon;
grant execute on function central_colaboradores() to authenticated;

-- O AION ADM passa a exigir o painel 'aion-adm' (o dono principal entra sempre).
create or replace function eh_equipe()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and papel in ('dono', 'admin', 'suporte') and status = 'ativa')
     and equipe_aal_ok() and tem_acesso_painel('aion-adm', 'ver');
$$;
create or replace function eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and papel in ('dono', 'admin') and status = 'ativa')
     and equipe_aal_ok() and tem_acesso_painel('aion-adm', 'ver');
$$;
create or replace function painel_edita_area(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select equipe_aal_ok() and not esta_bloqueado() and tem_acesso_painel('aion-adm', 'editar') and exists (
    select 1 from profiles p
     where p.id = auth.uid() and p.status = 'ativa' and (
       (p.papel = 'dono' and (p.dono_principal or not area_so_do_dono(p_area)))
       or (p.papel = 'admin' and not area_so_do_dono(p_area))
       or (p.papel = 'suporte' and not area_so_do_dono(p_area) and coalesce(p.areas ->> p_area, '') = 'editar')));
$$;
create or replace function painel_ve_area(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select equipe_aal_ok() and not esta_bloqueado() and tem_acesso_painel('aion-adm', 'ver') and exists (
    select 1 from profiles p
     where p.id = auth.uid() and p.status = 'ativa' and (
       (p.papel = 'dono' and (p.dono_principal or not area_so_do_dono(p_area)))
       or (p.papel = 'admin' and not area_so_do_dono(p_area))
       or (p.papel = 'suporte' and not area_so_do_dono(p_area) and coalesce(p.areas ->> p_area, '') in ('ver', 'editar'))));
$$;

-- Quem já é da equipe continua entrando no AION ADM, no nível que tem hoje.
insert into acessos_painel (usuario_id, painel_slug, nivel)
select p.id, 'aion-adm', case when p.papel = 'admin' then 'admin' when p.acesso_tipo = 'leitura' then 'ver' else 'editar' end
  from profiles p where p.papel in ('admin', 'suporte') and not p.dono_principal
on conflict do nothing;

update auth.users u set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'paineis', coalesce((select jsonb_object_agg(a.painel_slug, a.nivel) from acessos_painel a where a.usuario_id = u.id and not a.bloqueado), '{}'::jsonb),
    'admin_central', false)
  from profiles p where p.id = u.id and p.papel in ('admin', 'suporte');
