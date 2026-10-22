-- Abas do app (além de Início, Módulos e Perfil): cada aba reúne
-- categorias, como a aba Presentes. A categoria aparece na aba em que
-- foi colocada; sem aba, não aparece em nenhuma (a da mentoria fica
-- em Início/Módulos).
create table if not exists public.abas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) between 1 and 30),
  icone text not null default 'presentes',
  ordem integer not null default 0,
  publicado boolean not null default true,
  criada_em timestamptz not null default now()
);
alter table public.abas enable row level security;
create policy abas_leitura on public.abas for select using (conta_ativa() or eh_admin());
create policy abas_escrita on public.abas for all using (eh_admin()) with check (eh_admin());
grant select on public.abas to authenticated;
grant insert, update, delete on public.abas to authenticated;

alter table public.categorias add column if not exists aba_id uuid references public.abas(id) on delete set null;
create index if not exists categorias_aba_idx on public.categorias(aba_id);

-- A aba Presentes de hoje passa a ser uma aba de verdade, com as
-- categorias que já apareciam nela (todas, menos a da mentoria).
do $$
declare v_aba uuid; v_cat_jornada uuid;
begin
  if not exists (select 1 from abas) then
    insert into abas (titulo, icone, ordem) values ('Presentes', 'presentes', 0) returning id into v_aba;
    select p.categoria_id into v_cat_jornada from produtos p join configuracoes c on c.produto_jornada = p.id limit 1;
    update categorias set aba_id = v_aba where id is distinct from v_cat_jornada;
  end if;
end $$;

create or replace function public.ordenar_lista(p_tabela text, p_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_nums smallint[];
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  if p_tabela not in ('categorias', 'produtos', 'modulos', 'conteudos', 'abas') then
    raise exception 'tabela_invalida';
  end if;
  if p_tabela = 'modulos' then
    select array_agg(numero order by numero) into v_nums from modulos where id = any(p_ids);
    update modulos t set numero = v_nums[x.i], ordem = x.i - 1
      from unnest(p_ids) with ordinality as x(id, i) where t.id = x.id;
    return;
  end if;
  execute format(
    'update %I t set ordem = x.i - 1 from unnest($1) with ordinality as x(id, i) where t.id = x.id',
    p_tabela
  ) using p_ids;
end $function$;
