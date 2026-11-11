-- Card do produto: a última aula liberada de cada produto, para quantas alunas e quantas foram avisadas no celular.
create or replace function public.listar_ultimas_liberacoes()
returns table (produto_id uuid, aula_id uuid, aula_titulo text, modulo_numero int, aula_numero int, quando timestamptz, alunas bigint, avisadas bigint)
language sql stable security definer set search_path = public as $$
  with lib as (
    select m.produto_id, x.aula_id, max(coalesce(x.abre_em, x.concedido_em)) as quando, count(distinct x.aluna_id) as alunas
      from acessos x join aulas a on a.id = x.aula_id join modulos m on m.id = a.modulo_id
     where x.aula_id is not null and coalesce(x.abre_em, x.concedido_em) <= now()
     group by m.produto_id, x.aula_id
  ), ult as (
    select distinct on (produto_id) * from lib order by produto_id, quando desc
  )
  select u.produto_id, u.aula_id, a.titulo, m.numero, a.numero, u.quando, u.alunas,
         (select count(*) from avisos_enviados e where e.tipo = 'aula' and e.ref_id = u.aula_id)
    from ult u join aulas a on a.id = u.aula_id join modulos m on m.id = a.modulo_id
   where eh_equipe();
$$;
revoke all on function public.listar_ultimas_liberacoes() from public, anon;
grant execute on function public.listar_ultimas_liberacoes() to authenticated;
