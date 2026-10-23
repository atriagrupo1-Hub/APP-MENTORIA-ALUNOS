-- Hierarquia: Aba (tabela categorias) → Categoria (categorias_aba) →
-- Curso (produtos) → Módulos → Aulas. Cada curso de hoje ganha a sua
-- categoria; o da mentoria fica em "Mentorias Individuais".
-- A categoria tem os três estados: Ativa, Bloqueada (aparece, sem
-- acesso) e Oculta (não aparece) — valem para tudo que está dentro dela.
create table if not exists public.categorias_aba (
  id uuid primary key default gen_random_uuid(),
  aba_id uuid not null references public.categorias(id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 1 and 80),
  descricao text,
  capa_path text,
  ordem integer not null default 0,
  publicado boolean not null default true,
  bloqueada_geral boolean not null default false,
  criada_em timestamptz not null default now()
);
create index if not exists categorias_aba_aba_idx on public.categorias_aba(aba_id);
alter table public.categorias_aba enable row level security;
create policy categorias_aba_leitura on public.categorias_aba for select using (conta_ativa() or eh_admin());
create policy categorias_aba_escrita on public.categorias_aba for all using (eh_admin()) with check (eh_admin());
grant select, insert, update, delete on public.categorias_aba to authenticated;

alter table public.produtos add column if not exists categoria_aba_id uuid references public.categorias_aba(id) on delete set null;
create index if not exists produtos_categoria_aba_idx on public.produtos(categoria_aba_id);

do $$
declare r record; v_id uuid; v_jornada uuid;
begin
  select produto_jornada into v_jornada from configuracoes limit 1;
  for r in select * from produtos where categoria_aba_id is null and categoria_id is not null order by ordem loop
    insert into categorias_aba (aba_id, titulo, capa_path, ordem, criada_em)
    values (r.categoria_id,
            case when r.id = v_jornada then 'Mentorias Individuais' else r.titulo end,
            case when r.id = v_jornada then null else r.capa_path end,
            r.ordem, coalesce(r.criado_em, now()))
    returning id into v_id;
    update produtos set categoria_aba_id = v_id where id = r.id;
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.pode_ver_produto(p_produto uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from produtos p
    join categorias c on c.id = p.categoria_id
    left join categorias_aba cx on cx.id = p.categoria_aba_id
    where p.id = p_produto
      and p.publicado
      and not p.bloqueado_geral and not c.bloqueada_geral and c.publicado
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral))
      and conta_ativa()
      and exists (
        select 1 from acessos ac
        where ac.aluna_id = auth.uid()
          and (ac.escopo = 'acervo'
            or (ac.escopo = 'categoria' and ac.categoria_id = p.categoria_id)
            or (ac.escopo = 'produto'   and ac.produto_id   = p.id))
          and (ac.abre_em is null or ac.abre_em <= now())
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.aberturas_da_aluna(p_aluna uuid)
 RETURNS TABLE(aula_id uuid, modulo_id uuid, abre_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ac as (select * from acessos where acessos.aluna_id = p_aluna),
  x as (
    select a.id, a.modulo_id, a.liberada_geral, a.libera_em, m.libera_em as mod_libera, pr.libera_em as prod_libera,
           au.tem as tem_aula, au.abre as aula_abre,
           (select min(coalesce(c.abre_em, '-infinity'::timestamptz)) from ac c
             where (c.escopo = 'modulo' and c.modulo_id = m.id)
                or (c.escopo = 'produto' and c.produto_id = m.produto_id)
                or (c.escopo = 'categoria' and c.categoria_id = pr.categoria_id)
                or (c.escopo = 'acervo' and m.produto_id is not null)) as acima_abre,
           (select (pf.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => cm.dias)
              from cronograma_modulo cm join profiles pf on pf.id = cm.aluna_id
             where cm.aluna_id = p_aluna and cm.modulo_id = m.id) as cronograma
    from aulas a
    join modulos m on m.id = a.modulo_id
    left join produtos pr on pr.id = m.produto_id
    left join categorias ca on ca.id = pr.categoria_id
    left join categorias_aba cx on cx.id = pr.categoria_aba_id
    left join lateral (select true as tem, c.abre_em as abre from ac c where c.escopo = 'aula' and c.aula_id = a.id limit 1) au on true
    where a.publicado and m.publicado
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.bloqueado_geral))
      and (ca.id is null or (not ca.bloqueada_geral and ca.publicado))
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral))
  )
  select id, modulo_id,
         greatest(case when liberada_geral then null
              when coalesce(tem_aula, false) and aula_abre is not null then aula_abre
              else nullif(greatest(case when coalesce(tem_aula, false) then '-infinity'::timestamptz else acima_abre end,
                                   coalesce(cronograma, '-infinity'::timestamptz)), '-infinity'::timestamptz)
         end, libera_em, mod_libera, prod_libera)
  from x
  where liberada_geral or coalesce(tem_aula, false) or acima_abre is not null;
$function$;

CREATE OR REPLACE FUNCTION public.abertura_da_aula(p_aluna uuid, p_aula uuid)
 RETURNS TABLE(abre_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with x as (
    select a.liberada_geral, a.libera_em, m.libera_em as mod_libera, pr.libera_em as prod_libera,
           exists (
             select 1 from acessos ac
             where ac.aluna_id = p_aluna and ac.escopo = 'aula' and ac.aula_id = a.id
           ) as tem_aula,
           (select ac.abre_em from acessos ac
             where ac.aluna_id = p_aluna and ac.escopo = 'aula' and ac.aula_id = a.id
             limit 1) as aula_abre,
           (select min(coalesce(ac.abre_em, '-infinity'::timestamptz))
              from acessos ac
             where ac.aluna_id = p_aluna
               and (   (ac.escopo = 'modulo'    and ac.modulo_id    = m.id)
                    or (ac.escopo = 'produto'   and ac.produto_id   = m.produto_id)
                    or (ac.escopo = 'categoria' and ac.categoria_id = pr.categoria_id)
                    or (ac.escopo = 'acervo'    and m.produto_id is not null))
           ) as acima_abre,
           (select (pf.entrada::timestamp at time zone 'America/Sao_Paulo')
                   + make_interval(days => cm.dias)
              from cronograma_modulo cm
              join profiles pf on pf.id = cm.aluna_id
             where cm.aluna_id = p_aluna and cm.modulo_id = m.id) as cronograma
    from aulas a
    join modulos m on m.id = a.modulo_id
    left join produtos   pr on pr.id = m.produto_id
    left join categorias ca on ca.id = pr.categoria_id
    left join categorias_aba cx on cx.id = pr.categoria_aba_id
    where a.id = p_aula
      and a.publicado and m.publicado
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.bloqueado_geral))
      and (ca.id is null or (not ca.bloqueada_geral and ca.publicado))
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral))
  )
  select greatest(case
           when liberada_geral then null
           when tem_aula and aula_abre is not null then aula_abre
           else nullif(
                  greatest(case when tem_aula then '-infinity'::timestamptz else acima_abre end,
                           coalesce(cronograma, '-infinity'::timestamptz)),
                  '-infinity'::timestamptz)
         end, libera_em, mod_libera, prod_libera)
  from x
  where liberada_geral or tem_aula or acima_abre is not null;
$function$;

CREATE OR REPLACE FUNCTION public.ordenar_lista(p_tabela text, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nums smallint[];
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  if p_tabela not in ('categorias', 'produtos', 'modulos', 'conteudos', 'categorias_aba') then
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
