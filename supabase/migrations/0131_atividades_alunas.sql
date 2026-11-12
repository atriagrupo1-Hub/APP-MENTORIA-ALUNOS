-- Todas as atividades das alunas, para o Início do painel: acessos (um por
-- dia), aulas assistidas e concluídas, e-books abertos, comentários,
-- respostas e curtidas. Só a equipe lê.
create or replace function public.atividades_alunas(p_de timestamptz, p_ate timestamptz, p_limite integer default 500)
returns table(tipo text, aluna_id uuid, aluna_nome text, titulo text, quando timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select * from (
    -- acesso: um por dia (presenças), com a hora exata no dia do último acesso
    select 'acessou'::text, p.id, p.nome, null::text,
           case when pr.dia = (p.ultimo_acesso_em at time zone 'America/Sao_Paulo')::date then p.ultimo_acesso_em
                else (pr.dia::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo' end
      from presencas pr join profiles p on p.id = pr.aluna_id
     where p.papel = 'aluna' and pr.dia between (p_de at time zone 'America/Sao_Paulo')::date and (p_ate at time zone 'America/Sao_Paulo')::date
    union all
    select 'acessou', p.id, p.nome, null, p.ultimo_acesso_em
      from profiles p
     where p.papel = 'aluna' and p.ultimo_acesso_em between p_de and p_ate
       and not exists (select 1 from presencas x where x.aluna_id = p.id and x.dia = (p.ultimo_acesso_em at time zone 'America/Sao_Paulo')::date)
    union all
    select case when a.tipo = 'pdf' then 'abriu_ebook' else 'assistiu' end, pr.aluna_id, p.nome, a.titulo, pr.atualizada_em
      from progresso pr join profiles p on p.id = pr.aluna_id join aulas a on a.id = pr.aula_id
     where p.papel = 'aluna' and pr.atualizada_em between p_de and p_ate
    union all
    select 'concluiu', pr.aluna_id, p.nome, a.titulo, pr.concluida_em
      from progresso pr join profiles p on p.id = pr.aluna_id join aulas a on a.id = pr.aula_id
     where p.papel = 'aluna' and a.tipo <> 'pdf' and pr.concluida_em between p_de and p_ate
    union all
    select case when c.resposta_a is null then 'comentou' else 'respondeu' end, c.autora_id, p.nome, a.titulo, c.criado_em
      from comentarios c join profiles p on p.id = c.autora_id join aulas a on a.id = c.aula_id
     where p.papel = 'aluna' and c.criado_em between p_de and p_ate
    union all
    select 'curtiu', k.aluna_id, p.nome, a.titulo, k.criada_em
      from curtidas k join profiles p on p.id = k.aluna_id join aulas a on a.id = k.aula_id
     where p.papel = 'aluna' and k.criada_em between p_de and p_ate
    union all
    select 'curtiu_comentario', k.aluna_id, p.nome, a.titulo, k.criada_em
      from curtidas_comentario k join profiles p on p.id = k.aluna_id join comentarios c on c.id = k.comentario_id join aulas a on a.id = c.aula_id
     where p.papel = 'aluna' and k.criada_em between p_de and p_ate
  ) x
  where eh_equipe()
  order by 5 desc
  limit greatest(1, least(p_limite, 2000));
$$;
revoke all on function public.atividades_alunas(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.atividades_alunas(timestamptz, timestamptz, integer) to authenticated;
