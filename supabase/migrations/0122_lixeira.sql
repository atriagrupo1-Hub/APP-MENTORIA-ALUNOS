-- Lixeira (0122): tudo o que for apagado de cursos, módulos, aulas e categorias fica guardado por 30 dias
-- e pode ser restaurado. Cada exclusão (com tudo o que cai junto em cascata) forma um "lote" (a transação).
create table if not exists public.lixeira_linhas (
  id bigserial primary key,
  lote bigint not null,
  tabela text not null,
  dados jsonb not null,
  apagado_em timestamptz not null default now(),
  apagado_por uuid default auth.uid()
);
create index if not exists lixeira_linhas_lote on public.lixeira_linhas (lote);
create index if not exists lixeira_linhas_quando on public.lixeira_linhas (apagado_em);
alter table public.lixeira_linhas enable row level security;
drop policy if exists lixeira_leitura on public.lixeira_linhas;
create policy lixeira_leitura on public.lixeira_linhas for select using (eh_equipe());

create or replace function public.lixeira_guardar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into lixeira_linhas (lote, tabela, dados) values (txid_current(), tg_table_name, to_jsonb(old));
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categorias_aba','produtos','modulos','aulas','aulas_ao_vivo','presentes','conteudos','aula_materiais','aula_midia','presente_midia','ao_vivo_midia','categoria_itens','acessos','cronograma_modulo','progresso','comentarios','curtidas','curtidas_comentario']
  loop
    execute format('drop trigger if exists lixeira_guardar on public.%I', t);
    execute format('create trigger lixeira_guardar after delete on public.%I for each row execute function public.lixeira_guardar()', t);
  end loop;
end $$;

-- Lista o que está na lixeira: um item por exclusão (o maior apagado do lote). Apaga o que passou de 30 dias.
create or replace function public.lixeira_listar()
returns table (lote bigint, tipo text, item_id uuid, titulo text, apagado_em timestamptz, apagado_por uuid, autor text, itens int)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not eh_equipe() then raise exception 'Acesso bloqueado.'; end if;
  delete from lixeira_linhas l where l.apagado_em < now() - interval '30 days';
  return query
  with topo as (
    select distinct on (l.lote) l.lote, l.tabela, l.dados, l.apagado_em, l.apagado_por
    from lixeira_linhas l
    where l.tabela in ('categorias_aba','produtos','modulos','aulas')
    order by l.lote, case l.tabela when 'categorias_aba' then 1 when 'produtos' then 2 when 'modulos' then 3 else 4 end, l.id
  )
  select t.lote,
         case t.tabela when 'categorias_aba' then 'categoria' when 'produtos' then 'curso' when 'modulos' then 'modulo' else 'aula' end,
         (t.dados->>'id')::uuid, coalesce(t.dados->>'titulo', '(sem nome)'), t.apagado_em, t.apagado_por,
         (select pf.nome from profiles pf where pf.id = t.apagado_por),
         (select count(*)::int from lixeira_linhas x where x.lote = t.lote)
  from topo t order by t.apagado_em desc;
end $$;

-- Restaura um lote inteiro, na ordem certa (o de cima antes do de baixo).
create or replace function public.lixeira_restaurar(p_lote bigint)
returns int language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0;
begin
  if not (eh_admin() or pode_grupo('cur')) then raise exception 'Acesso bloqueado.'; end if;
  for r in select * from lixeira_linhas where lote = p_lote
    order by case tabela when 'categorias_aba' then 1 when 'produtos' then 2 when 'modulos' then 3 when 'aulas' then 4 when 'aulas_ao_vivo' then 5 when 'presentes' then 5 when 'comentarios' then 6 else 7 end, id
  loop
    begin
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', r.tabela, r.tabela) using r.dados;
      n := n + 1;
    exception when unique_violation then null; -- já existe (voltou antes): mantém o que está lá
    end;
  end loop;
  delete from lixeira_linhas where lote = p_lote;
  return n;
end $$;

-- Apaga de vez um lote (sai da lixeira).
create or replace function public.lixeira_excluir(p_lote bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (eh_admin() or pode_grupo('cur')) then raise exception 'Acesso bloqueado.'; end if;
  delete from lixeira_linhas where lote = p_lote;
end $$;

revoke all on function public.lixeira_listar() from public, anon;
revoke all on function public.lixeira_restaurar(bigint) from public, anon;
revoke all on function public.lixeira_excluir(bigint) from public, anon;
grant execute on function public.lixeira_listar() to authenticated;
grant execute on function public.lixeira_restaurar(bigint) to authenticated;
grant execute on function public.lixeira_excluir(bigint) to authenticated;
