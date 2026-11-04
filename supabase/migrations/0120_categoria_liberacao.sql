-- Categoria (0120): mesmas formas de liberação do módulo e do curso, e data de publicação.
-- libera_modo: null/'imediato'; 'data' = libera_em; 'cadastro' = libera_dias após o cadastro de cada aluna.
alter table public.categorias_aba add column if not exists libera_modo text;
alter table public.categorias_aba add column if not exists libera_dias integer;
alter table public.categorias_aba add column if not exists publicado_em timestamptz;
alter table public.categorias_aba drop constraint if exists categorias_aba_libera_modo_ok;
alter table public.categorias_aba add constraint categorias_aba_libera_modo_ok check (libera_modo is null or libera_modo in ('imediato','data','cadastro'));
alter table public.categorias_aba drop constraint if exists categorias_aba_libera_dias_ok;
alter table public.categorias_aba add constraint categorias_aba_libera_dias_ok check (libera_dias is null or libera_dias between 0 and 3650);
update public.categorias_aba set publicado_em = criada_em where publicado_em is null and publicado and not rascunho;
drop trigger if exists categorias_aba_marca_publicacao on public.categorias_aba;
create trigger categorias_aba_marca_publicacao before insert or update of publicado, rascunho on public.categorias_aba
  for each row execute function public.modulos_marca_publicacao();
-- Cursos: vale para todos agora (antes só o Bênçãos tinha data de publicação).
update public.produtos set publicado_em = criado_em where publicado_em is null and publicado and not rascunho;

CREATE OR REPLACE FUNCTION public.abertura_da_aula(p_aluna uuid, p_aula uuid)
 RETURNS TABLE(abre_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with x as (
    select a.liberada_geral, a.libera_em, m.libera_em as mod_libera, pr.libera_em as prod_libera, cx.libera_em as cat_libera,
           case m.libera_modo
             when 'cadastro' then (select (pf2.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(m.libera_dias, 0)) from profiles pf2 where pf2.id = p_aluna)
             when 'prazo' then coalesce(modulo_libera_prazo(m.id), 'infinity'::timestamptz)
           end as regra_libera,
           case when pr.libera_modo = 'cadastro' then (select (pf3.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(pr.libera_dias, 0)) from profiles pf3 where pf3.id = p_aluna) end as prod_regra,
           case a.libera_modo
             when 'cadastro' then (select (pf4.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(a.libera_dias, 0)) from profiles pf4 where pf4.id = p_aluna)
             when 'prazo' then coalesce(aula_libera_prazo(a.id), 'infinity'::timestamptz)
           end as aula_regra,
           case when cx.libera_modo = 'cadastro' then (select (pf5.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(cx.libera_dias, 0)) from profiles pf5 where pf5.id = p_aluna) end as cat_regra,
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
      and a.publicado and not a.rascunho and m.publicado and not m.rascunho
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.rascunho and not pr.bloqueado_geral))
      and (ca.id is null or (not ca.bloqueada_geral and ca.publicado))
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral and not cx.rascunho))
  )
  select greatest(case
           when liberada_geral then null
           when tem_aula and aula_abre is not null then aula_abre
           else nullif(
                  greatest(case when tem_aula then '-infinity'::timestamptz else acima_abre end,
                           coalesce(cronograma, '-infinity'::timestamptz)),
                  '-infinity'::timestamptz)
         end, libera_em, mod_libera, prod_libera, cat_libera, regra_libera, prod_regra, aula_regra, cat_regra)
  from x
  where liberada_geral or tem_aula or acima_abre is not null;
$function$;

CREATE OR REPLACE FUNCTION public.aberturas_da_aluna(p_aluna uuid)
 RETURNS TABLE(aula_id uuid, modulo_id uuid, abre_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ac as (select * from acessos where acessos.aluna_id = p_aluna),
  x as (
    select a.id, a.modulo_id, a.liberada_geral, a.libera_em, m.libera_em as mod_libera, pr.libera_em as prod_libera, cx.libera_em as cat_libera,
           case m.libera_modo
             when 'cadastro' then (select (pf2.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(m.libera_dias, 0)) from profiles pf2 where pf2.id = p_aluna)
             when 'prazo' then coalesce(modulo_libera_prazo(m.id), 'infinity'::timestamptz)
           end as regra_libera,
           case when pr.libera_modo = 'cadastro' then (select (pf3.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(pr.libera_dias, 0)) from profiles pf3 where pf3.id = p_aluna) end as prod_regra,
           case a.libera_modo
             when 'cadastro' then (select (pf4.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(a.libera_dias, 0)) from profiles pf4 where pf4.id = p_aluna)
             when 'prazo' then coalesce(aula_libera_prazo(a.id), 'infinity'::timestamptz)
           end as aula_regra,
           case when cx.libera_modo = 'cadastro' then (select (pf5.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(cx.libera_dias, 0)) from profiles pf5 where pf5.id = p_aluna) end as cat_regra,
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
    where a.publicado and not a.rascunho and m.publicado and not m.rascunho
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.rascunho and not pr.bloqueado_geral))
      and (ca.id is null or (not ca.bloqueada_geral and ca.publicado))
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral and not cx.rascunho))
  )
  select id, modulo_id,
         greatest(case when liberada_geral then null
              when coalesce(tem_aula, false) and aula_abre is not null then aula_abre
              else nullif(greatest(case when coalesce(tem_aula, false) then '-infinity'::timestamptz else acima_abre end,
                                   coalesce(cronograma, '-infinity'::timestamptz)), '-infinity'::timestamptz)
         end, libera_em, mod_libera, prod_libera, cat_libera, regra_libera, prod_regra, aula_regra, cat_regra)
  from x
  where liberada_geral or coalesce(tem_aula, false) or acima_abre is not null;
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
    left join categorias_aba cx on cx.id = p.categoria_aba_id
    where p.id = p_produto
      and p.publicado and not p.rascunho
      and not p.bloqueado_geral and not c.bloqueada_geral and c.publicado
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral and not cx.rascunho and (cx.libera_em is null or cx.libera_em <= now()) and (cx.libera_modo is distinct from 'cadastro' or exists (select 1 from profiles pf where pf.id = auth.uid() and (pf.entrada::timestamp at time zone 'America/Sao_Paulo') + make_interval(days => coalesce(cx.libera_dias, 0)) <= now()))))
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
