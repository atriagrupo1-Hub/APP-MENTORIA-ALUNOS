-- Módulo (0115): publicação separada do acesso, e formas de liberação.
-- rascunho = salvo mas não publicado (a aluna não vê nem acessa).
-- libera_modo: null/'imediato' = imediata; 'data' = libera_em; 'cadastro' = libera_dias após a entrada (cadastro) de cada aluna;
--              'prazo' = libera_dias após a liberação da última aula do módulo anterior do mesmo curso.
alter table public.modulos add column if not exists rascunho boolean not null default false;
alter table public.modulos add column if not exists libera_modo text;
alter table public.modulos add column if not exists libera_dias integer;
alter table public.modulos drop constraint if exists modulos_libera_modo_ok;
alter table public.modulos add constraint modulos_libera_modo_ok check (libera_modo is null or libera_modo in ('imediato','data','cadastro','prazo'));
alter table public.modulos drop constraint if exists modulos_libera_dias_ok;
alter table public.modulos add constraint modulos_libera_dias_ok check (libera_dias is null or libera_dias between 0 and 3650);

-- Data em que o módulo libera para todas pela regra "prazo" (null = ainda não dá para saber: espera).
create or replace function public.modulo_libera_prazo(p_modulo uuid)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select (
    select coalesce(la.libera_em, la.liberada_em, pm.libera_em)
    from modulos pm
    left join lateral (select a.libera_em, a.liberada_em from aulas a where a.modulo_id = pm.id and a.publicado order by a.ordem desc limit 1) la on true
    where pm.produto_id = m.produto_id and pm.ordem < m.ordem
    order by pm.ordem desc limit 1
  ) + make_interval(days => coalesce(m.libera_dias, 0))
  from modulos m where m.id = p_modulo and m.libera_modo = 'prazo';
$$;

drop policy if exists catalogo_modulos_leitura on public.modulos;
create policy catalogo_modulos_leitura on public.modulos for select using ((publicado and not rascunho and conta_ativa()) or eh_equipe());

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
      and a.publicado and m.publicado and not m.rascunho
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.bloqueado_geral))
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
         end, libera_em, mod_libera, prod_libera, cat_libera, regra_libera)
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
    where a.publicado and m.publicado and not m.rascunho
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.bloqueado_geral))
      and (ca.id is null or (not ca.bloqueada_geral and ca.publicado))
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral and not cx.rascunho))
  )
  select id, modulo_id,
         greatest(case when liberada_geral then null
              when coalesce(tem_aula, false) and aula_abre is not null then aula_abre
              else nullif(greatest(case when coalesce(tem_aula, false) then '-infinity'::timestamptz else acima_abre end,
                                   coalesce(cronograma, '-infinity'::timestamptz)), '-infinity'::timestamptz)
         end, libera_em, mod_libera, prod_libera, cat_libera, regra_libera)
  from x
  where liberada_geral or coalesce(tem_aula, false) or acima_abre is not null;
$function$;

CREATE OR REPLACE FUNCTION public.pode_ver_modulo(p_modulo uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from modulos m
    where m.id = p_modulo
      and m.publicado and not m.rascunho and not m.bloqueado_geral
      and conta_ativa()
      and (
        exists (
          select 1 from aulas a
          cross join lateral abertura_da_aula(auth.uid(), a.id) ab
          where a.modulo_id = m.id
            and (ab.abre_em is null or ab.abre_em <= now())
        )
        or exists (
          select 1 from acessos ac
          where ac.aluna_id = auth.uid() and ac.escopo = 'modulo' and ac.modulo_id = m.id
            and (ac.abre_em is null or ac.abre_em <= now())
        )
        or (m.produto_id is not null and pode_ver_produto(m.produto_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.pode_ver_ao_vivo(p_ao_vivo uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from aulas_ao_vivo v
    join modulos m on m.id = v.modulo_id
    where v.id = p_ao_vivo
      and v.liberada
      and m.publicado and not m.rascunho and not m.bloqueado_geral
      and conta_ativa()
      and exists (
        select 1 from aulas a
        cross join lateral abertura_da_aula(auth.uid(), a.id) ab
        where a.modulo_id = m.id
          and (ab.abre_em is null or ab.abre_em <= now())
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.conferir_permissao_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g text := tg_argv[0];
  principal boolean := tg_argv[1] = 'principal';
  k text;
begin
  if auth.uid() is null or eh_admin() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if not pode(g || '_editar') then raise exception 'Acesso bloqueado.'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if not pode(case when g = 'cur' and principal then 'cur_excluir' else g || '_editar' end) then raise exception 'Acesso bloqueado.'; end if;
    return old;
  end if;
  for k in select e.key from jsonb_each(to_jsonb(new)) e where e.value is distinct from (to_jsonb(old) -> e.key) loop
    if k ~ '^(atualizad|editad|modificad)' then continue; end if;
    if not pode(case
         when k in ('publicado', 'bloqueado_geral', 'bloqueada_geral', 'liberada_geral', 'liberada_em', 'rascunho') then g || '_estado'
         when k in ('libera_em', 'libera_modo', 'libera_dias') and g = 'cur' then 'cur_datas'
         else g || '_editar' end) then
      raise exception 'Acesso bloqueado.';
    end if;
  end loop;
  return new;
end $function$;
