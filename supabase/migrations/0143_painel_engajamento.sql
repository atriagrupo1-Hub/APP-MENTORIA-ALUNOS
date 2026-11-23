-- =====================================================================
-- 0143 — Aba Engajamento completa (modelo aprovado em 23/11/2026)
--
-- `painel_engajamento(de, ate)`: num JSON só, os números que o painel
-- não consegue montar com o que já carrega:
--   ativos   — ativos hoje, nos últimos 7 e 30 dias (presencas)
--   semanas  — ciclo de vida semana a semana (novos, ficaram, voltaram,
--              pararam), últimas 8 semanas até `ate`
--   coortes  — turmas por mês de entrada (últimos 6 meses) e quantos
--              ainda entram no 1º, 2º, 3º e 6º mês
--   aulas    — por aula: quantos abriram, concluíram, % assistido em
--              média, horas assistidas, curtidas
--   horas    — atividade por dia da semana × hora (Brasília) no período
--   alunas   — por aluna, no período: dias com acesso, aulas concluídas,
--              comentários (só quem teve alguma atividade)
--   jornada  — entraram no app, começaram uma aula, concluíram uma aula
--   push     — alunas com avisos ligados no celular
-- Só leitura. Só a equipe recebe dados (fora dela, devolve null).
-- =====================================================================

create index if not exists presencas_dia_idx on presencas (dia);
create index if not exists progresso_atualizada_idx on progresso (atualizada_em);
create index if not exists progresso_concluida_idx on progresso (concluida_em);
create index if not exists comentarios_criado_idx on comentarios (criado_em);

