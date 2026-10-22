-- =====================================================================
-- 0061 — Painel mais rápido ao abrir
--
-- `engajamento_alunas()` fazia uma consulta por aluna para cada número.
-- Agora calcula tudo de uma vez (mesmo resultado, mesma conta da nota).
-- `aberturas_da_aluna()` deixa de chamar `abertura_da_aula()` aula por
-- aula: a mesma regra numa consulta só (resultado conferido igual para
-- todas as alunas). Deixa mais rápidos o painel e a área da aluna.
-- =====================================================================

create or replace function engajamento_alunas()
returns table(aluna_id uuid, ultimo_acesso timestamptz, ultima_aula uuid, liberadas integer, concluidas integer, comentarios integer, nota integer)
language sql stable security definer set search_path = public as $$
  with al as (
    select p.id, p.ultimo_acesso_em from profiles p where eh_equipe() and p.papel = 'aluna'
  ),
  prog as (
    select g.aluna_id, max(g.atualizada_em) as ult,
           count(*) filter (where g.concluida_em is not null)::integer as conc
    from progresso g join aulas a on a.id = g.aula_id
    where g.aluna_id in (select id from al)
    group by g.aluna_id
  ),
  ultima as (
    select distinct on (g.aluna_id) g.aluna_id, g.aula_id
    from progresso g where g.aluna_id in (select id from al)
    order by g.aluna_id, g.atualizada_em desc nulls last
  ),
  com as (
    select k.autora_id, count(*)::integer as n from comentarios k
    where k.status <> 'removido' and k.autora_id in (select id from al) group by k.autora_id
  ),
  lib as (
    select al.id, (select count(*)::integer from aberturas_da_aluna(al.id)) as n from al
  ),
  base as (
    select al.id,
           greatest(al.ultimo_acesso_em, prog.ult) as ultimo,
           ultima.aula_id as ultima,
           coalesce(lib.n, 0) as lib,
           coalesce(prog.conc, 0) as conc,
           coalesce(com.n, 0) as com
    from al
    left join prog on prog.aluna_id = al.id
    left join ultima on ultima.aluna_id = al.id
    left join com on com.autora_id = al.id
    left join lib on lib.id = al.id
  ), calc as (
    select b.*, ((now() at time zone 'America/Sao_Paulo')::date - (b.ultimo at time zone 'America/Sao_Paulo')::date) as dd
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

create or replace function aberturas_da_aluna(p_aluna uuid)
returns table(aula_id uuid, modulo_id uuid, abre_em timestamptz)
language sql stable security definer set search_path = public as $$
  with ac as (select * from acessos where acessos.aluna_id = p_aluna),
  x as (
    select a.id, a.modulo_id, a.liberada_geral,
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
      and (ca.id is null or not ca.bloqueada_geral)
  )
  select id, modulo_id,
         case when liberada_geral then null
              when coalesce(tem_aula, false) and aula_abre is not null then aula_abre
              else nullif(greatest(case when coalesce(tem_aula, false) then '-infinity'::timestamptz else acima_abre end,
                                   coalesce(cronograma, '-infinity'::timestamptz)), '-infinity'::timestamptz)
         end
  from x
  where liberada_geral or coalesce(tem_aula, false) or acima_abre is not null;
$$;
