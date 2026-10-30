-- Categoria (0114): publicar separado de salvar, e data de liberação.
-- rascunho = salva mas ainda não publicada (a aluna não vê nem acessa).
-- libera_em = a categoria só libera nesta data; o que está nela (cursos, módulos, aulas) só abre depois dela.
alter table public.categorias_aba add column if not exists rascunho boolean not null default false;
alter table public.categorias_aba add column if not exists libera_em timestamptz;

drop policy if exists categorias_aba_leitura on public.categorias_aba;
create policy categorias_aba_leitura on public.categorias_aba for select
  using (eh_equipe() or (conta_ativa() and not rascunho));

CREATE OR REPLACE FUNCTION public.abertura_da_aula(p_aluna uuid, p_aula uuid)
 RETURNS TABLE(abre_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with x as (
    select a.liberada_geral, a.libera_em, m.libera_em as mod_libera, pr.libera_em as prod_libera, cx.libera_em as cat_libera,
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
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral and not cx.rascunho))
  )
  select greatest(case
           when liberada_geral then null
           when tem_aula and aula_abre is not null then aula_abre
           else nullif(
                  greatest(case when tem_aula then '-infinity'::timestamptz else acima_abre end,
                           coalesce(cronograma, '-infinity'::timestamptz)),
                  '-infinity'::timestamptz)
         end, libera_em, mod_libera, prod_libera, cat_libera)
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
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral and not cx.rascunho))
  )
  select id, modulo_id,
         greatest(case when liberada_geral then null
              when coalesce(tem_aula, false) and aula_abre is not null then aula_abre
              else nullif(greatest(case when coalesce(tem_aula, false) then '-infinity'::timestamptz else acima_abre end,
                                   coalesce(cronograma, '-infinity'::timestamptz)), '-infinity'::timestamptz)
         end, libera_em, mod_libera, prod_libera, cat_libera)
  from x
  where liberada_geral or coalesce(tem_aula, false) or acima_abre is not null;
$function$;

-- Produto dentro de categoria em rascunho ou ainda não liberada: a aluna não vê.
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
      and (cx.id is null or (cx.publicado and not cx.bloqueada_geral and not cx.rascunho and (cx.libera_em is null or cx.libera_em <= now())))
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

-- Publicar/despublicar conta como mudança de estado (mesma permissão de Ativa/Bloqueada/Desativada).
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
         when k = 'libera_em' and g = 'cur' then 'cur_datas'
         else g || '_editar' end) then
      raise exception 'Acesso bloqueado.';
    end if;
  end loop;
  return new;
end $function$;
