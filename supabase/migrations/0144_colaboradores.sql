-- =====================================================================
-- 0144 — Colaboradores (como no Atria Track)
--
-- Acesso por ÁREA do painel: cada colaborador tem um tipo de acesso
-- (admin, personalizado, leitura, conteudo) e um mapa de áreas
-- { "<area>": "ver" | "editar" } (área ausente = sem acesso).
--   admin        → papel 'admin': vê e altera tudo, menos o que é só do dono
--   personalizado→ papel 'suporte' + áreas escolhidas tela por tela
--   leitura      → papel 'suporte' + todas as áreas em "ver"
--   conteudo     → papel 'suporte' + Produtos e Categorias em "editar"
-- O banco confere: `painel_edita_area(area)` decide quem grava em cada
-- área, e `pode()`/`pode_grupo()` (usadas em todas as funções e regras
-- antigas) passam a perguntar a ela. Só o dono principal gerencia a equipe.
--
-- Bloqueio na hora: `usuarios_bloqueados` + uma regra RESTRITIVA em todas
-- as tabelas com RLS (além do status da conta e do ban no Auth, que a
-- Edge Function `colaboradores` faz).
--
-- Convites por link: `convites_equipe` guarda só o resumo (SHA-256) do
-- token; vale 7 dias, uso único, até 10 tentativas.
-- Nada é apagado: as contas existentes são só reclassificadas.
-- =====================================================================

alter table profiles add column if not exists acesso_tipo text
  check (acesso_tipo is null or acesso_tipo in ('admin', 'personalizado', 'leitura', 'conteudo'));
alter table profiles add column if not exists areas jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists funcao text check (funcao is null or char_length(funcao) <= 40);
alter table profiles add column if not exists produtos_vis uuid[];

-- Áreas que só o dono vê: Colaboradores (equipe) e Histórico (registro).
create or replace function area_so_do_dono(p_area text)
returns boolean language sql immutable as $$ select p_area in ('equipe', 'registro') $$;

create table if not exists usuarios_bloqueados (
  user_id uuid primary key references auth.users(id) on delete cascade,
  em timestamptz not null default now(),
  por uuid
);
alter table usuarios_bloqueados enable row level security;
drop policy if exists usuarios_bloqueados_dono on usuarios_bloqueados;
create policy usuarios_bloqueados_dono on usuarios_bloqueados for select using (eh_dono_principal());

create or replace function esta_bloqueado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios_bloqueados where user_id = auth.uid());
$$;

