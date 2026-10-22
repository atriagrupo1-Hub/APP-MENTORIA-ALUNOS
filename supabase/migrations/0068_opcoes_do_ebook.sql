-- E-book (aula em PDF): nome e cor do botão principal, e as outras opções
-- (botões a mais na tela do e-book). Cada opção é um conteúdo da aula
-- marcado como `opcao`: texto, PDF, ou vídeo/áudio com tela completa
-- (capa, título, descrição, instruções e conteúdo extra próprio, que são
-- conteúdos com `pai_id` apontando para a opção). O acesso continua o da
-- aula: as mesmas políticas de `conteudos` e dos depósitos valem aqui.
alter table public.aulas add column if not exists botao_ebook text;
alter table public.aulas add column if not exists botao_ebook_cor text;

alter table public.conteudos add column if not exists opcao boolean not null default false;
alter table public.conteudos add column if not exists cor text;
alter table public.conteudos add column if not exists capa_path text;
alter table public.conteudos add column if not exists titulo_tela text;
alter table public.conteudos add column if not exists instrucoes text;
alter table public.conteudos add column if not exists pai_id uuid references public.conteudos(id) on delete cascade;
create index if not exists conteudos_pai_idx on public.conteudos (pai_id) where pai_id is not null;


-- Copia os conteúdos de uma aula para outra, com as opções do e-book e o
-- conteúdo extra de cada opção (pai_id refeito para as cópias).
create or replace function public.copiar_conteudos_da_aula(p_de uuid, p_para uuid, p_produto uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record; v_novo uuid; v_mapa jsonb := '{}'::jsonb;
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  for v in select * from conteudos where aula_id = p_de order by (pai_id is not null), ordem loop
    insert into conteudos (produto_id, aula_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado, opcao, cor, capa_path, titulo_tela, instrucoes, pai_id)
    values (p_produto, p_para, v.tipo, v.titulo, v.texto, v.arquivo_path, v.url, v.video_provider, v.video_ref, v.ordem, v.publicado, v.opcao, v.cor, v.capa_path, v.titulo_tela, v.instrucoes,
            case when v.pai_id is null then null else (v_mapa ->> v.pai_id::text)::uuid end)
    returning id into v_novo;
    v_mapa := v_mapa || jsonb_build_object(v.id::text, v_novo);
  end loop;
end $$;
revoke all on function public.copiar_conteudos_da_aula(uuid, uuid, uuid) from public, anon;
grant execute on function public.copiar_conteudos_da_aula(uuid, uuid, uuid) to authenticated;

-- As cópias de aula, módulo e curso usam a cópia acima e levam o botão do e-book.
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
  insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path, botao_ebook, botao_ebook_cor)
  values (v_aula.modulo_id, null, v_aula.titulo || ' (cópia)', 0, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path, v_aula.botao_ebook, v_aula.botao_ebook_cor)
  returning id into v_nova;
  insert into aula_midia (aula_id, video_provider, video_ref) select v_nova, video_provider, video_ref from aula_midia where aula_id = p_aula;
  perform copiar_conteudos_da_aula(p_aula, v_nova, (select m.produto_id from modulos m where m.id = v_aula.modulo_id));
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
    insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path, botao_ebook, botao_ebook_cor)
    values (v_novo, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path, v_aula.botao_ebook, v_aula.botao_ebook_cor)
    returning id into v_nova_aula;
    insert into aula_midia (aula_id, video_provider, video_ref) select v_nova_aula, video_provider, video_ref from aula_midia where aula_id = v_aula.id;
    perform copiar_conteudos_da_aula(v_aula.id, v_nova_aula, v_mod.produto_id);
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
      insert into aulas (modulo_id, numero, titulo, ordem, duracao_segundos, capa_path, comentarios_ativos, publicado, bloqueado_geral, texto, liberada_geral, resumo, exercicio, rotulo, tipo, arquivo_path, botao_ebook, botao_ebook_cor)
      values (v_novo_mod, v_aula.numero, v_aula.titulo, v_aula.ordem, v_aula.duracao_segundos, v_aula.capa_path, v_aula.comentarios_ativos, v_aula.publicado, v_aula.bloqueado_geral, v_aula.texto, false, v_aula.resumo, v_aula.exercicio, v_aula.rotulo, v_aula.tipo, v_aula.arquivo_path, v_aula.botao_ebook, v_aula.botao_ebook_cor)
      returning id into v_nova_aula;
      insert into aula_midia (aula_id, video_provider, video_ref) select v_nova_aula, video_provider, video_ref from aula_midia where aula_id = v_aula.id;
      perform copiar_conteudos_da_aula(v_aula.id, v_nova_aula, v_novo);
    end loop;
    insert into conteudos (produto_id, modulo_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
    select v_novo, v_novo_mod, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where modulo_id = v_mod.id and aula_id is null;
  end loop;
  insert into conteudos (produto_id, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado)
  select v_novo, tipo, titulo, texto, arquivo_path, url, video_provider, video_ref, ordem, publicado from conteudos where produto_id = p_produto and modulo_id is null and aula_id is null and presente_id is null;
  return v_novo;
end;
$function$;
