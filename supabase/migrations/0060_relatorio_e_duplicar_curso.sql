-- =====================================================================
-- 0060 — Página do curso no painel: Relatórios e Duplicar curso
--
-- `relatorio_curso(produto, de, ate)`: os números do período e do
--  período anterior (mesmo tamanho), dia a dia, só das aulas do curso:
--  novas alunas (primeira liberação), aulas assistidas (progresso
--  gravado), comentários, curtidas e minutos assistidos; módulos e aulas
--  mais acessados no período. Só a equipe lê.
-- `duplicar_produto(produto)`: cópia oculta do curso, com os módulos,
--  as aulas, os vídeos e os conteúdos. Liberações e progresso não vão.
-- =====================================================================

create or replace function relatorio_curso(p_produto uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ant_de date := p_de - (p_ate - p_de + 1);
  v_ant_ate date := p_de - 1;
  v jsonb;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if p_ate < p_de or p_ate - p_de > 400 then raise exception 'periodo_invalido'; end if;

  with au as (
    select a.id, a.titulo, a.modulo_id, a.duracao_segundos, m.titulo as modulo, m.ordem as mord
    from aulas a join modulos m on m.id = a.modulo_id where m.produto_id = p_produto
  ),
  entrada as (
    select ac.aluna_id, min((ac.concedido_em at time zone 'America/Sao_Paulo')::date) as dia
    from acessos ac join profiles p on p.id = ac.aluna_id and p.papel = 'aluna'
    where (ac.escopo = 'produto' and ac.produto_id = p_produto)
       or (ac.escopo = 'modulo' and ac.modulo_id in (select modulo_id from au))
       or (ac.escopo = 'aula' and ac.aula_id in (select id from au))
    group by ac.aluna_id
  ),
  vistos as (
    select g.aluna_id, g.aula_id, (g.atualizada_em at time zone 'America/Sao_Paulo')::date as dia,
           case when g.concluida_em is not null then coalesce(au.duracao_segundos, g.posicao_segundos) else g.posicao_segundos end as seg
    from progresso g join au on au.id = g.aula_id where g.atualizada_em is not null
  ),
  coms as (select (k.criado_em at time zone 'America/Sao_Paulo')::date as dia from comentarios k join au on au.id = k.aula_id where k.status <> 'removido'),
  curt as (
    select (c.criada_em at time zone 'America/Sao_Paulo')::date as dia from curtidas c join au on au.id = c.aula_id
    union all
    select (cc.criada_em at time zone 'America/Sao_Paulo')::date from curtidas_comentario cc join comentarios k on k.id = cc.comentario_id join au on au.id = k.aula_id
  ),
  dias as (select d::date as dia from generate_series(p_de, p_ate, interval '1 day') d),
  tot as (
    select
      (select count(*) from entrada where dia between p_de and p_ate) as novas,
      (select count(*) from entrada where dia between v_ant_de and v_ant_ate) as novas_ant,
      (select count(*) from vistos where dia between p_de and p_ate) as assistidas,
      (select count(*) from vistos where dia between v_ant_de and v_ant_ate) as assistidas_ant,
      (select count(*) from coms where dia between p_de and p_ate) as comentarios,
      (select count(*) from coms where dia between v_ant_de and v_ant_ate) as comentarios_ant,
      (select count(*) from curt where dia between p_de and p_ate) as curtidas,
      (select count(*) from curt where dia between v_ant_de and v_ant_ate) as curtidas_ant,
      (select coalesce(round(sum(seg) / 60.0), 0) from vistos where dia between p_de and p_ate) as minutos,
      (select coalesce(round(sum(seg) / 60.0), 0) from vistos where dia between v_ant_de and v_ant_ate) as minutos_ant
  )
  select jsonb_build_object(
    'dias', (select jsonb_agg(jsonb_build_object('dia', d.dia,
              'novas', (select count(*) from entrada e where e.dia = d.dia),
              'assistidas', (select count(*) from vistos x where x.dia = d.dia)) order by d.dia) from dias d),
    'totais', (select to_jsonb(tot) from tot),
    'modulos', coalesce((select jsonb_agg(r order by r.n desc, r.mord) from (
        select au.modulo_id as id, au.modulo as titulo, au.mord, count(*) as n from vistos x join au on au.id = x.aula_id
        where x.dia between p_de and p_ate group by au.modulo_id, au.modulo, au.mord order by count(*) desc, au.mord limit 3) r), '[]'::jsonb),
    'aulas', coalesce((select jsonb_agg(r order by r.n desc) from (
        select au.id, au.titulo, count(*) as n from vistos x join au on au.id = x.aula_id
        where x.dia between p_de and p_ate group by au.id, au.titulo order by count(*) desc limit 3) r), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke execute on function relatorio_curso(uuid, date, date) from public, anon;
grant execute on function relatorio_curso(uuid, date, date) to authenticated;

create or replace function duplicar_produto(p_produto uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_novo uuid;
  v_mod record;
  v_novo_mod uuid;
  v_aula record;
  v_nova_aula uuid;
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  insert into produtos (categoria_id, titulo, descricao, capa_path, ordem, publicado, bloqueado_geral, fundacao, aviso_material, inicio, rotulo_inicio, nome_curto)
  select categoria_id, titulo || ' (cópia)', descricao, capa_path, (select coalesce(max(ordem), 0) + 1 from produtos), false, bloqueado_geral, fundacao, aviso_material, inicio, rotulo_inicio, nome_curto
  from produtos where id = p_produto
  returning id into v_novo;
  if v_novo is null then raise exception 'produto_inexistente'; end if;

  for v_mod in select * from modulos where produto_id = p_produto order by ordem loop
    insert into modulos (numero, titulo, intro, capa_path, cor_destaque, ordem, publicado, bloqueado_geral, titulo_na_arte, produto_id, capa_horizontal_path)
    values (v_mod.numero, v_mod.titulo, v_mod.intro, v_mod.capa_path, v_mod.cor_destaque, v_mod.ordem, v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_novo, v_mod.capa_horizontal_path)
    returning id into v_novo_mod;
    for v_aula in select * from aulas where modulo_id = v_mod.id order by ordem loop
      insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio)
      values (v_novo_mod, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio)
      returning id into v_nova_aula;
      insert into aula_midia (aula_id, video_provider, video_ref) select v_nova_aula, video_provider, video_ref from aula_midia where aula_id = v_aula.id;
      insert into conteudos (produto_id, modulo_id, aula_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
      select v_novo, v_novo_mod, v_nova_aula, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where aula_id = v_aula.id;
    end loop;
    insert into conteudos (produto_id, modulo_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
    select v_novo, v_novo_mod, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where modulo_id = v_mod.id and aula_id is null;
  end loop;
  insert into conteudos (produto_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
  select v_novo, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where produto_id = p_produto and modulo_id is null and aula_id is null and presente_id is null;
  return v_novo;
end;
$$;
revoke execute on function duplicar_produto(uuid) from public, anon;
grant execute on function duplicar_produto(uuid) to authenticated;

-- Duplicar um módulo dentro do mesmo curso (vai para o fim, oculto para ninguém: igual ao original).
create or replace function duplicar_modulo(p_modulo uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_mod record;
  v_novo uuid;
  v_aula record;
  v_nova_aula uuid;
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  select * into v_mod from modulos where id = p_modulo;
  if not found then raise exception 'modulo_inexistente'; end if;
  insert into modulos (numero, titulo, intro, capa_path, cor_destaque, ordem, publicado, bloqueado_geral, titulo_na_arte, produto_id, capa_horizontal_path)
  values (v_mod.numero, v_mod.titulo || ' (cópia)', v_mod.intro, v_mod.capa_path, v_mod.cor_destaque,
          (select coalesce(max(ordem), 0) + 1 from modulos where produto_id = v_mod.produto_id),
          v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_mod.produto_id, v_mod.capa_horizontal_path)
  returning id into v_novo;
  for v_aula in select * from aulas where modulo_id = p_modulo order by ordem loop
    insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio)
    values (v_novo, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio)
    returning id into v_nova_aula;
    insert into aula_midia (aula_id, video_provider, video_ref) select v_nova_aula, video_provider, video_ref from aula_midia where aula_id = v_aula.id;
    insert into conteudos (produto_id, modulo_id, aula_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
    select produto_id, v_novo, v_nova_aula, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where aula_id = v_aula.id;
  end loop;
  return v_novo;
end;
$$;
revoke execute on function duplicar_modulo(uuid) from public, anon;
grant execute on function duplicar_modulo(uuid) to authenticated;
