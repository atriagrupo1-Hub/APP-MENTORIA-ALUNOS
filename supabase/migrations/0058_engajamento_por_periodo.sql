-- =====================================================================
-- 0058 — Engajamento por período (aba Engajamento do painel)
--
-- 1) `presencas`: um registro por aluna por dia em que ela abriu o app.
--    Gravado por `marcar_presenca()`. Começa com o que já se sabe
--    (primeiro e último acesso, progresso e comentários).
-- 2) `engajamento_em(dia)`: a nota e o grupo de cada aluna como eram no
--    fim daquele dia — a mesma conta de `engajamento_alunas()` (aulas
--    concluídas, último acesso, comentários) e os mesmos grupos do
--    painel (Avançando ≥ 60, No ritmo ≥ 35, Precisa de um empurrão,
--    Recém-chegada). Serve para comparar com o período anterior.
-- 3) `resumo_engajamento(de, ate)`: os números da aba num JSON só.
-- Só a equipe lê.
-- =====================================================================

create table if not exists presencas (
  aluna_id uuid not null references profiles(id) on delete cascade,
  dia date not null,
  primary key (aluna_id, dia)
);
alter table presencas enable row level security;
drop policy if exists presencas_equipe on presencas;
create policy presencas_equipe on presencas for select using (eh_equipe());

insert into presencas (aluna_id, dia)
select id, (primeiro_acesso_em at time zone 'America/Sao_Paulo')::date from profiles where papel = 'aluna' and primeiro_acesso_em is not null
union select id, (ultimo_acesso_em at time zone 'America/Sao_Paulo')::date from profiles where papel = 'aluna' and ultimo_acesso_em is not null
union select aluna_id, (atualizada_em at time zone 'America/Sao_Paulo')::date from progresso where atualizada_em is not null
union select aluna_id, (concluida_em at time zone 'America/Sao_Paulo')::date from progresso where concluida_em is not null
union select autora_id, (criado_em at time zone 'America/Sao_Paulo')::date from comentarios c join profiles p on p.id = c.autora_id and p.papel = 'aluna'
on conflict do nothing;

create or replace function marcar_presenca()
returns void
language sql security definer set search_path = public as $$
  insert into presencas (aluna_id, dia)
  select id, (now() at time zone 'America/Sao_Paulo')::date from profiles where id = auth.uid() and papel = 'aluna'
  on conflict do nothing;
  update profiles
     set ultimo_acesso_em = now(),
         primeiro_acesso_em = coalesce(primeiro_acesso_em, now())
   where id = auth.uid() and papel = 'aluna'
     and (ultimo_acesso_em is null or ultimo_acesso_em < now() - interval '10 minutes');
$$;

