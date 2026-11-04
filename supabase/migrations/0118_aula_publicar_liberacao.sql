-- Aula (0118): publicação separada do acesso e formas de liberação, como no módulo e no curso.
-- rascunho = não publicada. libera_modo: null/'imediato'; 'data' = libera_em; 'cadastro' = libera_dias após o cadastro
-- de cada aluna; 'prazo' = libera_dias após a liberação da aula anterior do mesmo módulo. publicado_em = gravada ao publicar.
alter table public.aulas add column if not exists rascunho boolean not null default false;
alter table public.aulas add column if not exists libera_modo text;
alter table public.aulas add column if not exists libera_dias integer;
alter table public.aulas add column if not exists publicado_em timestamptz;
alter table public.aulas drop constraint if exists aulas_libera_modo_ok;
alter table public.aulas add constraint aulas_libera_modo_ok check (libera_modo is null or libera_modo in ('imediato','data','cadastro','prazo'));
alter table public.aulas drop constraint if exists aulas_libera_dias_ok;
alter table public.aulas add constraint aulas_libera_dias_ok check (libera_dias is null or libera_dias between 0 and 3650);
-- Em teste só nas aulas do Módulo 0 do Bênçãos: só elas começam com a data de publicação (= criação).
update public.aulas set publicado_em = criada_em where modulo_id = '76e20306-7f78-4502-8633-918f3e2d5f07' and publicado_em is null and publicado;
drop trigger if exists aulas_marca_publicacao on public.aulas;
create trigger aulas_marca_publicacao before insert or update of publicado, rascunho on public.aulas
  for each row execute function public.modulos_marca_publicacao();

-- Data em que a aula libera pela regra "prazo" (null = a anterior ainda não tem data: espera).
create or replace function public.aula_libera_prazo(p_aula uuid)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select (
    select coalesce(pa.libera_em, pa.liberada_em)
    from aulas pa where pa.modulo_id = a.modulo_id and pa.ordem < a.ordem and pa.publicado
    order by pa.ordem desc limit 1
  ) + make_interval(days => coalesce(a.libera_dias, 0))
  from aulas a where a.id = p_aula and a.libera_modo = 'prazo';
$$;

drop policy if exists catalogo_aulas_leitura on public.aulas;
create policy catalogo_aulas_leitura on public.aulas for select using ((publicado and not rascunho and conta_ativa()) or eh_equipe());

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
         end, libera_em, mod_libera, prod_libera, cat_libera, regra_libera, prod_regra, aula_regra)
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
         end, libera_em, mod_libera, prod_libera, cat_libera, regra_libera, prod_regra, aula_regra)
  from x
  where liberada_geral or coalesce(tem_aula, false) or acima_abre is not null;
$function$;