-- Quem pode GRAVAR nesta área do painel.
create or replace function painel_edita_area(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select equipe_aal_ok() and not esta_bloqueado() and exists (
    select 1 from profiles p
     where p.id = auth.uid() and p.status = 'ativa' and (
       (p.papel = 'dono' and (p.dono_principal or not area_so_do_dono(p_area)))
       or (p.papel = 'admin' and not area_so_do_dono(p_area))
       or (p.papel = 'suporte' and not area_so_do_dono(p_area) and coalesce(p.areas ->> p_area, '') = 'editar')));
$$;

-- Quem pode VER esta área (para as telas e as funções de leitura).
create or replace function painel_ve_area(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select equipe_aal_ok() and not esta_bloqueado() and exists (
    select 1 from profiles p
     where p.id = auth.uid() and p.status = 'ativa' and (
       (p.papel = 'dono' and (p.dono_principal or not area_so_do_dono(p_area)))
       or (p.papel = 'admin' and not area_so_do_dono(p_area))
       or (p.papel = 'suporte' and not area_so_do_dono(p_area) and coalesce(p.areas ->> p_area, '') in ('ver', 'editar'))));
$$;

create or replace function area_da_acao(p_acao text)
returns text language sql immutable as $$
  select case split_part(p_acao, '_', 1) when 'al' then 'alunas' when 'eng' then 'engajamento'
    when 'com' then 'comentarios' when 'cur' then 'cursos' when 'cat' then 'layout' else '' end;
$$;

-- As funções antigas passam a perguntar pela área (todas as regras e RPCs que já as usam seguem valendo).
create or replace function pode(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when area_da_acao(p_acao) = '' then eh_admin() and not esta_bloqueado()
              else painel_edita_area(area_da_acao(p_acao)) end;
$$;
create or replace function pode_grupo(p_grupo text)
returns boolean language sql stable security definer set search_path = public as $$
  select painel_edita_area(area_da_acao(p_grupo || '_x'));
$$;
create or replace function aba_liberada(p_aba text)
returns boolean language sql stable security definer set search_path = public as $$
  select painel_ve_area(p_aba);
$$;

-- Só o dono principal gerencia colaboradores.
create or replace function pode_gerir(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_id is distinct from auth.uid() and eh_dono_principal() and not esta_bloqueado()
     and exists (select 1 from profiles where id = p_id and papel in ('dono', 'admin', 'suporte') and not dono_principal);
$$;

-- Regras de gravação por área (no lugar de "qualquer administrador").
drop policy if exists acessos_escrita_admin on acessos;
create policy acessos_escrita_admin on acessos for all using (painel_edita_area('alunas')) with check (painel_edita_area('alunas'));
drop policy if exists config_admin on configuracoes;
create policy config_admin on configuracoes for all using (painel_edita_area('config')) with check (painel_edita_area('config'));
drop policy if exists credenciais_alunas_escrita on credenciais;
create policy credenciais_alunas_escrita on credenciais for all using (painel_edita_area('alunas') and eh_aluna(aluna_id)) with check (painel_edita_area('alunas') and eh_aluna(aluna_id));
drop policy if exists perfil_alunas_escrita on profiles;
create policy perfil_alunas_escrita on profiles for all using (painel_edita_area('alunas') and papel = 'aluna') with check (painel_edita_area('alunas') and papel = 'aluna');
drop policy if exists "destaques: admin" on destaques_inicio;
create policy "destaques: admin" on destaques_inicio for all using (painel_edita_area('config')) with check (painel_edita_area('config'));
drop policy if exists "versiculos: admin" on versiculos;
create policy "versiculos: admin" on versiculos for all using (painel_edita_area('config')) with check (painel_edita_area('config'));
drop policy if exists aluna_link_apaga on aluna_link;
create policy aluna_link_apaga on aluna_link for delete using (painel_edita_area('alunas'));
drop policy if exists aluna_link_insere on aluna_link;
create policy aluna_link_insere on aluna_link for insert with check (painel_edita_area('alunas') and eh_aluna(aluna_id));
drop policy if exists aluna_link_muda on aluna_link;
create policy aluna_link_muda on aluna_link for update using (painel_edita_area('alunas')) with check (painel_edita_area('alunas') and eh_aluna(aluna_id));
drop policy if exists anotacoes_insere on anotacoes_aluna;
create policy anotacoes_insere on anotacoes_aluna for insert with check (painel_edita_area('alunas') and eh_aluna(aluna_id));
drop policy if exists anotacoes_apaga on anotacoes_aluna;
create policy anotacoes_apaga on anotacoes_aluna for delete using (painel_edita_area('alunas'));
drop policy if exists comentarios_edita_proprio on comentarios;
create policy comentarios_edita_proprio on comentarios for update
  using ((autora_id = auth.uid() and not eh_equipe()) or painel_edita_area('comentarios'))
  with check (((autora_id = auth.uid()) and pode_ver_aula(aula_id) and not eh_equipe()) or painel_edita_area('comentarios'));
drop policy if exists comentarios_insere on comentarios;
create policy comentarios_insere on comentarios for insert with check (
  (autora_id = auth.uid())
  and ((pode_ver_aula(aula_id) and not eh_equipe()) or painel_edita_area('comentarios'))
  and exists (select 1 from aulas a where a.id = comentarios.aula_id and a.comentarios_ativos)
  and (resposta_a is null or pode_responder(resposta_a, aula_id)));
drop policy if exists historico_apaga on historico_acoes;
create policy historico_apaga on historico_acoes for delete using (painel_edita_area('registro'));
drop policy if exists sessoes_apaga on sessoes_painel;
create policy sessoes_apaga on sessoes_painel for delete using (painel_edita_area('registro'));
drop policy if exists sugestoes_muda on sugestoes;
create policy sugestoes_muda on sugestoes for update using (eh_dono_principal()) with check (eh_dono_principal());

-- Bloqueado não lê nem grava nada, em nenhuma tabela (regra RESTRITIVA).
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity loop
    execute format('drop policy if exists bloqueio_restritivo on %I', t);
    execute format('create policy bloqueio_restritivo on %I as restrictive for all to authenticated using (not esta_bloqueado()) with check (not esta_bloqueado())', t);
  end loop;
end $$;

-- Convites por link.
create table if not exists convites_equipe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_em timestamptz,
  cancelado_em timestamptz,
  tentativas integer not null default 0,
  criado_por uuid
);
create index if not exists convites_equipe_user_idx on convites_equipe (user_id);
alter table convites_equipe enable row level security;
drop policy if exists bloqueio_restritivo on convites_equipe;
create policy bloqueio_restritivo on convites_equipe as restrictive for all to authenticated using (not esta_bloqueado()) with check (not esta_bloqueado());

-- Modelos das mensagens de acesso (só o dono principal muda).
alter table configuracoes add column if not exists mensagens_convite jsonb;
create or replace function so_dono_muda_mensagens()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.mensagens_convite is distinct from old.mensagens_convite and auth.uid() is not null and not eh_dono_principal() then
    raise exception 'so_o_dono_muda_as_mensagens';
  end if;
  return new;
end $$;
drop trigger if exists so_dono_muda_mensagens on configuracoes;
create trigger so_dono_muda_mensagens before update on configuracoes for each row execute function so_dono_muda_mensagens();

-- Lista da tela Colaboradores (só o dono principal).
create or replace function colaboradores_lista()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'email', coalesce(u.email, p.email, ''),
    'papel', p.papel, 'acesso', p.acesso_tipo, 'areas', p.areas, 'funcao', p.funcao, 'produtos', p.produtos_vis,
    'bloqueado', p.status = 'bloqueada' or exists (select 1 from usuarios_bloqueados b where b.user_id = p.id),
    'pendente', coalesce((u.raw_app_meta_data ->> 'senha_propria')::boolean, false) is not true,
    'ultimo', coalesce(u.last_sign_in_at, p.ultimo_acesso_em),
    'dono', p.dono_principal, 'eu', p.id = auth.uid(), 'criado', p.criada_em
  ) order by p.dono_principal desc, p.nome), '[]'::jsonb)
  from profiles p join auth.users u on u.id = p.id
  where eh_dono_principal() and p.papel in ('dono', 'admin', 'suporte');
