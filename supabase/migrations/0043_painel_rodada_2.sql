-- =====================================================================
-- 0043 — Painel, rodada 2: histórico, anotações, contatos, sugestões,
-- engajamento e ações em várias alunas.
--
-- Último acesso: `profiles.ultimo_acesso_em` já é gravado no login
-- (`verificar_codigo`), e agora também cada vez que a aluna abre o
-- aplicativo (`marcar_presenca`). Para o painel, vale o mais recente
-- entre isso e a última vez que ela mexeu numa aula (`progresso`).
-- Última aula: a de `progresso.atualizada_em` mais recente.
-- Concluídas: `progresso.concluida_em` preenchido.
-- WhatsApp: é o `profiles.celular` (0041/0042).
--
-- Só a equipe lê e escreve nas tabelas novas; a aluna nunca. O
-- histórico só aceita inserção. Suporte lê o histórico só dentro da
-- ficha de uma aluna; o registro geral é de dono e administrador.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quem fez: carimbado pelo banco, não pelo navegador.
-- ---------------------------------------------------------------------
create or replace function carimbar_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := auth.uid();
  new.autor_nome := coalesce((select nome from profiles where id = auth.uid()), 'Sistema');
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------
create table if not exists historico_acoes (
  id         uuid primary key default gen_random_uuid(),
  aluna_id   uuid references profiles(id) on delete set null,
  autor_id   uuid,
  autor_nome text not null default 'Sistema',
  quando     timestamptz not null default now(),
  texto      text not null check (length(texto) between 1 and 500)
);
create index if not exists historico_acoes_aluna on historico_acoes (aluna_id, quando desc);
create index if not exists historico_acoes_quando on historico_acoes (quando desc);

create table if not exists anotacoes_aluna (
  id         uuid primary key default gen_random_uuid(),
  aluna_id   uuid not null references profiles(id) on delete cascade,
  texto      text not null check (length(texto) between 1 and 2000),
  autor_id   uuid,
  autor_nome text not null default 'Sistema',
  quando     timestamptz not null default now()
);
create index if not exists anotacoes_aluna_aluna on anotacoes_aluna (aluna_id, quando);

create table if not exists contatos_aluna (
  id         uuid primary key default gen_random_uuid(),
  aluna_id   uuid not null references profiles(id) on delete cascade,
  autor_id   uuid,
  autor_nome text not null default 'Sistema',
  quando     timestamptz not null default now(),
  canal      text not null default 'whatsapp',
  resultado  text not null check (length(resultado) between 1 and 120),
  observacao text check (observacao is null or length(observacao) <= 1000)
);
create index if not exists contatos_aluna_aluna on contatos_aluna (aluna_id, quando);

create table if not exists sugestoes (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null check (length(texto) between 1 and 2000),
  autor_id   uuid,
  autor_nome text not null default 'Sistema',
  quando     timestamptz not null default now(),
  estado     text not null default 'nova' check (estado in ('nova', 'lida', 'feita'))
);

create or replace trigger autor before insert on historico_acoes for each row execute function carimbar_autor();
create or replace trigger autor before insert on anotacoes_aluna for each row execute function carimbar_autor();
create or replace trigger autor before insert on contatos_aluna for each row execute function carimbar_autor();
create or replace trigger autor before insert on sugestoes for each row execute function carimbar_autor();

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table historico_acoes enable row level security;
alter table anotacoes_aluna enable row level security;
alter table contatos_aluna  enable row level security;
alter table sugestoes       enable row level security;

revoke all on historico_acoes, anotacoes_aluna, contatos_aluna, sugestoes from anon;
revoke update, delete, truncate on historico_acoes from authenticated;
grant select, insert on historico_acoes to authenticated;
grant select, insert, delete on anotacoes_aluna to authenticated;
grant select, insert on contatos_aluna to authenticated;
grant select, insert, update, delete on sugestoes to authenticated;

create policy historico_le on historico_acoes for select to authenticated
  using (eh_admin() or (eh_equipe() and aluna_id is not null));
create policy historico_insere on historico_acoes for insert to authenticated
  with check (eh_equipe());

create policy anotacoes_le on anotacoes_aluna for select to authenticated using (eh_equipe());
create policy anotacoes_insere on anotacoes_aluna for insert to authenticated
  with check (eh_equipe() and eh_aluna(aluna_id));
create policy anotacoes_apaga on anotacoes_aluna for delete to authenticated using (eh_equipe());

create policy contatos_le on contatos_aluna for select to authenticated using (eh_equipe());
create policy contatos_insere on contatos_aluna for insert to authenticated
  with check (eh_equipe() and eh_aluna(aluna_id));

