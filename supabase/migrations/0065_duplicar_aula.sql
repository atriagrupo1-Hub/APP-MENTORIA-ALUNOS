-- Duplicar uma aula dentro do mesmo módulo (página do módulo no painel).
-- A cópia ganha o próximo número livre e vai para o fim do módulo.
create or replace function public.duplicar_aula(p_aula uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_aula record;
  v_nova uuid;
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  select * into v_aula from aulas where id = p_aula;
  if not found then raise exception 'aula_inexistente'; end if;
  insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo)
  values (v_aula.modulo_id, null, v_aula.titulo || ' (cópia)', 0, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo)
  returning id into v_nova;
  insert into aula_midia (aula_id, video_provider, video_ref) select v_nova, video_provider, video_ref from aula_midia where aula_id = p_aula;
  insert into conteudos (produto_id, modulo_id, aula_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
  select produto_id, modulo_id, v_nova, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where aula_id = p_aula;
  return v_nova;
end $$;
revoke all on function public.duplicar_aula(uuid) from public, anon;
grant execute on function public.duplicar_aula(uuid) to authenticated;
