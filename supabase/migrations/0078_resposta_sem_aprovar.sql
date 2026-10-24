-- Responder sem aprovar: a resposta fica guardada (pendente) e só aparece
-- para a aluna quando o comentário for aprovado. Aprovar o comentário
-- publica junto as respostas da equipe que estavam esperando.
create or replace function public.responder_comentario(p_comentario uuid, p_texto text, p_publicar boolean default true)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pai comentarios%rowtype;
  v_id uuid;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_status status_comentario;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if length(v_texto) not between 1 and 600 then raise exception 'texto_invalido'; end if;
  select * into v_pai from comentarios where id = p_comentario and resposta_a is null;
  if not found then raise exception 'comentario_nao_encontrado'; end if;
  if p_publicar and v_pai.status = 'pendente' then
    update comentarios set status = 'publicado', moderado_por = auth.uid(), moderado_em = now() where id = p_comentario;
    v_pai.status := 'publicado';
  end if;
  -- A resposta só fica visível se o comentário estiver publicado.
  v_status := case when v_pai.status = 'publicado' then 'publicado' else 'pendente' end;
  select c.id into v_id
  from comentarios c
  join profiles p on p.id = c.autora_id
  where c.resposta_a = p_comentario
    and p.papel in ('dono', 'admin', 'suporte')
    and c.status <> 'removido'
  order by c.criado_em
  limit 1;
  if v_id is null then
    insert into comentarios (aula_id, autora_id, texto, posicao_segundos, status, resposta_a, nome_visivel)
    values (v_pai.aula_id, auth.uid(), v_texto, v_pai.posicao_segundos, v_status, p_comentario, true)
    returning id into v_id;
    -- O gatilho publica o que a equipe escreve; aqui a resposta espera a aprovação.
    if v_status = 'pendente' then update comentarios set status = 'pendente' where id = v_id; end if;
  else
    update comentarios set texto = v_texto, status = case when status = 'oculto' then status else v_status end where id = v_id;
  end if;
  return v_id;
end;
$function$;
drop function if exists public.responder_comentario(uuid, text);

create or replace function public.moderar_comentario(p_comentario uuid, p_status status_comentario)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  update comentarios
     set status = p_status, moderado_por = auth.uid(), moderado_em = now()
   where id = p_comentario;
  if not found then raise exception 'comentario_nao_encontrado'; end if;
  -- Aprovou o comentário: as respostas da equipe que esperavam a aprovação aparecem junto.
  if p_status = 'publicado' then
    update comentarios c set status = 'publicado'
      from profiles p
     where c.resposta_a = p_comentario and c.status = 'pendente'
       and p.id = c.autora_id and p.papel in ('dono', 'admin', 'suporte');
  end if;
end;
$function$;
grant execute on function public.responder_comentario(uuid, text, boolean) to authenticated;