$$;
revoke all on function colaboradores_lista() from public, anon;
grant execute on function colaboradores_lista() to authenticated;

-- O meu acesso (para a tela esconder o que não vejo).
create or replace function meu_acesso()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('papel', p.papel, 'acesso', p.acesso_tipo, 'areas', p.areas, 'dono', p.dono_principal, 'produtos', p.produtos_vis, 'funcao', p.funcao)
    from profiles p where p.id = auth.uid() and p.papel in ('dono', 'admin', 'suporte');
$$;
grant execute on function meu_acesso() to authenticated;

-- Reclassifica as contas que já existem (nada é apagado).
update profiles set acesso_tipo = 'admin' where papel = 'admin' and acesso_tipo is null;
update profiles set papel = 'admin', acesso_tipo = 'admin'
 where papel = 'dono' and not dono_principal;
update profiles p set acesso_tipo = 'personalizado', funcao = coalesce(p.funcao, 'Suporte'),
  areas = (
    select jsonb_object_agg(a, v) from (
      select a, case when exists (select 1 from unnest(p.permissoes) x where area_da_acao(x) = a) then 'editar'
                     when a = any(p.abas_bloqueadas) then null else 'ver' end as v
        from unnest(array['inicio', 'alunas', 'engajamento', 'comentarios', 'cursos', 'layout']) a) t where v is not null)
 where p.papel = 'suporte' and p.acesso_tipo is null;

-- Cópia no app_metadata (o banco continua conferindo em profiles, que vale na hora).
update auth.users u set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'dono', p.dono_principal, 'papel', coalesce(p.acesso_tipo, case when p.papel = 'dono' then 'dono' else p.papel::text end),
    'permissoes', p.areas, 'funcao', p.funcao, 'bloqueado', p.status = 'bloqueada')
  from profiles p where p.id = u.id and p.papel in ('dono', 'admin', 'suporte');
