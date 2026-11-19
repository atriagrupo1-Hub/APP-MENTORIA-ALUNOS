-- Equipe: nome e foto próprios para responder comentários na área de membros.
-- Separados do nome oficial (painel) e do login. Vazios = continua o nome/foto de sempre.
alter table public.profiles add column if not exists nome_comentario text;
alter table public.profiles add column if not exists foto_comentario text;

create or replace function public.salvar_perfil_comentario(p_id uuid, p_nome text, p_foto text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  if not exists (select 1 from profiles where id = p_id and papel in ('dono', 'admin', 'suporte')) then
    raise exception 'colaborador_nao_encontrado';
  end if;
  if not (p_id = auth.uid() or pode_gerir(p_id)) then raise exception 'sem_permissao'; end if;
  if v_nome is not null and length(v_nome) not between 2 and 60 then raise exception 'nome_invalido'; end if;
  if p_foto is not null and (length(p_foto) > 400000 or p_foto !~ '^data:image/(jpeg|png|webp);base64,') then
    raise exception 'foto_invalida';
  end if;
  update profiles set nome_comentario = v_nome, foto_comentario = p_foto where id = p_id;
end $$;

create or replace function public.perfis_comentario_equipe()
returns table(id uuid, nome_comentario text, foto_comentario text)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.nome_comentario, p.foto_comentario from profiles p
  where p.papel in ('dono', 'admin', 'suporte') and eh_equipe();
$$;

revoke all on function public.salvar_perfil_comentario(uuid, text, text) from public, anon;
grant execute on function public.salvar_perfil_comentario(uuid, text, text) to authenticated;
revoke all on function public.perfis_comentario_equipe() from public, anon;
grant execute on function public.perfis_comentario_equipe() to authenticated;

-- Comentários na área de membros: resposta da equipe usa o nome e a foto de comentário, quando houver.
create or replace function public.comentarios_do_conteudo(p_aula uuid)
 returns table(id uuid, aula_id uuid, texto text, posicao_segundos integer, criado_em timestamp with time zone, autora_nome text, minha boolean, resposta_a uuid, eh_instrutor boolean, autora_foto text, autora_cor text, pendente boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select c.id,
         c.aula_id,
         c.texto,
         c.posicao_segundos,
         c.criado_em,
         case when c.nome_visivel then
           case when p.papel in ('dono','admin','suporte') then coalesce(nullif(p.nome_comentario, ''), p.nome) else p.nome end
         end,
         c.autora_id = auth.uid(),
         c.resposta_a,
         coalesce(p.papel in ('dono','admin','suporte'), false),
         case when c.nome_visivel then
           case when p.papel in ('dono','admin','suporte') then coalesce(p.foto_comentario, f.foto) else f.foto end
         end,
         case when c.nome_visivel then p.cor_nome end,
         c.status <> 'publicado'
  from comentarios c
  left join profiles p      on p.id = c.autora_id
  left join fotos_aluna f   on f.aluna_id = c.autora_id
  left join comentarios pai on pai.id = c.resposta_a
  where c.aula_id = p_aula
    and (c.status = 'publicado' or (c.autora_id = auth.uid() and c.status = 'pendente'))
    and (c.resposta_a is null or pai.status = 'publicado')
    and (pode_ver_aula(p_aula) or eh_equipe())
  order by coalesce(pai.criado_em, c.criado_em) desc,
           c.resposta_a nulls first,
           c.criado_em asc;
$function$;