-- A nota e o grupo de cada aluna no fim do dia p_dia (horário de Brasília).
create or replace function engajamento_em(p_dia date)
returns table(aluna_id uuid, nota integer, grupo text)
language sql stable security definer set search_path = public as $$
  with lim as (select ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo') as fim),
  base as (
    select p.id, p.entrada,
           (select max(x) from (
              select max(pr.dia) x from presencas pr where pr.aluna_id = p.id and pr.dia <= p_dia
              union all select max((g.atualizada_em at time zone 'America/Sao_Paulo')::date) from progresso g where g.aluna_id = p.id and g.atualizada_em < (select fim from lim)
              union all select max((k.criado_em at time zone 'America/Sao_Paulo')::date) from comentarios k where k.autora_id = p.id and k.criado_em < (select fim from lim)
           ) t) as ultimo,
           (select count(*)::integer from aberturas_da_aluna(p.id) ab
             join acessos ac on ac.aluna_id = p.id and ac.aula_id = ab.aula_id and ac.escopo = 'aula'
             where (ab.abre_em is null or ab.abre_em < (select fim from lim)) and ac.concedido_em < (select fim from lim)) as lib,
           (select count(*)::integer from progresso g where g.aluna_id = p.id and g.concluida_em < (select fim from lim)) as conc,
           (select count(*)::integer from comentarios k where k.autora_id = p.id and k.status <> 'removido' and k.criado_em < (select fim from lim)) as com
    from profiles p
    where eh_equipe() and p.papel = 'aluna' and p.status <> 'bloqueada'
      and p.criada_em < (select fim from lim)
      and (p.acesso_ate is null or p.acesso_ate >= (select fim from lim))
  ), calc as (
    select b.*, (p_dia - b.ultimo) as dd,
           round(100 * (
             0.55 * (case when b.lib > 0 then least(1, b.conc::numeric / b.lib) else 0 end)
           + 0.35 * (case when b.ultimo is null or (p_dia - b.ultimo) >= 30 then 0 else 1 - greatest(0, p_dia - b.ultimo)::numeric / 30 end)
           + 0.10 * least(1, b.com::numeric / 3)
           ))::integer as nota
    from base b
  )
  select id, nota,
         case when ultimo is null and entrada is not null and p_dia - entrada between 0 and 7 then 'recem'
              when nota >= 60 then 'avancando'
              when nota >= 35 then 'ritmo'
              else 'empurrao' end
  from calc;
$$;
revoke execute on function engajamento_em(date) from public, anon;
grant execute on function engajamento_em(date) to authenticated;

-- Os números da aba Engajamento para o período [p_de, p_ate] e o anterior, de mesmo tamanho.
create or replace function resumo_engajamento(p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_n integer := p_ate - p_de + 1;
  v_ant_de date := p_de - (p_ate - p_de + 1);
  v_ant_ate date := p_de - 1;
  v_res jsonb;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if v_n < 1 or v_n > 400 then raise exception 'periodo_invalido'; end if;

  with ativas as (
    select pr.aluna_id, pr.dia from presencas pr
    union select g.aluna_id, (g.atualizada_em at time zone 'America/Sao_Paulo')::date from progresso g where g.atualizada_em is not null
    union select k.autora_id, (k.criado_em at time zone 'America/Sao_Paulo')::date from comentarios k
  ),
  base_dia as (
    select d::date as dia,
           (select count(*) from profiles p where p.papel = 'aluna' and p.status <> 'bloqueada'
              and p.criada_em < ((d::date + 1)::timestamp at time zone 'America/Sao_Paulo')
              and (p.acesso_ate is null or p.acesso_ate >= ((d::date + 1)::timestamp at time zone 'America/Sao_Paulo'))) as total,
           (select count(distinct a.aluna_id) from ativas a join profiles p on p.id = a.aluna_id and p.papel = 'aluna' and p.status <> 'bloqueada' where a.dia = d::date) as ativas
    from generate_series(least(v_ant_de, p_ate - 29), p_ate, interval '1 day') d
  ),
  periodo as (
    select (select count(distinct a.aluna_id) from ativas a join profiles p on p.id = a.aluna_id and p.papel = 'aluna' and p.status <> 'bloqueada' where a.dia between p_de and p_ate) as at_cur,
           (select count(distinct a.aluna_id) from ativas a join profiles p on p.id = a.aluna_id and p.papel = 'aluna' and p.status <> 'bloqueada' where a.dia between v_ant_de and v_ant_ate) as at_ant,
           (select total from base_dia where dia = p_ate) as tot_cur,
           (select total from base_dia where dia = v_ant_ate) as tot_ant
  ),
  g_cur as (select grupo, count(*) n, avg(nota) m from engajamento_em(p_ate) group by grupo),
  g_ant as (select grupo, count(*) n from engajamento_em(v_ant_ate) group by grupo),
  sc as (
    select (select count(*) from engajamento_em(p_ate) e where not exists (select 1 from contatos_aluna c where c.aluna_id = e.aluna_id and c.quando >= ((p_ate - 6)::timestamp at time zone 'America/Sao_Paulo') and c.quando < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))) as cur,
           (select count(*) from engajamento_em(v_ant_ate) e where not exists (select 1 from contatos_aluna c where c.aluna_id = e.aluna_id and c.quando >= ((v_ant_ate - 6)::timestamp at time zone 'America/Sao_Paulo') and c.quando < ((v_ant_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))) as ant
  )
  select jsonb_build_object(
    'dias', (select jsonb_agg(jsonb_build_object('dia', dia, 'ativas', ativas, 'total', total) order by dia) from base_dia),
    'ativas', (select at_cur from periodo), 'total', (select tot_cur from periodo),
    'ativas_ant', (select at_ant from periodo), 'total_ant', (select tot_ant from periodo),
    'grupos', coalesce((select jsonb_object_agg(grupo, n) from g_cur), '{}'::jsonb),
    'grupos_ant', coalesce((select jsonb_object_agg(grupo, n) from g_ant), '{}'::jsonb),
    'sem_contato', (select cur from sc), 'sem_contato_ant', (select ant from sc),
    'media_nota', (select round(sum(n * m) / nullif(sum(n), 0), 1) from g_cur)
  ) into v_res;
  return v_res;
end;
$$;
revoke execute on function resumo_engajamento(date, date) from public, anon;
grant execute on function resumo_engajamento(date, date) to authenticated;