create policy sugestoes_le on sugestoes for select to authenticated using (eh_equipe());
create policy sugestoes_insere on sugestoes for insert to authenticated with check (eh_equipe());
create policy sugestoes_muda on sugestoes for update to authenticated using (eh_admin()) with check (eh_admin());
create policy sugestoes_apaga on sugestoes for delete to authenticated
  using (eh_dono() or (eh_equipe() and autor_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. A aluna avisa que está aqui (chamada pela área de membros)
-- ---------------------------------------------------------------------
create or replace function marcar_presenca() returns void
language sql security definer set search_path = public as $$
  update profiles
     set ultimo_acesso_em = now(),
         primeiro_acesso_em = coalesce(primeiro_acesso_em, now())
   where id = auth.uid() and papel = 'aluna'
     and (ultimo_acesso_em is null or ultimo_acesso_em < now() - interval '10 minutes');
$$;
revoke execute on function marcar_presenca() from public, anon;
grant execute on function marcar_presenca() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Engajamento — calculado aqui, não no navegador
--
-- Nota de 0 a 100: 55% aulas concluídas entre as liberadas, 35% recência
-- do último acesso (zero a partir de 30 dias), 10% comentários (teto 3).
-- ---------------------------------------------------------------------
create or replace function engajamento_alunas()
returns table (
  aluna_id uuid, ultimo_acesso timestamptz, ultima_aula uuid,
  liberadas integer, concluidas integer, comentarios integer, nota integer
)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id,
           greatest(p.ultimo_acesso_em, (select max(pr.atualizada_em) from progresso pr where pr.aluna_id = p.id)) as ultimo,
           (select pr.aula_id from progresso pr where pr.aluna_id = p.id order by pr.atualizada_em desc nulls last limit 1) as ultima,
           (select count(*)::integer from aberturas_da_aluna(p.id)) as lib,
           (select count(*)::integer from progresso pr join aulas a on a.id = pr.aula_id
             where pr.aluna_id = p.id and pr.concluida_em is not null) as conc,
           (select count(*)::integer from comentarios k
             where k.autora_id = p.id and k.status <> 'removido') as com
    from profiles p
    where eh_equipe() and p.papel = 'aluna'
  ), calc as (
    select b.*,
           ((now() at time zone 'America/Sao_Paulo')::date
             - (b.ultimo at time zone 'America/Sao_Paulo')::date) as dd
    from base b
  )
  select id, ultimo, ultima, lib, conc, com,
         round(100 * (
           0.55 * (case when lib > 0 then least(1, conc::numeric / lib) else 0 end)
         + 0.35 * (case when ultimo is null or dd >= 30 then 0 else 1 - greatest(0, dd)::numeric / 30 end)
         + 0.10 * least(1, com::numeric / 3)
         ))::integer
  from calc;
$$;
revoke execute on function engajamento_alunas() from public, anon;
grant execute on function engajamento_alunas() to authenticated;

/** As aulas que cada aluna concluiu — para o progresso por módulo na ficha. */
create or replace function aulas_concluidas_alunas()
returns table (aluna_id uuid, aula_id uuid)
language sql stable security definer set search_path = public as $$
  select pr.aluna_id, pr.aula_id
  from progresso pr
  join profiles p on p.id = pr.aluna_id and p.papel = 'aluna'
  where eh_equipe() and pr.concluida_em is not null;
$$;
revoke execute on function aulas_concluidas_alunas() from public, anon;
grant execute on function aulas_concluidas_alunas() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Ações em várias alunas, numa operação só
-- ---------------------------------------------------------------------
create or replace function lote_liberar_modulo(p_alunas uuid[], p_modulo uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_titulo text; v_produto uuid; v_n integer := 0; v_id uuid;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  select titulo, produto_id into v_titulo, v_produto from modulos where id = p_modulo;
  if v_titulo is null then raise exception 'modulo_inexistente'; end if;

  foreach v_id in array coalesce(p_alunas, '{}') loop
    continue when not eh_aluna(v_id);
    if not exists (select 1 from acessos where aluna_id = v_id and escopo = 'produto' and produto_id = v_produto) then
      insert into acessos (aluna_id, escopo, modulo_id, concedido_por)
      values (v_id, 'modulo', p_modulo, auth.uid())
      on conflict (aluna_id, modulo_id) where escopo = 'modulo' do nothing;
    end if;
    insert into historico_acoes (aluna_id, texto) values (v_id, 'Módulo liberado em lote: ' || v_titulo);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function lote_liberar_modulo(uuid[], uuid) from public, anon;
grant execute on function lote_liberar_modulo(uuid[], uuid) to authenticated;

create or replace function lote_renovar(p_alunas uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer := 0; v_id uuid; v_nova timestamptz;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  foreach v_id in array coalesce(p_alunas, '{}') loop
    continue when not eh_aluna(v_id);
    v_nova := renovar_acesso(v_id, 0, 0, 1);
    insert into historico_acoes (aluna_id, texto)
    values (v_id, 'Acesso renovado em lote até ' || to_char(v_nova at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function lote_renovar(uuid[]) from public, anon;
grant execute on function lote_renovar(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Desfazer a renovação: volta a validade que ela tinha
-- ---------------------------------------------------------------------
create or replace function definir_validade(p_aluna uuid, p_validade timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;
  update profiles set acesso_ate = p_validade where id = p_aluna;
end;
$$;
revoke execute on function definir_validade(uuid, timestamptz) from public, anon;
grant execute on function definir_validade(uuid, timestamptz) to authenticated;
