-- Tipo de conteúdo da aula: vídeo (Cloudflare Stream), áudio ou PDF
-- (e-book). Áudio e PDF ficam nos depósitos fechados `audios` e
-- `materiais`; o arquivo só sai para quem pode ver a aula.
alter table public.aulas add column if not exists tipo text not null default 'video';
alter table public.aulas add column if not exists arquivo_path text;
alter table public.aulas drop constraint if exists aulas_tipo_valido;
alter table public.aulas add constraint aulas_tipo_valido check (tipo in ('video', 'audio', 'pdf'));

drop policy if exists materiais_leitura on storage.objects;
create policy materiais_leitura on storage.objects for select using (
  bucket_id = 'materiais' and (
    eh_admin()
    or exists (select 1 from aula_materiais m where m.arquivo_path = objects.name and pode_ver_aula(m.aula_id))
    or exists (select 1 from conteudos k where k.arquivo_path = objects.name and pode_ver_conteudo(k.id))
    or exists (select 1 from aulas a where a.tipo = 'pdf' and a.arquivo_path = objects.name and pode_ver_aula(a.id))
  ));
drop policy if exists audios_leitura on storage.objects;
create policy audios_leitura on storage.objects for select using (
  bucket_id = 'audios' and (
    eh_admin()
    or exists (select 1 from aula_materiais m where m.arquivo_path = objects.name and pode_ver_aula(m.aula_id))
    or exists (select 1 from conteudos k where k.arquivo_path = objects.name and pode_ver_conteudo(k.id))
    or exists (select 1 from aulas a where a.tipo = 'audio' and a.arquivo_path = objects.name and pode_ver_aula(a.id))
  ));

-- Aula em PDF: abrir o PDF conclui a aula (não há posição de tocador).

CREATE OR REPLACE FUNCTION public.marcar_concluida(p_aula uuid, p_concluida boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dur integer;
  v_pos integer;
begin
  if not pode_ver_aula(p_aula) then return; end if;
  if p_concluida and not exists (select 1 from aulas where id = p_aula and tipo = 'pdf') then
    select duracao_segundos into v_dur from aulas where id = p_aula;
    select posicao_segundos into v_pos from progresso where aluna_id = auth.uid() and aula_id = p_aula;
    if v_dur is null or v_pos is null or v_pos < v_dur - greatest(15, v_dur * 0.05) then return; end if;
  end if;
  insert into progresso (aluna_id, aula_id, concluida_em, atualizada_em)
  values (auth.uid(), p_aula, case when p_concluida then now() end, now())
  on conflict (aluna_id, aula_id) do update
    set concluida_em = case when p_concluida then coalesce(progresso.concluida_em, now()) end,
        atualizada_em = now();
end;
$function$;

-- As cópias levam o tipo e o arquivo.

CREATE OR REPLACE FUNCTION public.duplicar_aula(p_aula uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aula record;
  v_nova uuid;
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  select * into v_aula from aulas where id = p_aula;
  if not found then raise exception 'aula_inexistente'; end if;
  insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path)
  values (v_aula.modulo_id, null, v_aula.titulo || ' (cópia)', 0, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path)
  returning id into v_nova;
  insert into aula_midia (aula_id, video_provider, video_ref) select v_nova, video_provider, video_ref from aula_midia where aula_id = p_aula;
  insert into conteudos (produto_id, modulo_id, aula_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
  select produto_id, modulo_id, v_nova, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where aula_id = p_aula;
  return v_nova;
end $function$;

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
  values (null, v_mod.titulo || ' (cópia)', v_mod.intro, v_mod.capa_path, v_mod.cor_destaque,
          (select coalesce(max(ordem), 0) + 1 from modulos where produto_id = v_mod.produto_id),
          v_mod.publicado, v_mod.bloqueado_geral, v_mod.titulo_na_arte, v_mod.produto_id, v_mod.capa_horizontal_path, v_mod.rotulo, v_mod.rotulo_aula)
  returning id into v_novo;
  for v_aula in select * from aulas where modulo_id = p_modulo order by ordem loop
    insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path)
    values (v_novo, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path)
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
      insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path)
      values (v_novo_mod, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path)
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
