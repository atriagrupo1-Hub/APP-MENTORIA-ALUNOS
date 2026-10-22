-- Nome que aparece antes do número, escolhido no painel por módulo:
-- "Módulo 0", "Documentário 1", "Frequência 3"… e o mesmo para as aulas
-- daquele módulo ("Aula 1", "Episódio 1"…). É o que a aluna vê.
alter table public.modulos add column if not exists rotulo text not null default 'Módulo';
alter table public.modulos add column if not exists rotulo_aula text not null default 'Aula';
alter table public.modulos drop constraint if exists modulos_rotulo_tamanho;
alter table public.modulos add constraint modulos_rotulo_tamanho check (char_length(btrim(rotulo)) between 1 and 40 and char_length(btrim(rotulo_aula)) between 1 and 40);

-- A cópia de módulo ou de curso leva junto os nomes antes do número.
CREATE OR REPLACE FUNCTION public.duplicar_modulo(p_modulo uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mod record;
  v_novo uuid;
  v_aula record;
  v_nova_aula uuid;
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  select * into v_mod from modulos where id = p_modulo;
  if not found then raise exception 'modulo_inexistente'; end if;
  insert into modulos (numero, titulo, intro, capa_path, cor_destaque, ordem, publicado, bloqueado_geral, titulo_na_arte, produto_id, capa_horizontal_path, rotulo, rotulo_aula)
  values (v_mod.numero, v_mod.titulo || ' (cópia)', v_mod.intro, v_mod.capa_path, v_mod.cor_destaque,
          (select coalesce(max(ordem), 0) + 1 from modulos where produto_id = v_mod.produto_id),
          v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_mod.produto_id, v_mod.capa_horizontal_path, v_mod.rotulo, v_mod.rotulo_aula)
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
$function$;
CREATE OR REPLACE FUNCTION public.duplicar_produto(p_produto uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    insert into modulos (numero, titulo, intro, capa_path, cor_destaque, ordem, publicado, bloqueado_geral, titulo_na_arte, produto_id, capa_horizontal_path, rotulo, rotulo_aula)
    values (v_mod.numero, v_mod.titulo, v_mod.intro, v_mod.capa_path, v_mod.cor_destaque, v_mod.ordem, v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_novo, v_mod.capa_horizontal_path, v_mod.rotulo, v_mod.rotulo_aula)
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
$function$;