create or replace function painel_engajamento(p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  fuso constant text := 'America/Sao_Paulo';
  ini timestamptz := (p_de::timestamp at time zone 'America/Sao_Paulo');
  fim timestamptz := ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo');
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  if not eh_equipe() then return null; end if;

  with
  al as (
    select id, coalesce(entrada, (criada_em at time zone 'America/Sao_Paulo')::date) as entrada, primeiro_acesso_em
    from profiles where papel = 'aluna' and status <> 'bloqueada'
  ),
  pres as (select p.aluna_id, p.dia from presencas p join al on al.id = p.aluna_id),
  prim as (select aluna_id, min(dia) as d0 from pres group by aluna_id),
  sem as (
    select (date_trunc('week', p_ate)::date - 7 * i) as ws from generate_series(0, 7) i
  ),
  semanas as (
    select s.ws,
      (select count(distinct x.aluna_id) from pres x join prim f on f.aluna_id = x.aluna_id
        where x.dia >= s.ws and x.dia < s.ws + 7 and f.d0 >= s.ws) as novos,
      (select count(distinct x.aluna_id) from pres x
        where x.dia >= s.ws and x.dia < s.ws + 7
          and exists (select 1 from pres y where y.aluna_id = x.aluna_id and y.dia >= s.ws - 7 and y.dia < s.ws)) as ficaram,
      (select count(distinct x.aluna_id) from pres x join prim f on f.aluna_id = x.aluna_id
        where x.dia >= s.ws and x.dia < s.ws + 7 and f.d0 < s.ws
          and not exists (select 1 from pres y where y.aluna_id = x.aluna_id and y.dia >= s.ws - 7 and y.dia < s.ws)) as voltaram,
      (select count(*) from prim f
        where f.d0 < s.ws
          and not exists (select 1 from pres y where y.aluna_id = f.aluna_id and y.dia >= s.ws and y.dia < s.ws + 7)) as pararam
    from sem s
  ),
  meses as (
    select (date_trunc('month', hoje)::date - (i || ' months')::interval)::date as m0 from generate_series(0, 5) i
  ),
  coortes as (
    select m.m0,
      (select count(*) from al where al.entrada >= m.m0 and al.entrada < (m.m0 + interval '1 month')::date) as total,
      (select jsonb_object_agg(k, n) from (
         select k, case when (m.m0 + ((k - 1) * 30)) > hoje then null else
           (select count(distinct a2.id) from al a2 join pres x on x.aluna_id = a2.id
             where a2.entrada >= m.m0 and a2.entrada < (m.m0 + interval '1 month')::date
               and x.dia >= a2.entrada + (k - 1) * 30 and x.dia < a2.entrada + k * 30) end as n
         from unnest(array[1, 2, 3, 6]) k) t) as ret
    from meses m
  ),
  aulas as (
    select g.aula_id,
           count(*) as abriram,
           count(g.concluida_em) as concluiram,
           count(*) filter (where g.atualizada_em >= ini and g.atualizada_em < fim) as abriram_periodo,
           round(avg(least(1, g.posicao_segundos::numeric / nullif(a.duracao_segundos, 0))) * 100) as pct_medio,
           round(sum(least(coalesce(g.posicao_segundos, 0), coalesce(nullif(a.duracao_segundos, 0), g.posicao_segundos, 0)))::numeric / 3600, 1) as horas,
           (select count(*) from curtidas c where c.aula_id = g.aula_id) as curtidas
    from progresso g join al on al.id = g.aluna_id
    left join aulas a on a.id = g.aula_id
    group by g.aula_id, a.duracao_segundos
  ),
  ev as (
    select atualizada_em as t from progresso g join al on al.id = g.aluna_id where atualizada_em >= ini and atualizada_em < fim
    union all select concluida_em from progresso g join al on al.id = g.aluna_id where concluida_em >= ini and concluida_em < fim
    union all select criado_em from comentarios k join al on al.id = k.autora_id where criado_em >= ini and criado_em < fim
  ),
  horas as (
    select extract(isodow from (t at time zone 'America/Sao_Paulo'))::int as d,
           extract(hour from (t at time zone 'America/Sao_Paulo'))::int as h, count(*) as n
    from ev group by 1, 2
  ),
  porAluna as (
    select al.id,
      (select count(*) from pres x where x.aluna_id = al.id and x.dia between p_de and p_ate) as dias,
      (select count(*) from progresso g where g.aluna_id = al.id and g.concluida_em >= ini and g.concluida_em < fim) as concl,
      (select count(*) from comentarios k where k.autora_id = al.id and k.status <> 'removido' and k.criado_em >= ini and k.criado_em < fim) as com
    from al
  )
  select jsonb_build_object(
    'ativos', jsonb_build_object(
      'hoje', (select count(distinct aluna_id) from pres where dia = p_ate),
      'd7', (select count(distinct aluna_id) from pres where dia > p_ate - 7 and dia <= p_ate),
      'd30', (select count(distinct aluna_id) from pres where dia > p_ate - 30 and dia <= p_ate),
      'd30_ant', (select count(distinct aluna_id) from pres where dia > p_ate - 60 and dia <= p_ate - 30),
      'base', (select count(*) from al)),
    'semanas', (select jsonb_agg(jsonb_build_object('ws', ws, 'novos', novos, 'ficaram', ficaram, 'voltaram', voltaram, 'pararam', pararam) order by ws) from semanas),
    'coortes', (select jsonb_agg(jsonb_build_object('mes', m0, 'total', total, 'ret', ret) order by m0 desc) from coortes),
    'aulas', coalesce((select jsonb_agg(jsonb_build_object('id', aula_id, 'abriram', abriram, 'concluiram', concluiram, 'abriram_periodo', abriram_periodo, 'pct', pct_medio, 'horas', horas, 'curtidas', curtidas)) from aulas), '[]'::jsonb),
    'horas', coalesce((select jsonb_agg(jsonb_build_array(d, h, n)) from horas), '[]'::jsonb),
    'alunas', coalesce((select jsonb_agg(jsonb_build_array(id, dias, concl, com)) from porAluna where dias + concl + com > 0), '[]'::jsonb),
    'jornada', jsonb_build_object(
      'cadastrados', (select count(*) from al),
      'entraram', (select count(*) from al where primeiro_acesso_em is not null or exists (select 1 from pres x where x.aluna_id = al.id)),
      'comecaram', (select count(distinct g.aluna_id) from progresso g join al on al.id = g.aluna_id),
      'concluiram_aula', (select count(distinct g.aluna_id) from progresso g join al on al.id = g.aluna_id where g.concluida_em is not null)),
    'push', (select count(distinct p.aluna_id) from push_inscricoes p join al on al.id = p.aluna_id)
  ) into r;
  return r;
end $$;

revoke all on function painel_engajamento(date, date) from public, anon;
grant execute on function painel_engajamento(date, date) to authenticated;
