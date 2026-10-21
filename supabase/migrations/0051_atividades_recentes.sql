-- =====================================================================
-- 0051 — Últimas atividades (Início do painel)
--
-- O que as alunas fizeram no período: assistiu a uma aula (progresso
-- gravado), comentou numa aula e entrou na plataforma (último acesso).
-- Só a equipe lê. Mais recente primeiro.
-- =====================================================================

create or replace function atividades_recentes(p_de timestamptz, p_ate timestamptz, p_limite integer default 50)
returns table(tipo text, aluna_id uuid, aluna_nome text, aula_titulo text, quando timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'assistiu'::text, pr.aluna_id, p.nome, a.titulo, pr.atualizada_em
      from progresso pr join profiles p on p.id = pr.aluna_id join aulas a on a.id = pr.aula_id
     where p.papel = 'aluna' and pr.atualizada_em between p_de and p_ate
    union all
    select 'comentou', c.autora_id, p.nome, a.titulo, c.criado_em
      from comentarios c join profiles p on p.id = c.autora_id join aulas a on a.id = c.aula_id
     where p.papel = 'aluna' and c.criado_em between p_de and p_ate
    union all
    select 'acessou', p.id, p.nome, null, p.ultimo_acesso_em
      from profiles p
     where p.papel = 'aluna' and p.ultimo_acesso_em between p_de and p_ate
  ) x
  where eh_equipe()
  order by 5 desc
  limit greatest(1, least(p_limite, 500));
$$;
revoke execute on function atividades_recentes(timestamptz, timestamptz, integer) from public, anon;
grant execute on function atividades_recentes(timestamptz, timestamptz, integer) to authenticated;
