-- Três estados da categoria, como em curso, módulo e aula: Ativa
-- (publicada, sem bloqueio), Bloqueada (aparece com cadeado, sem acesso)
-- e Desativada (não publicada: some da área da aluna). E a chave
-- "Exibir destaques" do Início.
alter table public.categorias add column if not exists publicado boolean not null default true;
alter table public.configuracoes add column if not exists exibir_destaques boolean not null default true;

CREATE OR REPLACE FUNCTION public.pode_ver_presente(p_presente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from presentes p
    join categorias c on c.id = p.categoria_id
    where p.id = p_presente
      and p.publicado
      and not p.bloqueado_geral and not c.bloqueada_geral and c.publicado
      and conta_ativa()
      and exists (
        select 1 from acessos ac
        where ac.aluna_id = auth.uid()
          and (ac.escopo = 'acervo'
            or (ac.escopo = 'categoria' and ac.categoria_id = p.categoria_id)
            or (ac.escopo = 'presente'  and ac.presente_id  = p.id))
      )
  );
$function$;

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
    where p.id = p_produto
      and p.publicado
      and not p.bloqueado_geral and not c.bloqueada_geral and c.publicado
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
    left join lateral (select true as tem, c.abre_em as abre from ac c where c.escopo = 'aula' and c.aula_id = a.id limit 1) au on true
    where a.publicado and m.publicado
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.bloqueado_geral))
      and (ca.id is null or (not ca.bloqueada_geral and ca.publicado))
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
    where a.id = p_aula
      and a.publicado and m.publicado
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.bloqueado_geral))
      and (ca.id is null or (not ca.bloqueada_geral and ca.publicado))
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

